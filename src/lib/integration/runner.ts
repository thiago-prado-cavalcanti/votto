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

/** SyncJob row that holds the whole-chain lock (`pipeline.ts`). Not a registered job. */
export const PIPELINE_JOB = "pipeline";

/**
 * Lease for the chain lock. Longer than a single job's, because the chain is the
 * sum of them: a cold start that imports both houses' rosters, bills, roll calls,
 * mandates and quotas runs for hours, and a four-hour lease would declare a
 * healthy run dead halfway through and let a second one start beside it.
 */
export const PIPELINE_LEASE_MS = 12 * 60 * 60 * 1000;

/** Outcome of {@link runJob}. */
export type JobOutcome =
  | { status: "ok"; result: SyncResult; durationMs: number }
  | { status: "skipped"; reason: "locked"; runningSince: Date | null }
  | { status: "failed"; error: string; durationMs: number };

/**
 * Close runs whose process is gone, and release the locks they were holding.
 *
 * `finishedAt` is written by the success path and by the failure path, and both
 * require the process to still be alive. A container that is restarted mid-run —
 * a deploy, an OOM kill, a SIGKILL — leaves the `ImportRun` row open forever and
 * the job's claim standing until its lease runs out.
 *
 * That is not cosmetic. The panel then reports "Em andamento" for something that
 * died hours ago, so an operator cannot tell a live import from a corpse; and
 * because the claim survives, the next legitimate attempt is refused until the
 * lease expires, at which point another run starts and can be killed the same
 * way. Five deploys in one afternoon left three overlapping "Em andamento" rows
 * for `camara:expenses`, a job that takes about forty minutes.
 *
 * Anything still open past the lease is therefore declared interrupted. The
 * lease is the same clock the claim uses, so this never touches a healthy run:
 * a job that has not finished within four hours is not going to.
 *
 * Cheap enough to call before every claim, which is also the only way a web
 * process ever notices — nothing else runs on boot there.
 */
export async function reapOrphanRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - LOCK_LEASE_MS);

  const { count } = await db.importRun.updateMany({
    where: { finishedAt: null, startedAt: { lt: cutoff } },
    data: {
      finishedAt: new Date(),
      ok: false,
      note: "Interrompida: o processo foi encerrado antes de concluir (deploy ou reinício).",
    },
  });

  // Release claims the dead runs were holding, so the next attempt is not
  // refused by a lock nobody is behind. The chain row is swept on its own,
  // longer lease — reaping it at four hours would cut a legitimate cold start.
  await db.syncJob.updateMany({
    where: { name: { not: PIPELINE_JOB }, runningSince: { lt: cutoff } },
    data: { runningSince: null },
  });
  await db.syncJob.updateMany({
    where: { name: PIPELINE_JOB, runningSince: { lt: new Date(Date.now() - PIPELINE_LEASE_MS) } },
    data: { runningSince: null },
  });

  return count;
}

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

  // Sweep corpses before claiming: without this a job killed by a deploy holds
  // its claim until the lease expires, and the panel calls it "Em andamento".
  await reapOrphanRuns();

  await ensureJobRow(job.name);

  if (!force) {
    const claimed = await claimJob(job.name, startedAt);
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
 * Make sure a lock row exists before anyone tries to claim it.
 *
 * Two callers racing on the first-ever run of a job both attempt the insert and
 * one loses on the unique index — that loser's row now exists, which is all this
 * step needed.
 */
export async function ensureJobRow(name: string): Promise<void> {
  try {
    await db.syncJob.upsert({ where: { name }, create: { name }, update: {} });
  } catch {
    const exists = await db.syncJob.findUnique({ where: { name }, select: { id: true } });
    if (!exists) throw new Error(`Não foi possível registrar o job ${name}.`);
  }
}

/**
 * Atomically claim a lock row. `updateMany` with the "idle or stale" predicate is
 * a single conditional UPDATE, so exactly one concurrent caller gets `count: 1`.
 *
 * Used for a registered job and for the chain row alike — they differ only in
 * how long a claim stays valid.
 */
export async function claimJob(
  name: string,
  now: Date,
  leaseMs: number = LOCK_LEASE_MS,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - leaseMs);
  const { count } = await db.syncJob.updateMany({
    where: {
      name,
      OR: [{ runningSince: null }, { runningSince: { lt: staleBefore } }],
    },
    data: { runningSince: now, lastStartedAt: now },
  });
  return count === 1;
}
