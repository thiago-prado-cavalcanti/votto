/**
 * Official-source synchronization CLI — one command for the whole chain.
 *
 * Usage:
 *   npm run sync                              # a cadeia inteira, pulando o que está em dia
 *   npm run sync -- --dry                     # só o plano: o que rodaria e o que seria pulado
 *   npm run sync -- camara                    # só a cadeia da Câmara
 *   npm run sync -- camara:votes --days 90    # um job, sempre executado
 *   npm run sync -- --force                   # refaz tudo, ignorando lock e janela
 *
 * With no target — or with `all`, or a house — the jobs run in dependency order
 * and anything that already succeeded inside the freshness window is skipped
 * (`src/lib/integration/pipeline.ts`). Naming **one** job is an explicit
 * instruction and always runs it: that is the escape hatch, and it is what
 * `npm run summarize` relies on.
 *
 * Requires DATABASE_URL in the environment. Exits 0 when nothing failed.
 */
// Must precede every import that reads `env` at module load.
import "./load-env";
import { SYNC_JOBS, findJob, jobNames, type SyncJobDefinition } from "@/lib/integration/jobs";
import { runJob } from "@/lib/integration/runner";
import {
  FRESH_FOR_DAYS,
  orderedJobs,
  planPipeline,
  runPipeline,
  summarize,
  type PipelineStep,
} from "@/lib/integration/pipeline";
import type { SyncOptions } from "@/lib/integration/importer";
import { db } from "@/lib/db";

interface Flags {
  days?: number;
  limit?: number;
  maxAgeDays: number;
  dry: boolean;
  force: boolean;
}

/** Parse the flags, failing loudly on anything unrecognized. */
function parseArgs(argv: string[]): Flags {
  const flags: Flags = { maxAgeDays: FRESH_FOR_DAYS, dry: false, force: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.includes("=") ? arg.split(/=(.*)/s) : [arg, undefined];

    const number = (): number => {
      const raw = inline ?? argv[++i];
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) fail(`Valor inválido para ${flag}: "${raw}".`);
      return Math.floor(n);
    };

    switch (flag) {
      case "--days":
        flags.days = number();
        break;
      case "--limit":
        flags.limit = number();
        break;
      case "--max-age":
        flags.maxAgeDays = number();
        break;
      case "--dry":
        flags.dry = true;
        break;
      case "--force":
        // What an operator means by "force" is "do it anyway" — both the lock
        // and the freshness window, which are separate concerns one level down.
        flags.force = true;
        flags.maxAgeDays = 0;
        break;
      default:
        fail(`Argumento desconhecido: "${arg}".`);
    }
  }
  return flags;
}

/** Print the message with the usage block and exit with the "bad usage" code. */
function fail(message: string): never {
  console.error(message);
  usage();
  process.exit(2);
}

function usage(): void {
  console.error(
    [
      "",
      "Uso: tsx scripts/sync.ts [alvo] [opções]",
      "",
      "  alvo           (vazio) ou all   a cadeia inteira, na ordem de dependência",
      "                 camara | senado  só a cadeia daquela casa",
      "                 <job>            um job só, sempre executado",
      "",
      "  --dry          imprime o plano sem executar nada",
      `  --max-age N    dias de frescor (padrão: ${FRESH_FOR_DAYS}); 0 executa tudo`,
      "  --days N       janela de importação, nos jobs que têm uma",
      "  --limit N      teto de registros por job (teste rápido)",
      "  --force        ignora locks e a janela de frescor",
      "",
      `  Jobs: ${jobNames().join(", ")}`,
      "",
    ].join("\n"),
  );
}

/** `1h 04m 12s`, for durations that legitimately run into hours. */
function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** The jobs a target selects, in dependency order, or null if it names nothing. */
function selectTarget(target: string): { jobs: SyncJobDefinition[]; whole: boolean } | null {
  const key = target.trim().toLowerCase();
  if (key === "" || key === "all") return { jobs: orderedJobs(), whole: true };

  const bySource = SYNC_JOBS.filter((j) => j.name.startsWith(`${key}:`));
  if (bySource.length > 0) return { jobs: orderedJobs(bySource), whole: true };

  const job = findJob(key);
  return job ? { jobs: [job], whole: false } : null;
}

/** Seconds between progress lines, so a long job does not flood the log. */
const HEARTBEAT_SECONDS = 20;

/** Run one named job on its own, outside the chain's freshness rules. */
async function runSingle(job: SyncJobDefinition, flags: Flags): Promise<number> {
  const opts: SyncOptions = {};
  if (flags.days !== undefined && job.defaults.days !== undefined) opts.days = flags.days;
  if (flags.limit !== undefined) opts.limit = flags.limit;

  console.log(`▶ ${job.name} — ${job.label}…`);
  const startedAt = Date.now();
  let lastBeat = startedAt;
  opts.onProgress = (progress) => {
    const now = Date.now();
    if (now - lastBeat < HEARTBEAT_SECONDS * 1000) return;
    lastBeat = now;
    console.log(`      … ${progress.note ?? `${progress.seen} itens`} (${progress.upserted} gravados)`);
  };

  const outcome = await runJob(job, opts, { force: flags.force });
  if (outcome.status === "ok") {
    console.log(
      `  ✓ ${outcome.result.itemsUpserted} atualizados / ${outcome.result.itemsSeen} vistos ` +
        `em ${formatDuration(outcome.durationMs)}`,
    );
    return 0;
  }
  if (outcome.status === "skipped") {
    console.warn("  ↷ já em execução (use --force para ignorar o lock).");
    return 1;
  }
  console.error(`  ✗ falhou: ${outcome.error}`);
  return 1;
}

/** Mark for each outcome, so a long run scans in one column. */
const MARKS: Record<PipelineStep["status"], string> = {
  ok: "✓",
  fresh: "↷",
  blocked: "⏸",
  locked: "⏸",
  failed: "✗",
};

/** Run the chain, printing each decision as it is taken. */
async function runChain(jobs: SyncJobDefinition[], flags: Flags): Promise<number> {
  const only = jobs.map((j) => j.name);

  if (flags.dry) {
    const plan = await planPipeline({ only, maxAgeDays: flags.maxAgeDays });
    console.log(`▶ Plano — ${plan.length} job(s), frescor de ${flags.maxAgeDays} dia(s)\n`);
    for (const [i, step] of plan.entries()) {
      const mark = step.action === "run" ? "▶" : "↷";
      const verb = step.action === "run" ? "executa" : "pula";
      console.log(`  ${mark} [${String(i + 1).padStart(2)}] ${step.job.name.padEnd(17)} ${verb} — ${step.reason}`);
    }
    const due = plan.filter((s) => s.action === "run").length;
    console.log(`\n  ${due} a executar · ${plan.length - due} em dia. (--dry: nada foi executado)`);
    return 0;
  }

  console.log(`▶ Sincronização — ${jobs.length} job(s) na cadeia, frescor de ${flags.maxAgeDays} dia(s)`);
  console.log("  Interromper e rodar de novo é seguro: tudo é idempotente.\n");

  let startedAt = Date.now();
  let lastBeat = startedAt;

  const report = await runPipeline({
    only,
    maxAgeDays: flags.maxAgeDays,
    days: flags.days,
    limit: flags.limit,
    force: flags.force,
    onStep: (step, index, total) => {
      if (step.action !== "run") return;
      startedAt = Date.now();
      lastBeat = startedAt;
      console.log(`[${index + 1}/${total}] ▶ ${step.job.name} — ${step.job.label} (${step.reason})`);
    },
    onProgress: (_job, progress) => {
      const now = Date.now();
      if (now - lastBeat < HEARTBEAT_SECONDS * 1000) return;
      lastBeat = now;
      console.log(
        `        … ${progress.note ?? `${progress.seen} itens`} ` +
          `(${progress.upserted} gravados, ${formatDuration(now - startedAt)})`,
      );
    },
    onDone: (step, index, total) => {
      const mark = MARKS[step.status] ?? "·";
      if (step.status === "ok") {
        console.log(
          `        ${mark} ${step.itemsUpserted.toLocaleString("pt-BR")} gravados / ` +
            `${step.itemsSeen.toLocaleString("pt-BR")} vistos em ${formatDuration(step.durationMs)}`,
        );
      } else if (step.status === "fresh") {
        console.log(`[${index + 1}/${total}] ${mark} ${step.name.padEnd(17)} em dia — ${step.reason}`);
      } else if (step.status === "failed") {
        console.error(`        ${mark} falhou: ${step.reason}`);
      } else {
        console.warn(`[${index + 1}/${total}] ${mark} ${step.name.padEnd(17)} adiado — ${step.reason}`);
      }
    },
  });

  if (report.status === "locked") {
    console.error(
      "\n✗ Outra sincronização já está em andamento" +
        `${report.runningSince ? ` desde ${report.runningSince.toISOString()}` : ""}. ` +
        "Use --force se o processo anterior morreu.",
    );
    return 1;
  }

  console.log(`\n${"─".repeat(68)}`);
  console.log(`${report.interrupted ? "⏹" : report.failed === 0 ? "✓" : "⚠"} ${summarize(report)}`);
  console.log(`  Duração total: ${formatDuration(report.durationMs)}.`);
  if (report.failed > 0 || report.blocked > 0) {
    console.log("  Rode de novo: o que concluiu não será refeito, o que faltou será tentado.");
  }
  return report.failed > 0 ? 1 : 0;
}

/** Entry point: resolve the target, run it, exit with the right code. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "--help" || argv[0] === "-h") {
    usage();
    process.exit(0);
  }

  // A leading token that is not a flag is the target; otherwise the whole chain.
  const target = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
  const selection = selectTarget(target);
  if (!selection) {
    console.error(`Job desconhecido: "${target}".`);
    usage();
    process.exit(2);
  }

  const flags = parseArgs(target ? argv.slice(1) : argv);
  const failures = selection.whole
    ? await runChain(selection.jobs, flags)
    : await runSingle(selection.jobs[0], flags);

  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch(async (err) => {
  console.error("Falha inesperada:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
