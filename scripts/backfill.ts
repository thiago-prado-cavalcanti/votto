/**
 * Historical backfill of the federal data.
 *
 * Runs every registered sync job in dependency order over a wide window — the
 * one-off load you do when standing an environment up, as opposed to the weekly
 * worker that only keeps it current.
 *
 *   npm run backfill                      # 6 meses, modo curado (recomendado)
 *   npm run backfill -- --mode=full       # 6 meses, varredura completa
 *   npm run backfill -- --months 12 --top 200
 *   npm run backfill -- --source camara --force
 *
 * ## The two modes, and why the default is not "everything"
 *
 * `agenda` (default) imports the bills that were actually **tabled for a floor
 * vote** or **voted**, plus the full roster of parties and legislators. Over six
 * months that is a few hundred bills for a few hundred requests.
 *
 * `full` additionally sweeps every policy bill that moved at all in the window.
 * For the Câmara that is ~12,300 bills over six months — roughly 25,000 requests
 * and one to two hours — most of them proposals that were filed, moved once and
 * will never be voted. Useful for completeness, wasteful as a first load.
 *
 * Neither house publishes a relevance ranking, and the Câmara's `/proposicoes`
 * endpoint silently ignores `codSituacao`, so "the important ones" cannot be
 * asked for directly. The floor agenda is the closest thing that exists, and it
 * is what `agenda` mode reads.
 *
 * Safe to interrupt and re-run: every import is idempotent, and each job takes
 * its own lock, so this never collides with the worker.
 */
import { SYNC_JOBS, type SyncJobDefinition } from "@/lib/integration/jobs";
import { runJob } from "@/lib/integration/runner";
import type { SyncOptions } from "@/lib/integration/importer";
import { db } from "@/lib/db";

/** Jobs that sweep every bill in the window — skipped unless `--mode=full`. */
const BROAD_SWEEP_JOBS = new Set(["camara:themes", "senado:themes"]);

/** Minimum seconds between heartbeat lines, so a long job doesn't flood the log. */
const HEARTBEAT_SECONDS = 20;

interface Options {
  days: number;
  mode: "agenda" | "full";
  /** Cap on bills kept by the agenda jobs (their ranking decides which). */
  top?: number;
  source?: "camara" | "senado";
  force: boolean;
}

/** Parse argv, failing loudly on anything unrecognized. */
function parseArgs(argv: string[]): Options {
  const opts: Options = { days: 180, mode: "agenda", force: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s) : [arg, undefined];
    const value = inlineValue ?? argv[i + 1];
    const consume = () => {
      if (inlineValue === undefined) i++;
    };

    switch (flag) {
      case "--months": {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) fail(`Valor inválido para --months: "${value}".`);
        opts.days = Math.round(n * 30);
        consume();
        break;
      }
      case "--days": {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) fail(`Valor inválido para --days: "${value}".`);
        opts.days = Math.floor(n);
        consume();
        break;
      }
      case "--top": {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) fail(`Valor inválido para --top: "${value}".`);
        opts.top = Math.floor(n);
        consume();
        break;
      }
      case "--mode": {
        if (value !== "agenda" && value !== "full") {
          fail(`Modo inválido: "${value}". Use agenda ou full.`);
        }
        opts.mode = value;
        consume();
        break;
      }
      case "--source": {
        if (value !== "camara" && value !== "senado") {
          fail(`Fonte inválida: "${value}". Use camara ou senado.`);
        }
        opts.source = value;
        consume();
        break;
      }
      case "--force":
        opts.force = true;
        break;
      case "--help":
      case "-h":
        usage();
        process.exit(0);
        break;
      default:
        fail(`Argumento desconhecido: "${arg}".`);
    }
  }
  return opts;
}

/** Print the message and exit with the "bad usage" code. */
function fail(message: string): never {
  console.error(message);
  usage();
  process.exit(2);
}

function usage(): void {
  console.error(
    [
      "",
      "Uso: tsx scripts/backfill.ts [opções]",
      "",
      "  --months N     Janela em meses (padrão: 6)",
      "  --days N       Janela em dias (tem precedência sobre --months)",
      "  --mode MODO    agenda (padrão) = só o que foi pautado/votado",
      "                 full            = varre todas as proposições da janela",
      "  --top N        Limita as proposições de pauta às N mais relevantes",
      "  --source S     camara ou senado (padrão: ambos)",
      "  --force        Ignora o lock dos jobs",
      "",
    ].join("\n"),
  );
}

/** The jobs this run will execute, in registry (dependency) order. */
function selectJobs(opts: Options): SyncJobDefinition[] {
  return SYNC_JOBS.filter((job) => {
    if (opts.source && !job.name.startsWith(`${opts.source}:`)) return false;
    if (opts.mode === "agenda" && BROAD_SWEEP_JOBS.has(job.name)) return false;
    return true;
  });
}

/** Per-job options: the wide window for time-bounded jobs, the cap for agenda jobs. */
function optionsFor(job: SyncJobDefinition, opts: Options): SyncOptions {
  const out: SyncOptions = {};
  // Only jobs that declare a default window are time-bounded; parties and agents
  // always import the full current roster.
  if (job.defaults.days !== undefined) out.days = opts.days;
  if (opts.top !== undefined && job.name.endsWith(":agenda")) out.limit = opts.top;
  return out;
}

/** `1h 04m 12s`, for durations that can legitimately run into hours. */
function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

interface JobOutcomeRow {
  job: string;
  status: "ok" | "skipped" | "failed";
  seen: number;
  upserted: number;
  durationMs: number;
  detail?: string;
}

/** Run one job with a throttled heartbeat, returning a summary row. */
async function execute(
  job: SyncJobDefinition,
  opts: Options,
  index: number,
  total: number,
): Promise<JobOutcomeRow> {
  const jobOpts = optionsFor(job, opts);
  const window = jobOpts.days ? ` · janela ${jobOpts.days}d` : "";
  const cap = jobOpts.limit ? ` · top ${jobOpts.limit}` : "";
  console.log(`\n[${index}/${total}] ▶ ${job.name} — ${job.label}${window}${cap}`);

  const startedAt = Date.now();
  let lastBeat = startedAt;
  jobOpts.onProgress = (progress) => {
    const now = Date.now();
    if (now - lastBeat < HEARTBEAT_SECONDS * 1000) return;
    lastBeat = now;
    console.log(
      `      … ${progress.note ?? `${progress.seen} itens`} ` +
        `(${progress.upserted} gravados, ${formatDuration(now - startedAt)})`,
    );
  };

  const outcome = await runJob(job, jobOpts, { force: opts.force });

  if (outcome.status === "ok") {
    console.log(
      `      ✓ ${outcome.result.itemsUpserted} gravados / ${outcome.result.itemsSeen} vistos ` +
        `em ${formatDuration(outcome.durationMs)}`,
    );
    return {
      job: job.name,
      status: "ok",
      seen: outcome.result.itemsSeen,
      upserted: outcome.result.itemsUpserted,
      durationMs: outcome.durationMs,
    };
  }

  if (outcome.status === "skipped") {
    console.warn("      ↷ já em execução — use --force se o processo anterior morreu.");
    return { job: job.name, status: "skipped", seen: 0, upserted: 0, durationMs: 0 };
  }

  console.error(`      ✗ falhou: ${outcome.error}`);
  return {
    job: job.name,
    status: "failed",
    seen: 0,
    upserted: 0,
    durationMs: outcome.durationMs,
    detail: outcome.error,
  };
}

/** Print the plan, run every selected job in order, then summarize. */
async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const jobs = selectJobs(opts);

  console.log("▶ Backfill das fontes oficiais");
  console.log(`  Janela:  ${opts.days} dias (~${(opts.days / 30).toFixed(1)} meses)`);
  console.log(`  Modo:    ${opts.mode}${opts.mode === "agenda" ? " (só o que foi pautado ou votado)" : " (varredura completa)"}`);
  if (opts.top) console.log(`  Limite:  top ${opts.top} proposições por casa`);
  console.log(`  Jobs:    ${jobs.length} — ${jobs.map((j) => j.name).join(", ")}`);
  if (opts.mode === "full") {
    console.log(
      "  ⚠ O modo full varre toda proposição que tramitou na janela " +
        "(~12 mil na Câmara em 6 meses). Pode levar 1–2 horas.",
    );
  }
  console.log("  Interromper e rodar de novo é seguro: tudo é idempotente.");

  const startedAt = Date.now();
  const rows: JobOutcomeRow[] = [];
  for (const [i, job] of jobs.entries()) {
    rows.push(await execute(job, opts, i + 1, jobs.length));
  }

  const failed = rows.filter((r) => r.status !== "ok");
  const totalUpserted = rows.reduce((sum, r) => sum + r.upserted, 0);

  console.log(`\n${"─".repeat(64)}`);
  for (const row of rows) {
    const mark = row.status === "ok" ? "✓" : row.status === "skipped" ? "↷" : "✗";
    const detail =
      row.status === "ok"
        ? `${row.upserted} gravados em ${formatDuration(row.durationMs)}`
        : (row.detail ?? row.status);
    console.log(`  ${mark} ${row.job.padEnd(16)} ${detail}`);
  }
  console.log(`${"─".repeat(64)}`);
  console.log(
    `${failed.length === 0 ? "✓" : "⚠"} ${totalUpserted.toLocaleString("pt-BR")} registros gravados ` +
      `em ${formatDuration(Date.now() - startedAt)}` +
      `${failed.length > 0 ? ` — ${failed.length} job(s) com problema` : ""}.`,
  );
  if (failed.length > 0) {
    console.log("  Rode de novo: os jobs concluídos não serão refeitos do zero (upserts idempotentes).");
  }

  await db.$disconnect();
  process.exit(failed.length === 0 ? 0 : 1);
}

void main().catch(async (err) => {
  console.error("Falha inesperada:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
