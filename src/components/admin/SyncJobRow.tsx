"use client";

/**
 * One row of the synchronization panel: a job's schedule, last outcome and the
 * controls to run it now or release a stuck lock.
 *
 * The run action awaits the whole import, which for the vote jobs can take
 * several minutes — the button therefore stays in its pending state for the full
 * duration rather than pretending the work is done.
 */
import { useActionState } from "react";
import { Badge, Button } from "@/components/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { runSyncJobAction, releaseSyncLockAction, type ActionResult } from "@/lib/actions/admin/sync";

/** Serializable view of a job plus its persisted state. */
export interface SyncJobView {
  name: string;
  label: string;
  description: string;
  schedule: string;
  nextRun: string;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastNote: string | null;
  lastItemsUpserted: number;
  runningSince: string | null;
}

/** Colour and wording for the job's last outcome. */
function StatusBadge({ job }: { job: SyncJobView }) {
  if (job.runningSince) return <Badge tone="neutral">Em execução desde {job.runningSince}</Badge>;
  if (job.lastOk === null) return <Badge tone="gray">Nunca executado</Badge>;
  if (job.lastOk) return <Badge tone="positive">OK · {job.lastFinishedAt}</Badge>;
  return <Badge tone="negative">Falhou · {job.lastFinishedAt}</Badge>;
}

export function SyncJobRow({ job }: { job: SyncJobView }) {
  const [runState, runAction] = useActionState<ActionResult | undefined, FormData>(
    runSyncJobAction,
    undefined,
  );
  const [lockState, lockAction] = useActionState<ActionResult | undefined, FormData>(
    releaseSyncLockAction,
    undefined,
  );
  const feedback = runState ?? lockState;

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{job.label}</p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{job.description}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {job.schedule} · próxima: {job.nextRun}
            {job.lastOk ? ` · ${job.lastItemsUpserted.toLocaleString("pt-BR")} registros na última` : ""}
          </p>
        </div>
        <StatusBadge job={job} />
      </div>

      {job.lastNote && !job.lastOk ? (
        <p className="rounded-card bg-[#f7e9e4] px-3 py-2 text-xs text-[var(--color-negative)]">
          {job.lastNote}
        </p>
      ) : null}

      {feedback?.message ? (
        <p
          className={
            feedback.ok
              ? "rounded-card bg-[#eef1e6] px-3 py-2 text-xs text-[var(--color-positive)]"
              : "rounded-card bg-[#f7e9e4] px-3 py-2 text-xs text-[var(--color-negative)]"
          }
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <form action={runAction}>
          <input type="hidden" name="job" value={job.name} />
          {/* Disabled while a claim stands. The server refuses a second run
              anyway (`runJob` returns `skipped: locked`), but a button that
              looks live and then errors invites the operator to keep clicking —
              which is how three overlapping runs got started. */}
          <SubmitButton
            size="sm"
            variant="outline"
            pendingLabel="Sincronizando…"
            disabled={Boolean(job.runningSince)}
          >
            {job.runningSince ? "Em execução" : "Sincronizar agora"}
          </SubmitButton>
        </form>

        {job.runningSince ? (
          <form action={lockAction}>
            <input type="hidden" name="job" value={job.name} />
            <Button type="submit" size="sm" variant="ghost">
              Liberar lock
            </Button>
          </form>
        ) : null}
      </div>
    </li>
  );
}
