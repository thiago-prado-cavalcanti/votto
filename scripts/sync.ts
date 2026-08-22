/**
 * Official-source synchronization CLI.
 *
 * Usage:
 *   tsx scripts/sync.ts <job|all> [--days N] [--limit N] [--force]
 *
 * Examples:
 *   tsx scripts/sync.ts all                      # full federal refresh
 *   tsx scripts/sync.ts camara:votes --days 90   # backfill three months of roll calls
 *   tsx scripts/sync.ts senado:agents --limit 5  # quick smoke test
 *
 * `--force` ignores the SyncJob lock; use it only when you know the previous
 * holder is dead. Requires DATABASE_URL in the environment. Exits 0 when every
 * requested job succeeded, 1 otherwise.
 */
// Must precede every import that reads `env` at module load.
import "./load-env";
import { SYNC_JOBS, findJob, jobNames, type SyncJobDefinition } from "@/lib/integration/jobs";
import { runJob } from "@/lib/integration/runner";
import type { SyncOptions } from "@/lib/integration/importer";
import { db } from "@/lib/db";

/** Parse `--days`/`--limit`/`--force` flags from argv. */
function parseArgs(argv: string[]): { opts: SyncOptions; force: boolean } {
  const opts: SyncOptions = {};
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--days" || arg === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Valor inválido para ${arg}: "${argv[i]}".`);
        process.exit(2);
      }
      if (arg === "--days") opts.days = Math.floor(n);
      else opts.limit = Math.floor(n);
    } else if (arg === "--force") {
      force = true;
    } else {
      console.error(`Argumento desconhecido: "${arg}".`);
      process.exit(2);
    }
  }
  return { opts, force };
}

/** Resolve the target argument to the list of jobs to run, in registry order. */
function selectJobs(target: string): SyncJobDefinition[] {
  const key = target.trim().toLowerCase();
  if (key === "all") return SYNC_JOBS;
  // A bare source name runs every job of that source, e.g. `camara`.
  const bySource = SYNC_JOBS.filter((j) => j.name.startsWith(`${key}:`));
  if (bySource.length > 0) return bySource;

  const job = findJob(key);
  return job ? [job] : [];
}

/** Entry point: select jobs, run them sequentially, print a summary. */
async function main(): Promise<void> {
  const [, , target, ...rest] = process.argv;

  if (!target || target === "--help" || target === "-h") {
    console.error("Uso: tsx scripts/sync.ts <job|all> [--days N] [--limit N] [--force]");
    console.error(`Jobs: ${jobNames().join(", ")}, all`);
    process.exit(target ? 0 : 2);
  }

  const jobs = selectJobs(target);
  if (jobs.length === 0) {
    console.error(`Job desconhecido: "${target}".`);
    console.error(`Jobs disponíveis: ${jobNames().join(", ")}, all`);
    process.exit(2);
  }

  const { opts, force } = parseArgs(rest);
  let failures = 0;

  for (const job of jobs) {
    console.log(`▶ ${job.name} — ${job.label}…`);
    const outcome = await runJob(job, opts, { force });

    if (outcome.status === "ok") {
      console.log(
        `  ✓ ${outcome.result.itemsUpserted} atualizados / ${outcome.result.itemsSeen} vistos ` +
          `em ${(outcome.durationMs / 1000).toFixed(1)}s`,
      );
    } else if (outcome.status === "skipped") {
      console.warn("  ↷ já em execução (use --force para ignorar o lock).");
      failures++;
    } else {
      console.error(`  ✗ falhou: ${outcome.error}`);
      failures++;
    }
  }

  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch(async (err) => {
  console.error("Falha inesperada:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
