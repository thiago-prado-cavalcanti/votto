"use client";

/**
 * One row of the synchronization panel: a job's place in the chain, what the
 * chain would do with it right now, its last outcome, and the controls to run it
 * on its own or release a stuck lock.
 *
 * The per-job run is the exception, not the normal act — "Sincronizar tudo"
 * above is. It is kept because an operator does face the single case: one source
 * that was down, one window to widen. It bypasses the freshness rule by design:
 * naming a job is an explicit instruction.
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
  /** 1-based position in the chain, so the order is readable at a glance. */
  position: number;
  /**
   * Hard dependencies: this job is held back when one of them does not deliver.
   * Kept apart from {@link SyncJobView.after} on screen, because "adiado" is a
   * state only these can cause, and an operator staring at a job that did not
   * run needs to see which relation explains it.
   */
  needs: string[];
  /** Ordering-only dependencies. A failure in one of these holds nobody back. */
  after: string[];
  /** Whether the next chain run would skip this job, and why. */
  upToDate: boolean;
  planReason: string;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastNote: string | null;
  lastItemsUpserted: number;
  /**
   * The job's resume cursor — but only when it is a sentence rather than a date.
   *
   * `metrics:quality` writes its refusal there ("não gravado — CAMARA sem
   * custeio…"), which is the single most useful line the panel can show about
   * that job, and it was displayed nowhere: the row read "OK · 0 registros
   * atualizados" with no way to learn why. The incremental jobs store an ISO
   * date here instead, which is noise, so the page filters those out.
   */
  note: string | null;
  runningSince: string | null;
  /**
   * The chain holds its own lock right now, so a job showing `runningSince` is
   * almost certainly the step it is on — not a corpse.
   *
   * The distinction is the whole point: "Liberar lock" reads like a stop button
   * and is not one. Released on a live job it stops nothing and removes the only
   * guard against a second concurrent import of the same window — which for the
   * theme jobs means concurrent tally updates on the same Theme. The panel used
   * to offer that button beside a job the chain was actively running.
   */
  chainRunning: boolean;
  /**
   * The job's default look-back in days, when it takes one.
   *
   * Present so the operator can ask for a wider window than the weekly default.
   * Without it the panel could only ever run the 30-day sweep, which is how the
   * roll-call ledger stayed empty: thirty days is about four sittings, and the
   * attendance pillar refuses to score anybody on fewer than ten.
   */
  defaultDays: number | null;
}

/** Colour and wording for the job's last outcome. */
function StatusBadge({ job }: { job: SyncJobView }) {
  if (job.runningSince) {
    return (
      <Badge tone="neutral">
        {job.chainRunning ? "Em execução pela cadeia" : "Em execução"} desde {job.runningSince}
      </Badge>
    );
  }
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
          <p className="text-sm font-semibold text-ink">
            {/* The space is not decorative: the number and the label are only
                separated by margin, so a screen reader (and any copy-paste)
                would otherwise read "01Câmara — partidos". */}
            <span className="mr-2 font-mono text-xs text-[var(--color-muted)]">
              {String(job.position).padStart(2, "0")}
            </span>{" "}
            {job.label}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{job.description}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {job.needs.length > 0 ? (
              <>
                <span className="text-ink">Exige {job.needs.join(", ")}</span>
                {job.after.length > 0 ? ` · depois de ${job.after.join(", ")}` : ""}
              </>
            ) : job.after.length > 0 ? (
              `Depois de ${job.after.join(", ")}`
            ) : (
              "Início da cadeia"
            )}
            {job.lastOk ? ` · ${job.lastItemsUpserted.toLocaleString("pt-BR")} registros na última` : ""}
          </p>
          <p className="mt-1.5 text-xs">
            <span
              className={
                job.upToDate
                  ? "border border-line px-1.5 py-0.5 text-[var(--color-muted)]"
                  : "border border-navy-900 px-1.5 py-0.5 text-navy-900"
              }
            >
              {job.upToDate ? "Na próxima: pulado" : "Na próxima: executado"}
            </span>
            {" "}
            <span className="ml-2 text-[var(--color-muted)]">{job.planReason}</span>
          </p>
        </div>
        <StatusBadge job={job} />
      </div>

      {job.note ? (
        <p className="rounded-card bg-[#f1efe8] px-3 py-2 text-xs text-[var(--color-muted)]">
          {job.note}
        </p>
      ) : null}

      {/* `runJob` clears `lastNote` on every success, so a note on a job that
          last succeeded can only mean the chain held it back or an operator
          released its lock — both worth reading, neither an error. */}
      {job.lastNote ? (
        <p
          className={
            job.lastOk === false
              ? "rounded-card bg-[#f7e9e4] px-3 py-2 text-xs text-[var(--color-negative)]"
              : "rounded-card bg-[#f1efe8] px-3 py-2 text-xs text-[var(--color-muted)]"
          }
        >
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
        <form action={runAction} className="flex items-center gap-2">
          <input type="hidden" name="job" value={job.name} />
          {job.defaultDays !== null ? (
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              Janela
              <input
                type="number"
                name="days"
                min={1}
                max={3650}
                defaultValue={job.defaultDays}
                disabled={Boolean(job.runningSince)}
                className="h-8 w-20 border border-navy-300 bg-transparent px-2 text-sm text-navy-900 disabled:opacity-50"
              />
              dias
            </label>
          ) : null}
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

        {/* Only where the lock can actually be a corpse. While the chain is
            running, the control that stops things is "Interromper" on the chain
            — releasing the job's lock would stop nothing and unguard the run. */}
        {job.runningSince && !job.chainRunning ? (
          <form action={lockAction}>
            <input type="hidden" name="job" value={job.name} />
            <Button type="submit" size="sm" variant="ghost">
              Liberar lock
            </Button>
          </form>
        ) : null}
        {job.runningSince && job.chainRunning ? (
          <p className="text-xs text-[var(--color-muted)]">
            A cadeia está neste job agora. Para parar, use <span className="text-ink">Interromper</span>{" "}
            acima — liberar o lock daqui não interrompe o import, só remove a proteção contra uma
            segunda execução simultânea.
          </p>
        ) : null}
      </div>
    </li>
  );
}
