/**
 * Execution wrapper for the scheduled sync jobs.
 *
 * Responsibilities, in order:
 *   1. **Single flight** — claim the job's SyncJob row before running. Two worker
 *      replicas, or a worker plus a manual admin trigger, must never import the
 *      same window concurrently: the imports are idempotent, but concurrent
 *      tally updates on the same Theme would deadlock or double-count.
 *   2. **Lease expiry** — a process killed mid-run leaves its claim behind, so a
 *      claim older than {@link LOCK_LEASE_MS} is reclaimable. Nothing is lost:
 *      the next run re-imports the same window idempotently.
 *   3. **Observability** — every attempt writes an ImportRun row (success or
 *      failure) and refreshes the job's last-run summary for the dashboard.
 */
import { db } from "@/lib/db";
import { jobOptions, type SyncJobDefinition } from "@/lib/integration/jobs";
import type { SyncOptions, SyncResult } from "@/lib/integration/importer";

/**
 * How long a claim stays valid without finishing. The slowest job (Câmara votes
 * over a 30-day window) takes tens of minutes; four hours is comfortably beyond
 * any healthy run while still recovering from a crash within the same day.
 */
export const LOCK_LEASE_MS = 4 * 60 * 60 * 1000;

/** Outcome of {@link runJob}. */
export type JobOutcome =
  | { status: "ok"; result: SyncResult; durationMs: number }
  | { status: "skipped"; reason: "locked"; runningSince: Date | null }
  | { status: "failed"; error: string; durationMs: number };

/**
 * Run one registered job under its lock, recording the attempt.
 *
 * Returns a discriminated outcome rather than throwing, so a scheduler running
 * several jobs in sequence is never derailed by one failing source. `force`
 * bypasses the lock — for an operator who knows the holder is dead.
 */
export async function runJob(
  job: SyncJobDefinition,
  opts: SyncOptions = {},
  { force = false }: { force?: boolean } = {},
): Promise<JobOutcome> {
  const startedAt = new Date();

  // Ensure the row exists before trying to claim it. Two callers racing on the
  // first-ever run of a job both attempt the insert and one loses on the unique
  // index — that loser's row now exists, which is all this step needed.
  try {
    await db.syncJob.upsert({
      where: { name: job.name },
      create: { name: job.name },
      update: {},
    });
  } catch {
    const exists = await db.syncJob.findUnique({ where: { name: job.name }, select: { id: true } });
    if (!exists) throw new Error(`Não foi possível registrar o job ${job.name}.`);
  }

  if (!force) {
    const claimed = await claim(job.name, startedAt);
    if (!claimed) {
      const current = await db.syncJob.findUnique({
        where: { name: job.name },
        select: { runningSince: true },
      });
      return { status: "skipped", reason: "locked", runningSince: current?.runningSince ?? null };
    }
  } else {
    await db.syncJob.update({
      where: { name: job.name },
      data: { runningSince: startedAt, lastStartedAt: startedAt },
    });
  }

  const run = await db.importRun.create({
    data: { source: job.source, job: job.name, startedAt, ok: false },
    select: { id: true },
  });

  try {
    const result = await job.run(jobOptions(job, opts));
    const finishedAt = new Date();

    await db.importRun.update({
      where: { id: run.id },
      data: {
        finishedAt,
        itemsSeen: result.itemsSeen,
        itemsUpserted: result.itemsUpserted,
        ok: true,
        note: `${job.label}: ${result.itemsUpserted} registros atualizados.`,
      },
    });
    await db.syncJob.update({
      where: { name: job.name },
      data: {
        runningSince: null,
        lastFinishedAt: finishedAt,
        lastOk: true,
        lastNote: null,
        lastItemsSeen: result.itemsSeen,
        lastItemsUpserted: result.itemsUpserted,
        ...(result.watermark === undefined ? {} : { watermark: result.watermark }),
      },
    });

    return { status: "ok", result, durationMs: finishedAt.getTime() - startedAt.getTime() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finishedAt = new Date();

    await db.importRun.update({
      where: { id: run.id },
      data: { finishedAt, ok: false, note: `Falha: ${message}`.slice(0, 500) },
    });
    await db.syncJob.update({
      where: { name: job.name },
      data: {
        runningSince: null,
        lastFinishedAt: finishedAt,
        lastOk: false,
        lastNote: message.slice(0, 500),
      },
    });

    return { status: "failed", error: message, durationMs: finishedAt.getTime() - startedAt.getTime() };
  }
}

/**
 * Atomically claim the job. `updateMany` with the "idle or stale" predicate is a
 * single conditional UPDATE, so exactly one concurrent caller gets `count: 1`.
 */
async function claim(name: string, now: Date): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - LOCK_LEASE_MS);
  const { count } = await db.syncJob.updateMany({
    where: {
      name,
      OR: [{ runningSince: null }, { runningSince: { lt: staleBefore } }],
    },
    data: { runningSince: now, lastStartedAt: now },
  });
  return count === 1;
}
