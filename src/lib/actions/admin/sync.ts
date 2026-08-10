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
import { requireAdmin } from "@/lib/auth/guards";
import { findJob } from "@/lib/integration/jobs";
import { runJob } from "@/lib/integration/runner";
import { db } from "@/lib/db";
import { formatZoned } from "@/lib/integration/schedule";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const PANEL_PATH = "/admin/sincronizacao";

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
 * Release a job's lock without running it. Only for a claim whose holder is
 * known to be dead — releasing a live one would let two runs import the same
 * window at once.
 */
export async function releaseSyncLockAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const name = String(formData.get("job") ?? "");
  const job = findJob(name);
  if (!job) return { ok: false, message: "Job desconhecido." };

  const { count } = await db.syncJob.updateMany({
    where: { name: job.name, runningSince: { not: null } },
    data: { runningSince: null, lastNote: "Lock liberado manualmente." },
  });
  revalidatePath(PANEL_PATH);

  return count > 0
    ? { ok: true, message: `Lock de ${job.label} liberado.` }
    : { ok: false, message: "O job não estava travado." };
}
