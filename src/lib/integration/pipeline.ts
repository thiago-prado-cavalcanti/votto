/**
 * The synchronization chain — every registered job, once, in dependency order.
 *
 * The registry (`jobs.ts`) describes *what* each job imports; this module owns
 * *when* it is worth running. The split exists because the jobs are not as
 * independent as a per-job schedule implied: `camara:expenses` reads the
 * legislatures `camara:mandate` writes, `metrics:quality` ranks a cohort whose
 * roll calls the vote jobs supply, and every theme import resolves its author
 * against the agent roster. Sixteen slots firing on their own clocks meant a job
 * could finish ahead of the one it reads from, and the result was not a failure —
 * it was a quietly incomplete record: bills with no author, a cost pillar
 * computed from a single legislature, an index ranked over half a cohort.
 *
 * So there is one entry point, and it does three things:
 *
 *   1. **Orders** the jobs by their declared dependencies (`after` / `needs`),
 *      stable against registry order, so the chain runs the same way from the
 *      CLI, the worker, the HTTP trigger and the admin panel.
 *   2. **Skips what is already current.** A job that succeeded inside
 *      {@link FRESH_FOR_DAYS} is not run again: the houses publish daily, and
 *      re-importing a window nobody has touched costs thousands of requests to
 *      write rows that are already there.
 *   3. **Notices when "current" stops being true.** Freshness on its own would
 *      be wrong for a dependent job — if the vote import runs today, an index
 *      that ran yesterday is stale *despite being one day old*. A job whose
 *      dependency finished after its own last success is therefore never fresh,
 *      which is what makes the chain converge in one pass instead of leaving the
 *      tail a week behind the head.
 *
 * Failure is contained rather than fatal. `after` is ordering only — the jobs
 * create what they are missing (an agent job creates a missing party, a vote job
 * a missing agent), so a failed step degrades detail and the chain carries on.
 * `needs` is the exception, reserved for a job that would write a *wrong* answer
 * from a dependency's absence rather than merely an incomplete one; its
 * dependents are held back and reported, and the next run picks them up because
 * a job that did not run never became fresh.
 */
import { db } from "@/lib/db";
import { SYNC_JOBS, type SyncJobDefinition } from "@/lib/integration/jobs";
import {
  PIPELINE_JOB,
  claimJob,
  ensureJobRow,
  reapOrphanRuns,
  runJob,
  PIPELINE_LEASE_MS,
} from "@/lib/integration/runner";
import type { SyncOptions, SyncProgress } from "@/lib/integration/importer";
import { formatZoned } from "@/lib/integration/schedule";
import { ImportSource } from "@/generated/prisma";

/**
 * How long a successful run keeps a job out of the chain.
 *
 * Seven days is the cadence the sources justify — both houses refresh daily but
 * the legislative week is the unit anything actually changes in — and it is what
 * makes the chain safe to trigger by hand: an operator who runs it twice in an
 * afternoon pays for the second run only where something moved.
 */
export const FRESH_FOR_DAYS = 7;

/** What happened to one job in a chain run. */
export type StepStatus =
  /** Ran to completion. */
  | "ok"
  /** Skipped: succeeded recently enough, and nothing upstream has moved since. */
  | "fresh"
  /** Skipped: a `needs` dependency did not produce data this run. */
  | "blocked"
  /** Skipped: something else holds this job's own lock right now. */
  | "locked"
  /** Ran and threw. */
  | "failed";

/** A decision taken about one job, before it runs. */
export interface PlannedStep {
  job: SyncJobDefinition;
  action: "run" | "skip";
  status: Extract<StepStatus, "ok" | "fresh" | "blocked">;
  /** One PT-BR line explaining the decision, for the CLI and the panel. */
  reason: string;
}

/** The outcome of one job in a chain run. */
export interface PipelineStep {
  name: string;
  label: string;
  status: StepStatus;
  reason: string;
  itemsSeen: number;
  itemsUpserted: number;
  durationMs: number;
}

/** The outcome of a whole chain run. */
export interface PipelineReport {
  /** `locked` means another chain run holds the lock and this one did nothing. */
  status: "ok" | "partial" | "locked";
  steps: PipelineStep[];
  ran: number;
  skipped: number;
  blocked: number;
  failed: number;
  itemsUpserted: number;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  /** Set when `status` is `locked`: since when, as far as we can tell. */
  runningSince?: Date | null;
  /**
   * The chain stood down before reaching the end — an operator released its
   * claim, or the worker is shutting down. The jobs it never got to are simply
   * still not fresh, so the next run picks them up.
   */
  interrupted: boolean;
}

/** Knobs the four entry points share. */
export interface PipelineOptions {
  /** Restrict the chain to these job names (dependency order is preserved). */
  only?: string[];
  /**
   * Age past which a job is no longer fresh. `0` runs every selected job.
   * Orthogonal to {@link PipelineOptions.force}, which is about locks — a caller
   * that means "redo everything" passes both.
   */
  maxAgeDays?: number;
  /** Look-back override, applied to the jobs that declare a window. */
  days?: number;
  /** Soft cap on records per job, for smoke tests. */
  limit?: number;
  /** Ignore the chain lock and every job lock. Only when the holder is dead. */
  force?: boolean;
  /**
   * The stamp {@link claimPipeline} returned, when the caller claimed the lock
   * itself. Carried through rather than re-derived because it is the run's
   * identity: releasing that exact claim is what interrupts this run and only
   * this run.
   */
  claimedAt?: Date;
  /** Called with each decision just before it is acted on. */
  onStep?: (step: PlannedStep, index: number, total: number) => void;
  /** Called with each outcome. */
  onDone?: (step: PipelineStep, index: number, total: number) => void;
  /** Progress heartbeat from inside a running job. */
  onProgress?: (job: SyncJobDefinition, progress: SyncProgress) => void;
  /**
   * Asked before each step. Returning true stops the chain cleanly between jobs
   * — how the worker honours SIGTERM without abandoning an import mid-write.
   */
  shouldStop?: () => boolean;
}

/** Persisted state of a job, as the chain needs to read it. */
export interface JobState {
  lastOk: boolean;
  lastFinishedAt: Date | null;
}

// ─── Ordering ────────────────────────────────────────────────────────────────

/** Every job this one must not run before, hard and soft dependencies alike. */
export function jobDependencies(job: SyncJobDefinition): string[] {
  return [...(job.needs ?? []), ...(job.after ?? [])];
}

/**
 * The selected jobs in dependency order, stable against registry order.
 *
 * Stability matters: two jobs with no relation between them (the two houses'
 * party imports, say) must come out in the order the registry lists them, so the
 * chain reads the same as the file and a reviewer can check one against the other.
 *
 * Dependencies outside the selection are ignored rather than pulled in — asking
 * for `camara` should run the Câmara's jobs, not quietly drag the Senado along.
 * Ordering inside the selection is still honoured.
 *
 * Throws on an unknown dependency name or a cycle: both are typos in the
 * registry, and a chain that silently reordered itself around one would be worse
 * than a chain that refuses to start.
 */
export function orderedJobs(jobs: SyncJobDefinition[] = SYNC_JOBS): SyncJobDefinition[] {
  const registered = new Set(SYNC_JOBS.map((j) => j.name));
  for (const job of jobs) {
    for (const dep of jobDependencies(job)) {
      if (!registered.has(dep)) {
        throw new Error(`Job "${job.name}" depende de "${dep}", que não existe no registro.`);
      }
    }
  }

  const selected = new Set(jobs.map((j) => j.name));
  const emitted = new Set<string>();
  const ordered: SyncJobDefinition[] = [];
  const pending = [...jobs];

  // One job at a time, always the earliest one whose dependencies are satisfied
  // — rather than a whole ready "layer" at once, which would reorder unrelated
  // jobs across layer boundaries. Emitting singly means a registry already in a
  // valid order comes out *exactly* as written, and the sort only intervenes
  // where the file is actually wrong. Sixteen jobs; the quadratic scan is free.
  while (pending.length > 0) {
    const index = pending.findIndex((job) =>
      jobDependencies(job).every((dep) => !selected.has(dep) || emitted.has(dep)),
    );
    if (index === -1) {
      throw new Error(`Ciclo de dependências entre: ${pending.map((j) => j.name).join(", ")}.`);
    }
    const [job] = pending.splice(index, 1);
    ordered.push(job);
    emitted.add(job.name);
  }

  return ordered;
}

/**
 * Resolve a CLI/HTTP target to a set of jobs: `all`, a source prefix
 * (`camara`), or a single job name. Returns an empty array for anything else.
 */
export function selectJobs(target: string): SyncJobDefinition[] {
  const key = target.trim().toLowerCase();
  if (key === "all" || key === "") return orderedJobs();

  const bySource = SYNC_JOBS.filter((j) => j.name.startsWith(`${key}:`));
  if (bySource.length > 0) return orderedJobs(bySource);

  const job = SYNC_JOBS.find((j) => j.name === key);
  return job ? [job] : [];
}

// ─── Deciding ────────────────────────────────────────────────────────────────

/** `há 3 dias` / `há 5 horas` / `há 12 minutos`, for a decision line. */
function describeAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `há ${Math.max(minutes, 1)} minuto${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} hora${hours === 1 ? "" : "s"}`;
  return `há ${Math.floor(hours / 24)} dias`;
}

/**
 * Whether to run one job, given what is stored and what has happened so far.
 *
 * The three "run" cases are, in order of how often they fire: never succeeded,
 * older than the window, and — the one the per-job schedules could not express —
 * a dependency that finished *after* this job last did. That last clause is what
 * carries a fresh import down the chain in a single pass: the vote job writing
 * today makes the index stale today, not next Sunday.
 *
 * Exported because it *is* the rule, and `npm run check:sources` asserts it
 * without a database — every input is a parameter.
 */
export function decide(
  job: SyncJobDefinition,
  state: Map<string, JobState>,
  outcomes: Map<string, StepStatus>,
  maxAgeMs: number,
  now: Date,
): PlannedStep {
  const blockedBy = (job.needs ?? []).filter((dep) => {
    const status = outcomes.get(dep);
    return status === "failed" || status === "blocked" || status === "locked";
  });
  if (blockedBy.length > 0) {
    return {
      job,
      action: "skip",
      status: "blocked",
      reason: `depende de ${blockedBy.join(", ")}, que não concluiu nesta execução`,
    };
  }

  const own = state.get(job.name);
  if (!own?.lastOk || !own.lastFinishedAt) {
    return { job, action: "run", status: "ok", reason: "nunca concluído com sucesso" };
  }
  if (maxAgeMs <= 0) {
    return { job, action: "run", status: "ok", reason: "atualização completa solicitada" };
  }

  const age = now.getTime() - own.lastFinishedAt.getTime();
  if (age >= maxAgeMs) {
    return { job, action: "run", status: "ok", reason: `última conclusão ${describeAge(age)}` };
  }

  // A dependency that finished later than we did means our inputs changed since
  // the last time we ran, which is exactly the case a plain age check misses.
  const moved = jobDependencies(job).filter((dep) => {
    const upstream = state.get(dep);
    return (
      upstream?.lastOk &&
      upstream.lastFinishedAt !== null &&
      upstream.lastFinishedAt.getTime() > own.lastFinishedAt!.getTime()
    );
  });
  if (moved.length > 0) {
    return { job, action: "run", status: "ok", reason: `${moved.join(", ")} trouxe dados novos` };
  }

  return { job, action: "skip", status: "fresh", reason: `concluído ${describeAge(age)}` };
}

/** Read the persisted state of every job, keyed by name. */
async function loadState(names: string[]): Promise<Map<string, JobState>> {
  const rows = await db.syncJob.findMany({
    where: { name: { in: names } },
    select: { name: true, lastOk: true, lastFinishedAt: true },
  });
  return new Map(rows.map((r) => [r.name, { lastOk: r.lastOk, lastFinishedAt: r.lastFinishedAt }]));
}

/**
 * What a chain run would do right now, without doing it.
 *
 * Assumes every job succeeds, so `blocked` never appears here — a plan can only
 * show what is current and what is due. Drives `sync --dry` and the panel.
 */
export async function planPipeline(opts: PipelineOptions = {}): Promise<PlannedStep[]> {
  const jobs = resolveSelection(opts.only);
  const names = [...new Set(jobs.flatMap((j) => [j.name, ...jobDependencies(j)]))];
  const state = await loadState(names);
  const maxAgeMs = (opts.maxAgeDays ?? FRESH_FOR_DAYS) * 86_400_000;
  const now = new Date();

  return jobs.map((job) => decide(job, state, new Map(), maxAgeMs, now));
}

/** The jobs a run covers: the named subset in dependency order, or everything. */
function resolveSelection(only?: string[]): SyncJobDefinition[] {
  if (!only || only.length === 0) return orderedJobs();
  const wanted = new Set(only.map((n) => n.trim().toLowerCase()));
  const jobs = SYNC_JOBS.filter((j) => wanted.has(j.name));
  const missing = [...wanted].filter((n) => !jobs.some((j) => j.name === n));
  if (missing.length > 0) throw new Error(`Job desconhecido: ${missing.join(", ")}.`);
  return orderedJobs(jobs);
}

// ─── Running ─────────────────────────────────────────────────────────────────

/**
 * Claim the chain lock, so two chain runs never interleave.
 *
 * Separate from {@link runPipeline} for the admin panel, which has to know the
 * run started *before* it answers the browser — it claims here, returns "em
 * execução", and does the work after the response.
 */
export async function claimPipeline(now: Date = new Date(), force = false): Promise<Date | null> {
  await ensureJobRow(PIPELINE_JOB);
  if (force) {
    await db.syncJob.update({
      where: { name: PIPELINE_JOB },
      data: { runningSince: now, lastStartedAt: now },
    });
    return now;
  }
  return (await claimJob(PIPELINE_JOB, now, PIPELINE_LEASE_MS)) ? now : null;
}

/**
 * Whether the claim stamped `claimedAt` is still the one on the row.
 *
 * This is the interrupt. Releasing the chain's lock used to be cosmetic — the
 * run carried on in the background and a second one could start beside it — so
 * the button that reads like "stop" stopped nothing. Now the running chain asks,
 * between jobs, whether the claim it took is still there: an operator releasing
 * it, or another run stealing an expired lease, both make this false and the
 * chain stands down cleanly at the next job boundary rather than mid-write.
 *
 * Between jobs, not inside one: an import killed halfway is exactly what the
 * orphan reaper exists to clean up, and every job is idempotent anyway, so
 * finishing the current one costs nothing and leaves the record whole.
 */
async function stillHoldsClaim(claimedAt: Date): Promise<boolean> {
  const row = await db.syncJob.findUnique({
    where: { name: PIPELINE_JOB },
    select: { runningSince: true },
  });
  return row?.runningSince?.getTime() === claimedAt.getTime();
}

/** Who is holding the chain lock, if anyone. */
export async function pipelineRunningSince(): Promise<Date | null> {
  const row = await db.syncJob.findUnique({
    where: { name: PIPELINE_JOB },
    select: { runningSince: true },
  });
  return row?.runningSince ?? null;
}

/**
 * Run the chain: order, decide, execute, record.
 *
 * Never throws for a failing job — the report carries the per-step outcome, the
 * same way `runJob` returns one instead of raising. The only exception is a
 * malformed registry, which {@link orderedJobs} refuses to start on.
 */
export async function runPipeline(opts: PipelineOptions = {}): Promise<PipelineReport> {
  const startedAt = new Date();
  const jobs = resolveSelection(opts.only);

  // Sweep whatever a previous process left claimed, so a redeploy mid-chain does
  // not lock the next run out for the whole lease.
  await reapOrphanRuns();

  let claimedAt = opts.claimedAt ?? null;
  if (!claimedAt) {
    claimedAt = await claimPipeline(startedAt, opts.force ?? false);
    if (!claimedAt) {
      return {
        status: "locked",
        steps: [],
        ran: 0,
        skipped: 0,
        blocked: 0,
        failed: 0,
        itemsUpserted: 0,
        startedAt,
        finishedAt: new Date(),
        durationMs: 0,
        runningSince: await pipelineRunningSince(),
        interrupted: false,
      };
    }
  }

  const names = [...new Set(jobs.flatMap((j) => [j.name, ...jobDependencies(j)]))];
  const state = await loadState(names);
  const outcomes = new Map<string, StepStatus>();
  const steps: PipelineStep[] = [];
  const maxAgeMs = (opts.maxAgeDays ?? FRESH_FOR_DAYS) * 86_400_000;

  // The run row and the loop share one try, so a database error between the two
  // cannot leave the chain lock standing for the whole twelve-hour lease.
  let runId: string | null = null;
  let interrupted = false;

  try {
    runId = (
      await db.importRun.create({
        data: { source: ImportSource.MANUAL, job: PIPELINE_JOB, startedAt, ok: false },
        select: { id: true },
      })
    ).id;

    for (const [index, job] of jobs.entries()) {
      // Two ways to stand down, checked in the same place: the host process is
      // shutting down, or somebody took our claim away.
      if (opts.shouldStop?.() || !(await stillHoldsClaim(claimedAt))) {
        interrupted = true;
        break;
      }
      const planned = decide(job, state, outcomes, maxAgeMs, new Date());
      opts.onStep?.(planned, index, jobs.length);

      if (planned.action === "skip") {
        outcomes.set(job.name, planned.status);

        // A held-back job leaves no trace of its own — `runJob` never ran, so
        // its row still shows last week's success and the panel would call it
        // current. Being held back is a state this chain invented; it has to be
        // legible somewhere, and the job's own row is where an operator looks.
        // `updateMany` because a job that has never run has no row yet, and
        // `runJob` clears `lastNote` on its next success, so this expires itself.
        if (planned.status === "blocked") {
          await db.syncJob.updateMany({
            where: { name: job.name },
            data: { lastNote: `Adiado na sincronização de ${formatZoned(startedAt)}: ${planned.reason}.` },
          });
        }
        const step: PipelineStep = {
          name: job.name,
          label: job.label,
          status: planned.status,
          reason: planned.reason,
          itemsSeen: 0,
          itemsUpserted: 0,
          durationMs: 0,
        };
        steps.push(step);
        opts.onDone?.(step, index, jobs.length);
        continue;
      }

      const jobOpts: SyncOptions = {};
      // Only time-bounded jobs take a window; the rest always import the whole
      // current roster, and passing `days` to them would mean nothing.
      if (opts.days !== undefined && job.defaults.days !== undefined) jobOpts.days = opts.days;
      if (opts.limit !== undefined) jobOpts.limit = opts.limit;
      if (opts.onProgress) jobOpts.onProgress = (progress) => opts.onProgress?.(job, progress);

      const outcome = await runJob(job, jobOpts, { force: opts.force });
      const step: PipelineStep =
        outcome.status === "ok"
          ? {
              name: job.name,
              label: job.label,
              status: "ok",
              reason: planned.reason,
              itemsSeen: outcome.result.itemsSeen,
              itemsUpserted: outcome.result.itemsUpserted,
              durationMs: outcome.durationMs,
            }
          : outcome.status === "skipped"
            ? {
                name: job.name,
                label: job.label,
                status: "locked",
                reason: "já em execução por outro processo",
                itemsSeen: 0,
                itemsUpserted: 0,
                durationMs: 0,
              }
            : {
                name: job.name,
                label: job.label,
                status: "failed",
                reason: outcome.error,
                itemsSeen: 0,
                itemsUpserted: 0,
                durationMs: outcome.durationMs,
              };

      outcomes.set(job.name, step.status);
      // Keep the in-memory state in step with the database, so a job further
      // down the chain sees that its dependency has just moved.
      if (step.status === "ok") state.set(job.name, { lastOk: true, lastFinishedAt: new Date() });
      steps.push(step);
      opts.onDone?.(step, index, jobs.length);
    }
  } catch (err) {
    if (runId) {
      const message = err instanceof Error ? err.message : String(err);
      await db.importRun
        .update({
          where: { id: runId },
          data: { finishedAt: new Date(), ok: false, note: `Falha na cadeia: ${message}`.slice(0, 500) },
        })
        .catch(() => {});
    }
    throw err;
  } finally {
    // Only our own claim. If it was released and another run has already taken
    // the row, clearing it unconditionally would unlock a chain that is live.
    await db.syncJob.updateMany({
      where: { name: PIPELINE_JOB, runningSince: claimedAt },
      data: { runningSince: null },
    });
  }

  const finishedAt = new Date();
  const report: PipelineReport = {
    status:
      interrupted ||
      steps.some((s) => s.status === "failed" || s.status === "blocked" || s.status === "locked")
        ? "partial"
        : "ok",
    steps,
    ran: steps.filter((s) => s.status === "ok").length,
    skipped: steps.filter((s) => s.status === "fresh").length,
    blocked: steps.filter((s) => s.status === "blocked" || s.status === "locked").length,
    failed: steps.filter((s) => s.status === "failed").length,
    itemsUpserted: steps.reduce((sum, s) => sum + s.itemsUpserted, 0),
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    interrupted,
  };

  const note = summarize(report);
  if (runId) {
    await db.importRun.update({
      where: { id: runId },
      data: {
        finishedAt,
        ok: report.failed === 0,
        itemsSeen: steps.reduce((sum, s) => sum + s.itemsSeen, 0),
        itemsUpserted: report.itemsUpserted,
        note: note.slice(0, 500),
      },
    });
  }
  await db.syncJob.update({
    where: { name: PIPELINE_JOB },
    data: {
      lastFinishedAt: finishedAt,
      lastOk: report.failed === 0,
      lastNote: note.slice(0, 500),
      lastItemsSeen: steps.reduce((sum, s) => sum + s.itemsSeen, 0),
      lastItemsUpserted: report.itemsUpserted,
    },
  });

  return report;
}

/** One PT-BR line describing a finished chain run, for the panel and the logs. */
export function summarize(report: PipelineReport): string {
  const parts = [`${report.ran} executado(s)`, `${report.skipped} em dia`];
  if (report.blocked > 0) parts.push(`${report.blocked} adiado(s)`);
  if (report.failed > 0) parts.push(`${report.failed} com falha`);
  const tail = `${parts.join(" · ")} — ${report.itemsUpserted.toLocaleString("pt-BR")} registros atualizados.`;
  return report.interrupted ? `Interrompida. ${tail} O restante fica para a próxima execução.` : tail;
}
