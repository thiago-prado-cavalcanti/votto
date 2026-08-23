/**
 * The AI enrichment pass over imported themes, as a schedulable sync step.
 *
 * Picks the bills a citizen is most likely to see — highest priority, still in
 * progress, not yet enriched — and gives each a plain-language title and
 * summary plus the two positioning axes (see `src/lib/ai/summarize.ts`).
 *
 * Two rules keep this safe to re-run:
 *   * **Official text is never touched.** Only the `plain*` / `dimensions`
 *     columns are written; `name`, `summary` and `identifier` stay as imported.
 *   * **An editor always wins.** A theme whose `dimensionsSource` is `EDITOR`
 *     keeps its human tagging; only the plain-language fields are refreshed.
 *
 * Runs after the theme jobs so it enriches what they just brought in.
 */
import {
  summarizeTheme,
  CODING_RUNS,
  CODING_TEMPERATURE,
  type ThemeBrief,
} from "@/lib/ai/summarize";
import { db } from "@/lib/db";
import { env, isAiEnabled } from "@/lib/env";
import {
  counters,
  PROGRESS_INTERVAL,
  sleep,
  type SyncOptions,
  type SyncResult,
} from "@/lib/integration/importer";
import { VoterType, type Prisma } from "@/generated/prisma";

/** Themes enriched per run when the caller sets no limit. */
export const DEFAULT_BATCH = 300;

/**
 * Priority floor for a bill that has not been voted yet.
 *
 * 30 is the bottom of the "Tramitação normal" band (`src/lib/domain/priority.ts`)
 * — everything below it is the "Baixa prioridade" tail. Not an arbitrary cut: it
 * is the same line the themes list already draws for the reader.
 */
export const MIN_AI_PRIORITY = 30;

/**
 * Which themes the AI pass is willing to pay for.
 *
 * The pass used to accept every ACTIVE theme without a summary, which made its
 * queue the *whole* imported corpus — and that queue does not converge. The
 * broad `*:themes` sweep imports everything that moved in the window: ~12.300
 * Câmara bills in six months by `backfill.ts`'s own measurement, ~470 a week
 * before the Senado, against a drain of {@link DEFAULT_BATCH} = 300. The backlog
 * grew by a thousand during a single chain run. "Eventually we summarize
 * everything" was never true; it was a queue diverging quietly behind a budget
 * cap that hid it, because the cap bounds the *spend*, not the *shortfall*.
 *
 * So the population is bounded by what can still matter, in two clauses:
 *
 *  - **Already voted by an agent.** These feed the alignment and positioning
 *    indexes, and a bill only enters those with a roll-call vote. Deliberately
 *    NOT gated on priority: `priority` is capped at 10 once a bill is concluded,
 *    so a priority floor would exclude exactly the finished, voted bills the
 *    indexes are built from — the failure this clause exists to prevent.
 *  - **Still in progress, above the low-priority floor.** These have not been
 *    voted yet but can be, and they are what the themes list ranks highest.
 *
 * What is left out is the documented tail: bills filed, moved once, and never
 * voted. They keep their official title and ementa — the plain-language rewrite
 * is an enrichment, never the record — so the pages degrade to the source's own
 * words rather than to nothing.
 *
 * Exported so the cost forecast counts the same population the job processes.
 * Two copies of this predicate would drift, and the drift would be invisible:
 * the forecast would simply quote a number for a queue that no longer exists.
 */
export const AI_VOTED: Prisma.ThemeWhereInput = {
  votes: { some: { voterType: VoterType.AGENT } },
};

export const AI_UPCOMING: Prisma.ThemeWhereInput = {
  inProgress: true,
  priority: { gte: MIN_AI_PRIORITY },
};

/**
 * The union of the two clauses — what the cost forecast counts.
 *
 * Composed from them rather than restated, so the population the job walks and
 * the population the forecast prices cannot come apart.
 */
export const AI_ELIGIBLE: Prisma.ThemeWhereInput = { OR: [AI_VOTED, AI_UPCOMING] };

/** Pause between calls, so a long run doesn't burst against the rate limit. */
const REQUEST_DELAY = 150;

/**
 * How long a theme the model could not summarize is left alone.
 *
 * Long enough that a permanently-unsummarizable bill costs one attempt a month
 * instead of one a week, short enough that a transient outage is not a permanent
 * exclusion.
 */
const RETRY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Abaixo desta confiança o eixo é descartado como ruído.
 *
 * Agora **por eixo**, não por proposição: uma reforma tributária pode ter
 * direção econômica óbvia e nenhuma carga de costumes, e a versão anterior
 * descartava ou aceitava os dois juntos por um único número.
 */
const MIN_AXIS_CONFIDENCE = 0.35;

/**
 * Versão do formato da classificação gravada em `Theme.dimensions`.
 *
 * Lida por `parseDimensions` em `src/lib/indexes/positioning.ts`, que continua
 * aceitando o formato 1 (dois números soltos) e o marca como `legacy` — é assim
 * que `npm run reposition` consegue dizer que fatia do índice ainda repousa
 * sobre tags que fundem direção e magnitude.
 */
const DIMENSIONS_VERSION = 2;

/** Read the classification labels stored on a theme, for extra model context. */
function classificationLabels(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      entry && typeof entry === "object" && typeof (entry as { label?: unknown }).label === "string"
        ? ((entry as { label: string }).label)
        : null,
    )
    .filter((label): label is string => Boolean(label));
}

/**
 * Enrich the highest-priority themes that have no plain-language summary yet.
 *
 * `opts.limit` caps how many are processed; without it the run takes the top
 * {@link DEFAULT_BATCH}. Ordering by priority means a partial run still covers
 * the bills closest to a vote.
 */
export async function syncSummaries(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  if (!isAiEnabled()) {
    // Not an error: the platform runs fine without AI, themes just keep the
    // official wording. Surfaced through the job's note.
    return { itemsSeen: 0, itemsUpserted: 0, watermark: "sem ANTHROPIC_API_KEY" };
  }

  const take = opts.limit ?? DEFAULT_BATCH;
  const retryAfter = new Date(Date.now() - RETRY_AFTER_MS);

  // `plainSummary: null` is what keeps a theme from being summarized twice. The
  // `aiUpdatedAt` clause is what keeps one that FAILED from being paid for every
  // week: without it a theme the model cannot produce a brief for stays null,
  // sits at the top of the ordering forever, takes a slot in every batch, and
  // the themes below it are never reached at all.
  const ready: Prisma.ThemeWhereInput = {
    status: "ACTIVE",
    plainSummary: null,
    summary: { not: "" },
    OR: [{ aiUpdatedAt: null }, { aiUpdatedAt: { lt: retryAfter } }],
  };

  const columns = {
    id: true,
    identifier: true,
    name: true,
    summary: true,
    keywords: true,
    classifications: true,
    dimensionsSource: true,
  } as const;

  // Newest first inside each phase: among equals, the bill that moved most
  // recently is the one a reader is most likely to be looking at.
  const within = [{ priority: "desc" }, { lastActionAt: "desc" }] as const;

  // ── Fase 1: o que já foi votado ──────────────────────────────────────────
  //
  // Ordering by priority alone buried exactly these. `Theme.priority` is capped
  // at 10 once a bill is concluded (CLAUDE.md §8), and `inProgress` is false, so
  // a voted-and-finished bill sorted behind every bill still in committee —
  // thousands of them. Letting it into the queue (AI_VOTED) was necessary and
  // not sufficient: the filter admitted it and the ordering entombed it.
  //
  // And it is the one the indexes cannot do without. A bill enters the alignment
  // and positioning maths only through a roll call, so an unclassified voted
  // bill is a hole in both. Measured live: `metrics:positioning` refused to
  // publish with "CAMARA: só 3 votações classificadas e divididas (mínimo 20);
  // SENADO: só 0" — starved of classifications while the queue spent every
  // batch on bills that had never been voted.
  //
  // Not `orderBy: { votes: { _count: "desc" } }`, which was the one-line
  // version: that counts citizen votes too. It works today only because the
  // platform has none, and it would rot silently as it gains them — a popular
  // unvoted bill drifting ahead of a roll call the index is waiting on. Two
  // queries say what is meant.
  const voted = await db.theme.findMany({
    where: { AND: [ready, AI_VOTED] },
    orderBy: [...within],
    take,
    select: columns,
  });

  // ── Fase 2: o que ainda pode ser votado ──────────────────────────────────
  //
  // `notIn` because the clauses genuinely overlap: a bill voted in committee and
  // still in progress satisfies both, and would otherwise be sent twice in one
  // batch — paid for twice, and one slot short for someone else.
  const remaining = take - voted.length;
  const upcoming =
    remaining > 0
      ? await db.theme.findMany({
          where: { AND: [ready, AI_UPCOMING, { id: { notIn: voted.map((t) => t.id) } }] },
          orderBy: [...within],
          take: remaining,
          select: columns,
        })
      : [];

  const themes = [...voted, ...upcoming];

  for (const theme of themes) {
    c.seen++;
    if (c.seen % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({
        seen: c.seen,
        upserted: c.upserted,
        note: `${c.seen}/${themes.length} temas`,
      });
    }

    const brief = await summarizeTheme({
      identifier: theme.identifier,
      officialTitle: theme.name,
      officialSummary: theme.summary,
      keywords: theme.keywords,
      classifications: classificationLabels(theme.classifications),
    });
    await sleep(REQUEST_DELAY);

    if (!brief) {
      // Record the attempt, not a result. `aiUpdatedAt` therefore means "when
      // the AI last TRIED", which is what the selection above filters on — a
      // theme the model refuses is set aside for a month rather than re-sent
      // every run. It comes back on its own afterwards, in case the refusal was
      // about the model or the wording of the bill at the time.
      await db.theme.update({ where: { id: theme.id }, data: { aiUpdatedAt: new Date() } });
      continue;
    }

    // A classificação só é escrita quando nenhum editor tocou o tema: um
    // julgamento humano nunca é sobrescrito por uma passagem de modelo.
    const acceptAxes = theme.dimensionsSource !== "EDITOR";

    await db.theme.update({
      where: { id: theme.id },
      data: {
        plainTitle: brief.plainTitle,
        plainSummary: brief.plainSummary,
        aiModel: env.anthropicSummaryModel,
        aiUpdatedAt: new Date(),
        ...(acceptAxes ? { dimensions: buildDimensions(brief), dimensionsSource: "AI" } : {}),
      },
    });
    c.upserted++;
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted };
}

/**
 * Montar a classificação gravada a partir do que o modelo devolveu.
 *
 * Duas decisões carregam peso aqui:
 *
 * - **Uma exclusão é gravada, não descartada.** "Esta proposição é uma
 *   homenagem" é informação: sem ela, a próxima passagem paga de novo pela mesma
 *   conclusão, e o índice não tem como dizer quantas proposições saíram e por
 *   quê — que é metade do que torna um filtro mecânico defensável contra a
 *   acusação de escolher votações a dedo.
 * - **Um eixo abaixo do piso de confiança vira `null`, e o outro sobrevive.**
 *   Antes um único número de confiança decidia os dois juntos, então uma reforma
 *   tributária com direção econômica evidente perdia a classificação inteira por
 *   causa da dúvida sobre costumes.
 */
function buildDimensions(brief: ThemeBrief): Prisma.InputJsonValue {
  const keep = (axis: { direction: number; magnitude: number; confidence: number } | null) =>
    axis && axis.confidence >= MIN_AXIS_CONFIDENCE ? axis : null;

  const economic = keep(brief.economic);
  const social = keep(brief.social);

  // Sem nenhum eixo confiável e sem motivo declarado, o motivo é a dúvida —
  // dito explicitamente para que a revisão humana tenha o que filtrar.
  const reason = brief.exclusion ?? (economic || social ? null : "ambiguous");

  return {
    version: DIMENSIONS_VERSION,
    scoreable: reason === null && Boolean(economic || social),
    reason,
    economic,
    social,
    salience: brief.salience,
    yesMeans: brief.yesMeans || null,
    evidence: brief.evidence,
    coding: {
      model: env.anthropicSummaryModel,
      temperature: CODING_TEMPERATURE,
      runs: CODING_RUNS,
      // `null` enquanto houver uma única passagem: consistência entre execuções
      // é uma medida, e com uma execução não há o que medir. O protocolo de
      // auditoria (docs/posicionamento.md) exige duas antes de a faixa voltar.
      consistency: CODING_RUNS > 1 ? 1 : null,
      humanReviewed: false,
    },
  };
}
