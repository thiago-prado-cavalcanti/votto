/**
 * Registry of the scheduled synchronization jobs (CLAUDE.md §8).
 *
 * One job per (source × domain), so each can be scheduled, retried and observed
 * on its own — a failing votes import never blocks the agent roster refresh.
 * The worker (`scripts/worker.ts`) reads this registry; so does the CLI
 * (`scripts/sync.ts`) and the authenticated HTTP trigger
 * (`/api/cron/[job]`).
 *
 * Two jobs cover bills from different angles, deliberately overlapping:
 * `*:agenda` imports the handful of bills actually tabled for a floor vote
 * (cheap, high signal), while `*:themes` sweeps everything that moved in the
 * window (broad, expensive). The agenda job runs first, so the bills that matter
 * land even if the broad sweep later fails or is skipped.
 *
 * Jobs are independent by construction: the agent jobs create a missing party on
 * demand and the vote jobs create a missing agent on demand, so running them out
 * of order degrades detail (a party with only its acronym) but never correctness.
 * The weekly slots below still order them naturally — parties, then agents, then
 * bills, then roll calls — and stagger the two houses so we never hammer both
 * APIs at once.
 *
 * All times are America/São_Paulo, in the small hours of Sunday when both houses
 * are idle and their daily data refresh has long since run.
 */
import * as camara from "@/lib/integration/camara";
import * as senado from "@/lib/integration/senado";
import { syncSummaries } from "@/lib/integration/summaries";
import { syncQuality } from "@/lib/integration/quality";
import type { SyncOptions, SyncResult, SyncStep } from "@/lib/integration/importer";
import { ImportSource } from "@/generated/prisma";

/** Weekly slot, in America/São_Paulo. `weekday` follows `Date#getDay()` (0 = Sunday). */
export interface WeeklySchedule {
  weekday: number;
  hour: number;
  minute: number;
}

/** A registered, independently schedulable synchronization job. */
export interface SyncJobDefinition {
  /** Stable id, `{source}:{domain}` — also the SyncJob row key and CLI argument. */
  name: string;
  source: ImportSource;
  /** PT-BR label for the admin dashboard. */
  label: string;
  /** What the job actually pulls, in one line. */
  description: string;
  schedule: WeeklySchedule;
  /** Defaults applied when the caller passes no options. */
  defaults: SyncOptions;
  run: SyncStep;
}

/**
 * Look-back window for the weekly jobs. Seven days would suffice for a run that
 * never fails; thirty absorbs three consecutive missed cycles without leaving a
 * hole, and re-importing is free because every upsert is idempotent.
 */
const WEEKLY_LOOKBACK_DAYS = 30;

export const SYNC_JOBS: SyncJobDefinition[] = [
  {
    name: "camara:parties",
    source: ImportSource.CAMARA,
    label: "Câmara — partidos",
    description: "Partidos com representação na Câmara, com líder, logo e bancada.",
    schedule: { weekday: 0, hour: 2, minute: 0 },
    defaults: {},
    run: camara.syncParties,
  },
  {
    name: "senado:parties",
    source: ImportSource.SENADO,
    label: "Senado — partidos",
    description: "Partidos com representação no Senado (reaproveita o registro da Câmara).",
    schedule: { weekday: 0, hour: 2, minute: 20 },
    defaults: {},
    run: senado.syncParties,
  },
  {
    name: "camara:agents",
    source: ImportSource.CAMARA,
    label: "Câmara — deputados federais",
    description: "Deputados em exercício, com partido, UF, foto e página oficial.",
    schedule: { weekday: 0, hour: 2, minute: 40 },
    defaults: {},
    run: camara.syncAgents,
  },
  {
    name: "senado:agents",
    source: ImportSource.SENADO,
    label: "Senado — senadores",
    description: "Senadores em exercício, com partido, UF, foto e página oficial.",
    schedule: { weekday: 0, hour: 3, minute: 0 },
    defaults: {},
    run: senado.syncAgents,
  },
  {
    name: "camara:agenda",
    source: ImportSource.CAMARA,
    label: "Câmara — pauta do Plenário",
    description:
      "Proposições efetivamente pautadas para votação em Plenário, ranqueadas por recorrência e recência.",
    schedule: { weekday: 0, hour: 3, minute: 15 },
    defaults: { days: 90 },
    run: camara.syncAgendaThemes,
  },
  {
    name: "senado:agenda",
    source: ImportSource.SENADO,
    label: "Senado — pauta do Plenário",
    description:
      "Processos na ordem do dia, agendados ou prontos para deliberação do Plenário.",
    schedule: { weekday: 0, hour: 3, minute: 20 },
    defaults: {},
    run: senado.syncAgendaThemes,
  },
  {
    name: "camara:themes",
    source: ImportSource.CAMARA,
    label: "Câmara — proposições em pauta",
    description:
      "Proposições que tramitaram no período, com regime de urgência, situação e classificação oficial.",
    schedule: { weekday: 0, hour: 3, minute: 30 },
    defaults: { days: WEEKLY_LOOKBACK_DAYS },
    run: camara.syncThemes,
  },
  {
    name: "senado:themes",
    source: ImportSource.SENADO,
    label: "Senado — processos em pauta",
    description:
      "Processos legislativos atualizados no período, com situação, assuntos e indexação.",
    schedule: { weekday: 0, hour: 5, minute: 0 },
    defaults: { days: WEEKLY_LOOKBACK_DAYS },
    run: senado.syncThemes,
  },
  {
    name: "ai:summaries",
    source: ImportSource.MANUAL,
    label: "IA — resumos em linguagem simples",
    description:
      "Gera título e resumo acessíveis, e propõe o posicionamento, para os temas de maior prioridade ainda sem resumo.",
    schedule: { weekday: 0, hour: 5, minute: 30 },
    defaults: {},
    run: syncSummaries,
  },
  {
    name: "camara:votes",
    source: ImportSource.CAMARA,
    label: "Câmara — votos nominais",
    description: "Votações nominais do período e o voto de cada deputado.",
    schedule: { weekday: 0, hour: 6, minute: 0 },
    defaults: { days: WEEKLY_LOOKBACK_DAYS },
    run: camara.syncVotes,
  },
  {
    name: "senado:votes",
    source: ImportSource.SENADO,
    label: "Senado — votos nominais",
    description: "Votações nominais do período e o voto de cada senador.",
    schedule: { weekday: 0, hour: 7, minute: 0 },
    defaults: { days: WEEKLY_LOOKBACK_DAYS },
    run: senado.syncVotes,
  },
  {
    name: "camara:mandate",
    source: ImportSource.CAMARA,
    label: "Câmara — mandatos e produção",
    description:
      "Períodos de exercício e licença, legislaturas servidas, projetos apresentados e relatados por deputado.",
    schedule: { weekday: 0, hour: 7, minute: 30 },
    defaults: {},
    run: camara.syncMandate,
  },
  {
    name: "senado:mandate",
    source: ImportSource.SENADO,
    label: "Senado — mandatos e produção",
    description:
      "Períodos de exercício e licença, projetos apresentados e relatados por senador.",
    schedule: { weekday: 0, hour: 7, minute: 45 },
    defaults: {},
    run: senado.syncMandate,
  },
  {
    name: "camara:expenses",
    source: ImportSource.CAMARA,
    label: "Câmara — cota parlamentar",
    description:
      "Custeio do mandato (CEAP) por deputado, por legislatura e ano. Não inclui emendas parlamentares.",
    schedule: { weekday: 0, hour: 8, minute: 0 },
    defaults: {},
    run: camara.syncExpenses,
  },
  {
    name: "senado:expenses",
    source: ImportSource.SENADO,
    label: "Senado — cota parlamentar",
    description:
      "Custeio do mandato (CEAPS) por senador, por ano. Não inclui emendas parlamentares.",
    schedule: { weekday: 0, hour: 8, minute: 15 },
    defaults: {},
    run: senado.syncExpenses,
  },
  {
    name: "metrics:quality",
    source: ImportSource.MANUAL,
    label: "Índice de qualidade",
    description:
      "Recalcula o índice 0–100 de cada agente a partir dos dados já importados. Sem rede.",
    schedule: { weekday: 0, hour: 8, minute: 30 },
    defaults: {},
    run: syncQuality,
  },
];

/** Look up a job by its registered name. */
export function findJob(name: string): SyncJobDefinition | null {
  return SYNC_JOBS.find((j) => j.name === name.trim().toLowerCase()) ?? null;
}

/** Every registered job name, for CLI help and validation messages. */
export function jobNames(): string[] {
  return SYNC_JOBS.map((j) => j.name);
}

/** Merge caller-supplied options over a job's defaults. */
export function jobOptions(job: SyncJobDefinition, opts: SyncOptions = {}): SyncOptions {
  return { ...job.defaults, ...opts };
}

export type { SyncOptions, SyncResult };
