/**
 * Synchronization panel: the operational view of the official-source importers.
 *
 * Shows every registered job with its weekly slot, next firing, last outcome and
 * a manual trigger, plus the most recent run history. This is where an operator
 * answers "is the federal data actually current?" without shelling into the box.
 */
import type { Metadata } from "next";
import { Card, CardBody, Badge } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { SyncJobRow, type SyncJobView } from "@/components/admin/SyncJobRow";
import { db } from "@/lib/db";
import { SYNC_JOBS } from "@/lib/integration/jobs";
import { describeSchedule, formatZoned, nextOccurrence } from "@/lib/integration/schedule";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sincronização" };

export default async function SyncPage() {
  const [states, runs] = await Promise.all([
    db.syncJob.findMany({ where: { name: { in: SYNC_JOBS.map((j) => j.name) } } }),
    db.importRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
  ]);

  const stateByName = new Map(states.map((s) => [s.name, s]));
  const now = new Date();

  const jobs: SyncJobView[] = SYNC_JOBS.map((job) => {
    const state = stateByName.get(job.name);
    return {
      name: job.name,
      label: job.label,
      description: job.description,
      schedule: describeSchedule(job.schedule),
      nextRun: formatZoned(nextOccurrence(job.schedule, now)),
      lastFinishedAt: state?.lastFinishedAt ? formatZoned(state.lastFinishedAt) : null,
      lastOk: state?.lastFinishedAt ? state.lastOk : null,
      lastNote: state?.lastNote ?? null,
      lastItemsUpserted: state?.lastItemsUpserted ?? 0,
      runningSince: state?.runningSince ? formatZoned(state.runningSince) : null,
      // Only jobs that declare a window take one; the rest always import the
      // full current roster or the whole year.
      defaultDays: job.defaults.days ?? null,
    };
  });

  const stale = jobs.filter((j) => j.lastOk === null || j.lastOk === false).length;

  return (
    <div>
      <PageHeader
        title="Sincronização"
        description="Importações das fontes oficiais (Câmara dos Deputados e Senado Federal)."
        action={
          stale === 0 ? (
            <Badge tone="positive">Todas as fontes em dia</Badge>
          ) : (
            <Badge tone="neutral">{stale} job(s) pendentes ou com falha</Badge>
          )
        }
      />

      <Card>
        <CardBody className="p-0">
          <ul className="divide-y divide-line">
            {jobs.map((job) => (
              <SyncJobRow key={job.name} job={job} />
            ))}
          </ul>
        </CardBody>
      </Card>

      <p className="mt-3 text-xs text-[var(--color-muted)]">
        O worker dedicado executa estes jobs automaticamente nos horários acima e
        recupera sozinho qualquer job sem execução bem-sucedida há mais de 8 dias.
        {env.cronSecret
          ? " O gatilho HTTP (POST /api/cron/{job}) também está habilitado."
          : " O gatilho HTTP está desabilitado — defina CRON_SECRET para habilitá-lo."}
      </p>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-xl text-navy-900">
          Execuções recentes
        </h2>
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
                        {run.job ?? run.source}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {formatZoned(run.startedAt)} ·{" "}
                        {run.itemsUpserted.toLocaleString("pt-BR")} atualizados de{" "}
                        {run.itemsSeen.toLocaleString("pt-BR")} vistos
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
