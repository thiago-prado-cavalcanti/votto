/**
 * Registry of the synchronization jobs (CLAUDE.md §8).
 *
 * One job per (source × domain), so each can be observed, retried and triggered
 * on its own — a failing votes import never hides the agent roster refresh.
 * The chain (`src/lib/integration/pipeline.ts`) reads this registry; so do the
 * CLI (`scripts/sync.ts`), the worker (`scripts/worker.ts`), the authenticated
 * HTTP trigger (`/api/cron/[job]`) and the admin panel.
 *
 * Two jobs cover bills from different angles, deliberately overlapping:
 * `*:agenda` imports the handful of bills actually tabled for a floor vote
 * (cheap, high signal), while `*:themes` sweeps everything that moved in the
 * window (broad, expensive). The agenda job runs first, so the bills that matter
 * land even if the broad sweep later fails or is skipped.
 *
 * ## Order is declared here, not in a clock
 *
 * Each job carries the jobs it must not run before. That used to be a weekly
 * slot per job, twenty minutes apart, which encoded the ordering as a *hope*:
 * every slot fired whether or not the previous one had finished, so a slow
 * roster import meant the bill import that follows it resolved its authors
 * against yesterday's agents, and the index at the end of the chain ranked a
 * cohort half of which had not been imported yet. Nothing failed; the record
 * was simply incomplete, which is worse, because it looks like data.
 *
 * Two strengths, and the difference is load-bearing:
 *
 *   * **`after`** — ordering only. The jobs create what they are missing (an
 *     agent job creates a missing party, a vote job a missing agent), so running
 *     out of order costs detail, never correctness. A failed `after` dependency
 *     does not stop anything.
 *   * **`needs`** — the job reads the dependency's output and would publish a
 *     *wrong* figure without it, not merely a thinner one. A failed `needs`
 *     dependency holds the dependent back, and the chain says so.
 *
 * `needs` is used exactly once, by `metrics:quality`: it ranks each agent inside
 * their house, so an import that delivered half the roll calls does not give a
 * thinner reading — it tells every agent they are in a cohort they are not in.
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

/**
 * When the whole chain runs, unattended.
 *
 * One slot for all of it, in the small hours of Sunday, when both houses are
 * idle and their daily refresh has long since run. The jobs are sequential
 * inside the chain, so there is nothing left for a per-job stagger to protect:
 * we never open two connections against a public API either way.
 */
export const PIPELINE_SCHEDULE: WeeklySchedule = { weekday: 0, hour: 2, minute: 0 };

/** A registered synchronization job and its place in the chain. */
export interface SyncJobDefinition {
  /** Stable id, `{source}:{domain}` — also the SyncJob row key and CLI argument. */
  name: string;
  source: ImportSource;
  /** PT-BR label for the admin dashboard. */
  label: string;
  /** What the job actually pulls, in one line. */
  description: string;
  /**
   * Jobs that must run before this one when both are in the same chain run.
   * Ordering only: a failure upstream costs detail, never correctness.
   */
  after?: string[];
  /**
   * Jobs whose output this one reads and cannot be *right* without. A `needs`
   * dependency that did not deliver holds this job back for the next run.
   */
  needs?: string[];
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
    defaults: {},
    run: camara.syncParties,
  },
  {
    name: "senado:parties",
    source: ImportSource.SENADO,
    label: "Senado — partidos",
    description: "Partidos com representação no Senado (reaproveita o registro da Câmara).",
    // A party exists once across both houses (CLAUDE.md §8): this importer
    // reuses the Câmara's record when the acronym matches, so it must come
    // second or the same party is created twice under two logos.
    after: ["camara:parties"],
    defaults: {},
    run: senado.syncParties,
  },
  {
    name: "camara:agents",
    source: ImportSource.CAMARA,
    label: "Câmara — deputados federais",
    description: "Deputados em exercício, com partido, UF, foto e página oficial.",
    after: ["camara:parties"],
    defaults: {},
    run: camara.syncAgents,
  },
  {
    name: "senado:agents",
    source: ImportSource.SENADO,
    label: "Senado — senadores",
    description: "Senadores em exercício, com partido, UF, foto e página oficial.",
    after: ["senado:parties"],
    defaults: {},
    run: senado.syncAgents,
  },
  {
    name: "camara:agenda",
    source: ImportSource.CAMARA,
    label: "Câmara — pauta do Plenário",
    description:
      "Proposições efetivamente pautadas para votação em Plenário, ranqueadas por recorrência e recência.",
    // Bills resolve their author against the agent roster (`agentIdByRef`).
    // Imported first, a bill keeps the hole until `reauthor` fills it — and
    // the weekly sweeps only revisit what moved, so it may keep it for good.
    after: ["camara:agents"],
    defaults: { days: 90 },
    run: camara.syncAgendaThemes,
  },
  {
    name: "senado:agenda",
    source: ImportSource.SENADO,
    label: "Senado — pauta do Plenário",
    description:
      "Processos na ordem do dia, agendados ou prontos para deliberação do Plenário.",
    after: ["senado:agents"],
    defaults: {},
    run: senado.syncAgendaThemes,
  },
  {
    name: "camara:themes",
    source: ImportSource.CAMARA,
    label: "Câmara — proposições em pauta",
    description:
      "Proposições que tramitaram no período, com regime de urgência, situação e classificação oficial.",
    after: ["camara:agents", "camara:agenda"],
    defaults: { days: WEEKLY_LOOKBACK_DAYS },
    run: camara.syncThemes,
  },
  {
    name: "senado:themes",
    source: ImportSource.SENADO,
    label: "Senado — processos em pauta",
    description:
      "Processos legislativos atualizados no período, com situação, assuntos e indexação.",
    after: ["senado:agents", "senado:agenda"],
    defaults: { days: WEEKLY_LOOKBACK_DAYS },
    run: senado.syncThemes,
  },
  {
    name: "ai:summaries",
    source: ImportSource.MANUAL,
    label: "IA — resumos em linguagem simples",
    description:
      "Gera título e resumo acessíveis, e propõe o posicionamento, para os temas de maior prioridade ainda sem resumo.",
    // Reads what is stored, so it goes after the bills are in — otherwise it
    // pays a model call for last week's batch and leaves this week's for the
    // next run, one legislative week behind for ever.
    after: ["camara:themes", "senado:themes"],
    defaults: {},
    run: syncSummaries,
  },
  {
    name: "camara:votes",
    source: ImportSource.CAMARA,
    label: "Câmara — votos nominais",
    description: "Votações nominais do período e o voto de cada deputado.",
    after: ["camara:agents", "camara:themes"],
    defaults: { days: WEEKLY_LOOKBACK_DAYS },
    run: camara.syncVotes,
  },
  {
    name: "senado:votes",
    source: ImportSource.SENADO,
    label: "Senado — votos nominais",
    description: "Votações nominais do período e o voto de cada senador.",
    after: ["senado:agents", "senado:themes"],
    defaults: { days: WEEKLY_LOOKBACK_DAYS },
    run: senado.syncVotes,
  },
  {
    name: "camara:mandate",
    source: ImportSource.CAMARA,
    label: "Câmara — mandatos e produção",
    description:
      "Períodos de exercício e licença, legislaturas servidas, projetos apresentados e relatados por deputado.",
    // Rapporteur counts come from our own `Theme.rapporteurId`, so the bills
    // have to be in before the tally means anything.
    after: ["camara:agents", "camara:themes"],
    defaults: {},
    run: camara.syncMandate,
  },
  {
    name: "senado:mandate",
    source: ImportSource.SENADO,
    label: "Senado — mandatos e produção",
    description:
      "Períodos de exercício e licença, projetos apresentados e relatados por senador.",
    after: ["senado:agents", "senado:themes"],
    defaults: {},
    run: senado.syncMandate,
  },
  {
    name: "camara:expenses",
    source: ImportSource.CAMARA,
    label: "Câmara — cota parlamentar",
    description:
      "Custo político (CEAP) por deputado, por legislatura e ano. Não inclui emendas parlamentares.",
    // Reads `AgentMetrics.legislatures`, which `camara:mandate` writes. It
    // falls back to the current legislature when that is missing, so running
    // first is not an error — it just charges an election year to one half.
    after: ["camara:agents", "camara:mandate"],
    defaults: {},
    run: camara.syncExpenses,
  },
  {
    name: "senado:expenses",
    source: ImportSource.SENADO,
    label: "Senado — cota parlamentar",
    description:
      "Custo político (CEAPS) por senador, por ano. Não inclui emendas parlamentares.",
    after: ["senado:agents", "senado:mandate"],
    defaults: {},
    run: senado.syncExpenses,
  },
  {
    name: "metrics:quality",
    source: ImportSource.MANUAL,
    label: "Performance política",
    description:
      "Recalcula a performance política (0–100) de cada agente a partir dos dados já importados. Sem rede.",
    // The one hard dependency in the registry. Every pillar is a percentile
    // inside a house, so a run over a partial roll-call import does not give
    // a thinner reading — it ranks each agent against a cohort that is not
    // theirs. `syncQuality` guards this at 70% coverage and says "rode
    // camara:votes e senado:votes antes"; this is that sentence, enforced.
    needs: ["camara:votes", "senado:votes"],
    after: ["camara:mandate", "senado:mandate", "camara:expenses", "senado:expenses"],
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
