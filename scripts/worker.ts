/**
 * Votto sync worker — the long-running process that keeps the federal data fresh.
 *
 * Runs every job in `src/lib/integration/jobs.ts` on its weekly slot
 * (America/São_Paulo). Started as its own container in production:
 *
 *   docker compose -f docker-compose.prod.yml up -d worker
 *
 * Behaviour:
 *   * **Catch-up on boot** — a job whose last successful run is older than
 *     {@link STALE_AFTER_DAYS} runs immediately instead of waiting up to a week.
 *     A fresh deployment therefore populates itself without manual intervention.
 *   * **Sequential execution** — jobs run one at a time even if their slots
 *     overlap, so we never open parallel connection storms against a public API.
 *   * **Failure isolation** — a failing job is logged and the loop continues to
 *     the next slot; `runJob` has already recorded the failure for the dashboard.
 *   * **Graceful shutdown** — SIGINT/SIGTERM stop the loop after the current job.
 *
 * Concurrency with other triggers (the admin panel, the cron HTTP endpoint) is
 * handled one level down, by the SyncJob lock in `runner.ts`.
 */
// Must precede every import that reads `env` at module load.
import "./load-env";
import { SYNC_JOBS, type SyncJobDefinition } from "@/lib/integration/jobs";
import { reapOrphanRuns, runJob } from "@/lib/integration/runner";
import { describeSchedule, formatZoned, nextOccurrence } from "@/lib/integration/schedule";
import { db } from "@/lib/db";

/** A job unseen for longer than this is run at startup rather than waited on. */
const STALE_AFTER_DAYS = 8;

/**
 * Longest single sleep. `setTimeout` is capped at ~24.8 days, and shorter naps
 * let the loop notice a shutdown signal promptly.
 */
const MAX_SLEEP_MS = 60 * 60 * 1000;

let stopping = false;

/** Sleep in bounded slices so shutdown is observed within the minute. */
async function sleepUntil(target: Date): Promise<void> {
  while (!stopping) {
    const remaining = target.getTime() - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, MAX_SLEEP_MS)));
  }
}

/** Timestamped log line. */
function log(message: string): void {
  console.log(`[${formatZoned(new Date())}] ${message}`);
}

/**
 * Seconds between progress lines. The heavy jobs run for tens of minutes; a
 * log that says nothing between "started" and "finished" is indistinguishable
 * from a hang, which is how an operator ends up killing a healthy import.
 */
const HEARTBEAT_SECONDS = 30;

/** Run one job and report the outcome, with a throttled progress heartbeat. */
async function execute(job: SyncJobDefinition): Promise<void> {
  log(`▶ ${job.name} — ${job.label}`);

  const startedAt = Date.now();
  let lastBeat = startedAt;
  const outcome = await runJob(job, {
    onProgress: (progress) => {
      const now = Date.now();
      if (now - lastBeat < HEARTBEAT_SECONDS * 1000) return;
      lastBeat = now;
      const secs = Math.round((now - startedAt) / 1000);
      log(`  … ${progress.note ?? `${progress.seen} itens`} (${progress.upserted} gravados, ${secs}s)`);
    },
  });

  if (outcome.status === "ok") {
    const secs = (outcome.durationMs / 1000).toFixed(1);
    log(
      `✓ ${job.name} — ${outcome.result.itemsUpserted} atualizados / ` +
        `${outcome.result.itemsSeen} vistos em ${secs}s`,
    );
  } else if (outcome.status === "skipped") {
    log(`↷ ${job.name} — já em execução desde ${outcome.runningSince ? formatZoned(outcome.runningSince) : "?"}`);
  } else {
    log(`✗ ${job.name} — falhou: ${outcome.error}`);
  }
}

/**
 * Jobs whose last successful run is missing or older than {@link STALE_AFTER_DAYS}.
 * Preserves registry order so parties are refreshed before agents on a cold start.
 */
async function staleJobs(): Promise<SyncJobDefinition[]> {
  const states = await db.syncJob.findMany({
    where: { name: { in: SYNC_JOBS.map((j) => j.name) } },
    select: { name: true, lastFinishedAt: true, lastOk: true },
  });
  const byName = new Map(states.map((s) => [s.name, s]));
  const cutoff = Date.now() - STALE_AFTER_DAYS * 86_400_000;

  return SYNC_JOBS.filter((job) => {
    const state = byName.get(job.name);
    if (!state?.lastOk || !state.lastFinishedAt) return true;
    return state.lastFinishedAt.getTime() < cutoff;
  });
}

/** Main loop: catch up, then sleep until the next scheduled slot, forever. */
async function main(): Promise<void> {
  log(`Worker iniciado — ${SYNC_JOBS.length} jobs registrados.`);
  for (const job of SYNC_JOBS) {
    log(`  · ${job.name} — ${describeSchedule(job.schedule)}`);
  }

  // A restart is proof that nothing we started is still running. Close whatever
  // the previous process left open before deciding what is stale, so a job it
  // was killed mid-run does not look busy — and does not keep its claim.
  const reaped = await reapOrphanRuns();
  if (reaped > 0) log(`${reaped} execução(ões) interrompida(s) por um reinício anterior, encerrada(s).`);

  const pending = await staleJobs();
  if (pending.length > 0) {
    log(`Recuperando ${pending.length} job(s) sem execução recente…`);
    for (const job of pending) {
      if (stopping) break;
      await execute(job);
    }
  }

  while (!stopping) {
    const now = new Date();
    const upcoming = SYNC_JOBS.map((job) => ({ job, at: nextOccurrence(job.schedule, now) })).sort(
      (a, b) => a.at.getTime() - b.at.getTime(),
    );
    const next = upcoming[0];

    log(`Próximo: ${next.job.name} em ${formatZoned(next.at)}.`);
    await sleepUntil(next.at);
    if (stopping) break;

    // Run every job whose slot has come due (slots can share a minute).
    for (const { job, at } of upcoming) {
      if (stopping) break;
      if (at.getTime() <= Date.now()) await execute(job);
    }
  }

  log("Worker encerrado.");
  await db.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1); // Second signal: give up waiting.
    stopping = true;
    log(`Sinal ${signal} recebido — encerrando após o job atual…`);
  });
}

void main().catch(async (err) => {
  console.error("Worker falhou:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
