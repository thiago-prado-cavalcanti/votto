/**
 * Synchronization panel: the operational view of the official-source importers.
 *
 * Leads with the one control that matters — run the whole chain — and then shows
 * every job in the order the chain runs it, with what the next run would do to
 * each: execute it, or skip it because it is current. That second line is the
 * point of the page. "Última execução: OK" answers whether a job worked; it does
 * not answer whether the record is complete, which is what an operator is
 * actually asking when they open this.
 */
import type { Metadata } from "next";
import { Card, CardBody, Badge } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { SyncJobRow, type SyncJobView } from "@/components/admin/SyncJobRow";
import { SyncPipelineCard, type SyncPipelineView } from "@/components/admin/SyncPipelineCard";
import { db } from "@/lib/db";
import { PIPELINE_SCHEDULE } from "@/lib/integration/jobs";
import { FRESH_FOR_DAYS, planPipeline } from "@/lib/integration/pipeline";
import { PIPELINE_JOB } from "@/lib/integration/runner";
import { describeSchedule, formatZoned, nextOccurrence } from "@/lib/integration/schedule";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sincronização" };

/**
 * A watermark worth printing.
 *
 * The incremental jobs store a resume cursor there — a bare `2026-08-22`, which
 * tells an operator nothing. The batch indexes store a sentence explaining why
 * they refused to write. Only the second kind reaches the page.
 */
function explanatoryWatermark(watermark: string | null | undefined): string | null {
  if (!watermark) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(watermark.trim()) ? null : watermark;
}

/** `37 min` / `2h 14min`, for how long a run has been open. */
function elapsed(from: Date, to: Date): string {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min`;
}

export default async function SyncPage() {
  // The plan is the same computation the chain runs, so the panel cannot drift
  // from what pressing the button would actually do.
  const [plan, states, runs, chain] = await Promise.all([
    planPipeline(),
    db.syncJob.findMany(),
    db.importRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
    db.syncJob.findUnique({ where: { name: PIPELINE_JOB } }),
  ]);

  const stateByName = new Map(states.map((s) => [s.name, s]));
  const chainRunning = Boolean(chain?.runningSince);
  const now = new Date();

  const jobs: SyncJobView[] = plan.map((step, index) => {
    const state = stateByName.get(step.job.name);
    return {
      name: step.job.name,
      label: step.job.label,
      description: step.job.description,
      position: index + 1,
      needs: step.job.needs ?? [],
      after: step.job.after ?? [],
      upToDate: step.action === "skip",
      planReason: step.reason,
      lastFinishedAt: state?.lastFinishedAt ? formatZoned(state.lastFinishedAt) : null,
      lastOk: state?.lastFinishedAt ? state.lastOk : null,
      lastNote: state?.lastNote ?? null,
      lastItemsUpserted: state?.lastItemsUpserted ?? 0,
      note: explanatoryWatermark(state?.watermark),
      runningSince: state?.runningSince ? formatZoned(state.runningSince) : null,
      chainRunning,
      // Only jobs that declare a window take one; the rest always import the
      // full current roster or the whole year.
      defaultDays: step.job.defaults.days ?? null,
    };
  });

  const pipeline: SyncPipelineView = {
    lockName: PIPELINE_JOB,
    schedule: describeSchedule(PIPELINE_SCHEDULE),
    nextRun: formatZoned(nextOccurrence(PIPELINE_SCHEDULE, now)),
    freshForDays: FRESH_FOR_DAYS,
    total: plan.length,
    dueNow: plan.filter((s) => s.action === "run").length,
    runningSince: chain?.runningSince ? formatZoned(chain.runningSince) : null,
    lastFinishedAt: chain?.lastFinishedAt ? formatZoned(chain.lastFinishedAt) : null,
    lastOk: chain?.lastFinishedAt ? chain.lastOk : null,
    lastNote: chain?.lastNote ?? null,
  };

  const failing = jobs.filter((j) => j.lastOk === false).length;

  return (
    <div>
      <PageHeader
        title="Sincronização"
        description="Importações das fontes oficiais (Câmara dos Deputados e Senado Federal)."
        action={
          failing > 0 ? (
            <Badge tone="negative">{failing} job(s) com falha</Badge>
          ) : pipeline.dueNow === 0 ? (
            <Badge tone="positive">Todas as fontes em dia</Badge>
          ) : (
            <Badge tone="neutral">{pipeline.dueNow} job(s) a executar</Badge>
          )
        }
      />

      <Card>
        <CardBody className="p-0">
          <SyncPipelineCard pipeline={pipeline} />
        </CardBody>
      </Card>

      <div className="mt-8">
        <h2 className="mb-1 font-display text-xl text-navy-900">A cadeia, em ordem</h2>
        <p className="mb-3 max-w-3xl text-xs text-[var(--color-muted)]">
          A ordem não é preferência: cada job lê o que o anterior gravou — as proposições
          resolvem o autor contra a lista de parlamentares, a cota lê as legislaturas do
          mandato, e a performance política ranqueia cada agente dentro da própria casa,
          por isso ela é a única que fica <em>adiada</em> quando os votos não entram.
          Executar um job isolado abaixo ignora a janela de frescor: nomeá-lo é uma ordem
          explícita.
        </p>
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {jobs.map((job) => (
                <SyncJobRow key={job.name} job={job} />
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <p className="mt-3 text-xs text-[var(--color-muted)]">
        O worker dedicado executa a cadeia automaticamente {pipeline.schedule.toLowerCase()} e
        também ao subir, pulando o que já estiver em dia.
        {env.cronSecret
          ? " O gatilho HTTP (POST /api/cron/all) também está habilitado."
          : " O gatilho HTTP está desabilitado — defina CRON_SECRET para habilitá-lo."}
      </p>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-xl text-navy-900">Execuções recentes</h2>
        <Card>
          <CardBody className="p-0">
            {runs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
                Nenhuma execução registrada ainda.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {runs.map((run) => (
                  <li key={run.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {run.job === PIPELINE_JOB ? "Sincronização completa" : (run.job ?? run.source)}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {formatZoned(run.startedAt)}
                        {/* A run still open needs its age, not just its counts: a
                            job that emits progress every 25 records shows zero
                            for its first stretch, and zero with no elapsed time
                            beside it is what makes a healthy import look dead. */}
                        {run.finishedAt === null ? ` · há ${elapsed(run.startedAt, now)}` : ""} ·{" "}
                        {run.itemsUpserted.toLocaleString("pt-BR")} atualizados de{" "}
                        {run.itemsSeen.toLocaleString("pt-BR")} vistos
                        {run.finishedAt === null ? " (parcial)" : ""}
                        {run.note ? ` · ${run.note}` : ""}
                      </p>
                    </div>
                    <Badge tone={run.ok ? "positive" : run.finishedAt ? "negative" : "neutral"}>
                      {run.ok ? "OK" : run.finishedAt ? "Falha" : "Em andamento"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
