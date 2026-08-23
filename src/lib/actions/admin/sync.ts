"use server";

/**
 * Server actions for the synchronization panel.
 *
 * The weekly worker is the normal driver; these actions exist for the cases an
 * operator actually faces — a source that was down during the scheduled slot, a
 * newly deployed environment that needs its first load, or a lock left behind by
 * a killed process.
 */
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { findJob } from "@/lib/integration/jobs";
import { PIPELINE_JOB, runJob } from "@/lib/integration/runner";
import { claimPipeline, pipelineRunningSince, runPipeline } from "@/lib/integration/pipeline";
import { db } from "@/lib/db";
import { formatZoned } from "@/lib/integration/schedule";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const PANEL_PATH = "/admin/sincronizacao";

/**
 * Run the whole chain: every job in dependency order, skipping what is current.
 *
 * The one action an operator should normally need. It does **not** await the
 * work — a full chain runs for hours, and a browser request held open that long
 * is a request that dies on a proxy while the import carries on invisibly.
 * Instead it claims the chain lock synchronously, so the panel can truthfully
 * answer "em execução" on this very render, and hands the run to `after()`,
 * which the Node server keeps alive past the response. Progress is read the way
 * it already was: every job writes its own SyncJob row as it finishes.
 *
 * `full` drops the freshness window, for the operator who wants everything
 * re-imported rather than only what has gone stale.
 */
export async function runSyncPipelineAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const full = formData.get("full") === "1";
  const claimedAt = await claimPipeline(new Date());
  if (!claimedAt) {
    const since = await pipelineRunningSince();
    revalidatePath(PANEL_PATH);
    return {
      ok: false,
      message: `Já existe uma sincronização em andamento${since ? ` desde ${formatZoned(since)}` : ""}.`,
    };
  }

  after(async () => {
    try {
      // The claim stamp goes with it: that is what "Interromper" revokes, and
      // it is how this run knows the revocation was meant for it.
      await runPipeline({ claimedAt, ...(full ? { maxAgeDays: 0 } : {}) });
    } catch (err) {
      // `runPipeline` releases the lock in its own `finally`; this is only so a
      // chain that died on the database does not vanish from the logs.
      console.error("Falha na cadeia de sincronização:", err);
    }
  });

  revalidatePath(PANEL_PATH);
  return {
    ok: true,
    message: full
      ? "Sincronização completa iniciada — todos os jobs serão reexecutados. Acompanhe abaixo."
      : "Sincronização iniciada — os jobs em dia serão pulados. Acompanhe abaixo.",
  };
}

/**
 * Run one registered job now, honouring its lock. Long jobs (votes over a 30-day
 * window) can take minutes; the action awaits completion so the panel reports a
 * real outcome rather than an optimistic "started".
 */
export async function runSyncJobAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const name = String(formData.get("job") ?? "");
  const job = findJob(name);
  if (!job) return { ok: false, message: "Job desconhecido." };

  const force = formData.get("force") === "1";
  const days = Number(formData.get("days"));
  const opts = Number.isFinite(days) && days > 0 ? { days: Math.floor(days) } : {};

  const outcome = await runJob(job, opts, { force });
  revalidatePath(PANEL_PATH);

  if (outcome.status === "ok") {
    return {
      ok: true,
      message:
        `${job.label}: ${outcome.result.itemsUpserted} registro(s) atualizado(s) ` +
        `em ${(outcome.durationMs / 1000).toFixed(0)}s.`,
    };
  }
  if (outcome.status === "skipped") {
    const since = outcome.runningSince ? formatZoned(outcome.runningSince) : "momento desconhecido";
    return { ok: false, message: `Já em execução desde ${since}.` };
  }
  return { ok: false, message: `Falhou: ${outcome.error}` };
}

/**
 * Release a lock without running anything.
 *
 * For **one job**, this is the old escape hatch and carries the old caveat: only
 * for a claim whose holder is known to be dead, because releasing a live one
 * would let two runs import the same window at once.
 *
 * For **the chain**, it is a genuine interrupt. The running chain checks between
 * jobs whether its claim is still on the row (`stillHoldsClaim`), so revoking it
 * makes the chain stand down at the next job boundary — after the current import
 * finishes, never mid-write. That is why the panel labels this one "Interromper"
 * and the per-job one "Liberar lock": they read alike and do different things.
 */
export async function releaseSyncLockAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const name = String(formData.get("job") ?? "").trim().toLowerCase();
  const job = name === PIPELINE_JOB ? { name: PIPELINE_JOB, label: "Sincronização" } : findJob(name);
  if (!job) return { ok: false, message: "Job desconhecido." };

  const { count } = await db.syncJob.updateMany({
    where: { name: job.name, runningSince: { not: null } },
    data: { runningSince: null, lastNote: "Lock liberado manualmente." },
  });
  revalidatePath(PANEL_PATH);

  if (count === 0) {
    return {
      ok: false,
      message: name === PIPELINE_JOB ? "Nenhuma sincronização em andamento." : "O job não estava travado.",
    };
  }
  return {
    ok: true,
    message:
      name === PIPELINE_JOB
        ? "Sincronização interrompida — ela para assim que o job atual terminar. O que não rodou fica para a próxima."
        : `Lock de ${job.label} liberado.`,
  };
}
