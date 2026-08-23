"use client";

/**
 * The single synchronization control: run the whole chain, in order.
 *
 * This is the button an operator should reach for. The per-job rows below it
 * stay for the exception — one source that failed, one window to widen — but the
 * normal act is "sincronizar", and the chain decides what that costs.
 *
 * Unlike the per-job action, this one returns as soon as the run is claimed: the
 * chain takes hours, and the panel reports its progress by re-reading each job's
 * state rather than by holding the request open.
 */
import { useActionState } from "react";
import { Badge, Button } from "@/components/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import {
  runSyncPipelineAction,
  releaseSyncLockAction,
  type ActionResult,
} from "@/lib/actions/admin/sync";

/** Serializable view of the chain's schedule and last run. */
export interface SyncPipelineView {
  /** The chain's lock row name, so the release form can address it. */
  lockName: string;
  schedule: string;
  nextRun: string;
  freshForDays: number;
  total: number;
  /** How many jobs the chain would actually run if started right now. */
  dueNow: number;
  runningSince: string | null;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastNote: string | null;
}

export function SyncPipelineCard({ pipeline }: { pipeline: SyncPipelineView }) {
  const [runState, runAction] = useActionState<ActionResult | undefined, FormData>(
    runSyncPipelineAction,
    undefined,
  );
  const [lockState, lockAction] = useActionState<ActionResult | undefined, FormData>(
    releaseSyncLockAction,
    undefined,
  );
  const feedback = runState ?? lockState;
  const running = Boolean(pipeline.runningSince);

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg text-navy-900">Sincronizar tudo</p>
          <p className="mt-1 max-w-2xl text-xs text-[var(--color-muted)]">
            Um comando só: os {pipeline.total} jobs abaixo, na ordem em que estão listados.
          </p>
          <p className="mt-1.5 text-xs text-[var(--color-muted)]">
            Automático {pipeline.schedule} · próxima: {pipeline.nextRun}
          </p>
        </div>
        {running ? (
          <Badge tone="neutral">Em execução desde {pipeline.runningSince}</Badge>
        ) : pipeline.lastOk === null ? (
          <Badge tone="gray">Nunca executada</Badge>
        ) : (
          <Badge tone={pipeline.lastOk ? "positive" : "negative"}>
            {pipeline.lastOk ? "OK" : "Com falhas"} · {pipeline.lastFinishedAt}
          </Badge>
        )}
      </div>

      {/* The three rules, one line each. They were a single muted paragraph and
          nobody would have read it: this is the whole of the new behaviour, and
          an operator has to be able to predict what the button will cost before
          pressing it. */}
      <dl className="grid gap-x-4 gap-y-2 border-y border-line py-3 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="font-medium text-ink">Ordem</dt>
        <dd className="text-[var(--color-muted)]">
          Cada job só roda depois daqueles de quem ele lê — as proposições resolvem o autor
          contra a lista de parlamentares, a cota lê as legislaturas do mandato, a performance
          política ranqueia sobre os votos.
        </dd>

        <dt className="font-medium text-ink">Frescor</dt>
        <dd className="text-[var(--color-muted)]">
          Job concluído com sucesso há menos de {pipeline.freshForDays} dias é{" "}
          <strong className="font-medium text-ink">pulado</strong>. Reimportar uma janela que
          ninguém tocou custa milhares de requisições para gravar o que já está lá.
        </dd>

        <dt className="font-medium text-ink">Dados novos</dt>
        <dd className="text-[var(--color-muted)]">
          …a menos que algo de quem ele depende tenha concluído{" "}
          <em>depois</em> dele: se os votos entraram hoje, a performance política que rodou
          ontem está velha, mesmo com um dia. É isso que faz a atualização descer a cadeia
          inteira numa passada só.
        </dd>

        <dt className="font-medium text-ink">Adiado</dt>
        <dd className="text-[var(--color-muted)]">
          Se um job obrigatório (marcado <span className="text-ink">Exige</span> na lista) não
          concluir, quem depende dele não roda — e diz por quê na própria linha. A próxima
          sincronização o pega: um job que não rodou nunca ficou em dia.
        </dd>
      </dl>

      {pipeline.lastNote ? (
        <p className="rounded-card bg-[#f1efe8] px-3 py-2 text-xs text-[var(--color-muted)]">
          Última execução: {pipeline.lastNote}
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
          <SubmitButton size="sm" pendingLabel="Iniciando…" disabled={running}>
            {running
              ? "Em execução"
              : pipeline.dueNow === 0
                ? "Tudo em dia"
                : `Sincronizar agora (${pipeline.dueNow} pendente${pipeline.dueNow === 1 ? "" : "s"})`}
          </SubmitButton>
        </form>

        {/* The escape hatch from the freshness rule: re-import everything, for
            the operator who suspects what is stored rather than its age. */}
        <form action={runAction}>
          <input type="hidden" name="full" value="1" />
          <SubmitButton size="sm" variant="ghost" pendingLabel="Iniciando…" disabled={running}>
            Refazer tudo
          </SubmitButton>
        </form>

        {running ? (
          <form action={lockAction}>
            <input type="hidden" name="job" value={pipeline.lockName} />
            <Button type="submit" size="sm" variant="ghost">
              Interromper
            </Button>
          </form>
        ) : null}
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        A sincronização roda em segundo plano — pode fechar esta página. O andamento aparece
        job a job na lista abaixo. <span className="text-ink">Refazer tudo</span> ignora o
        frescor e reimporta os {pipeline.total} jobs: leva horas e só faz sentido quando se
        desconfia do que está gravado, não da idade.
        {running
          ? " Interromper para a cadeia assim que o job atual terminar — nunca no meio de uma"
            + " gravação. O que não rodou fica para a próxima, porque não chegou a ficar em dia."
          : ""}
      </p>
    </div>
  );
}
