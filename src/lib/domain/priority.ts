/**
 * Legislative priority ranking.
 *
 * Neither house publishes a single "urgency score", but both publish the signals
 * one is built from. This module folds them into a normalized 0–100 `priority`
 * stored on Theme, so "what is actually about to be voted" can be ranked cheaply
 * in SQL instead of re-derived per request.
 *
 * Signals, in decreasing weight:
 *   1. **Procedural regime** — Câmara `statusProposicao.regime`
 *      ("Urgência (Art. 155, RICD)" ≫ "Prioridade" ≫ "Ordinário"); a Medida
 *      Provisória is inherently urgent (it expires by constitutional deadline).
 *   2. **Current situation** — being on the floor agenda ("Pronta para Pauta",
 *      "Incluída em Ordem do Dia", "Pronto para deliberação do Plenário") is the
 *      strongest short-term signal that a vote is imminent.
 *   3. **Recency** — a bill that moved this week outranks an identical one that
 *      last moved two years ago.
 *
 * A bill that finished its journey (enacted, rejected, shelved) is forced to the
 * bottom regardless of its former regime: it is history, not agenda.
 */

/** Signals available on an imported bill, from either house. */
export interface PrioritySignals {
  /** Procedural regime, verbatim from the source (may be absent). */
  urgency?: string | null;
  /** Current situation, verbatim from the source. */
  situation?: string | null;
  /** Official short identifier, e.g. "MPV 1367/2026" — used to detect MPs. */
  identifier?: string | null;
  /** Whether the bill is still moving through the house. */
  inProgress?: boolean;
  /** Timestamp of the last official action. */
  lastActionAt?: Date | null;
}

/** Upper bound applied to bills that are no longer in progress. */
const CLOSED_CEILING = 10;

/**
 * Whether the bill is a Medida Provisória, which both houses treat as urgent by
 * constitutional deadline regardless of any procedural regime they publish.
 */
function isMedidaProvisoria(identifier: string | null | undefined): boolean {
  const id = fold(identifier);
  return id.startsWith("mpv") || id.startsWith("mp ");
}

/** Strip accents and lowercase, so "Urgência" and "URGENCIA" match alike. */
function fold(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Base score from the procedural regime (25–65).
 *
 * Deliberately leaves headroom: the situation modifier is worth up to +25 and
 * recency up to +10, so a bill only reaches the "Urgente" band when the regime
 * AND the current stage AND recent movement all agree. Calibrated against the
 * live agenda — 35 of 42 bills tabled in the Câmara carry some "Urgência"
 * regime, so a high base alone would mark practically the whole floor urgent
 * and the badge would carry no information.
 */
function regimeScore(signals: PrioritySignals): number {
  const regime = fold(signals.urgency);

  // Medidas Provisórias lapse if not voted within their constitutional window,
  // which makes them the most time-pressured item on any agenda.
  if (isMedidaProvisoria(signals.identifier)) return 65;

  // The Senado publishes no regime field, so its situation carries the signal.
  if (!regime) return situationBase(fold(signals.situation));

  // "Urgência urgentíssima" (Art. 155) — voted in the same session it is granted.
  if (regime.includes("urgentissima") || regime.includes("155")) return 58;
  if (regime.includes("urgencia")) return 55;
  if (regime.includes("especial")) return 45;
  if (regime.includes("prioridade")) return 40;
  if (regime.includes("ordinario")) return 25;
  return 30;
}

/**
 * Base score derived from the situation alone, for a house that publishes no
 * regime (the Senado). Its vocabulary maps onto the same scale as the Câmara's
 * regimes, so bills from both houses can be ranked in one list — without this,
 * every Senado bill floored at the "unknown regime" default and none could ever
 * out-rank a Câmara bill.
 *
 * The distinction that matters: "incluída em ordem do dia" is a vote happening
 * now (8 bills), while "pronto para deliberação do plenário" is a queue that
 * ~540 bills sit in.
 */
function situationBase(situation: string): number {
  if (!situation) return 30;
  if (situation.includes("ordem do dia") || situation.includes("agendad")) return 70;
  if (situation.includes("pronto para deliberacao") || situation.includes("pronta para deliberacao")) {
    return 40;
  }
  if (situation.includes("pronta para a pauta") || situation.includes("pronto para a pauta")) return 35;
  return 25;
}

/**
 * Modifier from the current stage (−25–+25), applied on top of a published
 * regime. Being tabled for a vote dominates; having already left the house is
 * what most needs correcting — 18 of the 42 bills on the Câmara's floor agenda
 * read "Aguardando Apreciação pelo Senado Federal", meaning the Câmara already
 * voted them and they should not outrank what it is about to vote.
 */
function situationModifier(situation: string): number {
  if (!situation) return 0;

  // Already decided here and handed on: the other house owns it now.
  if (situation.includes("apreciacao pelo senado") || situation.includes("apreciacao pela camara")) {
    return -25;
  }
  // Out of the legislature entirely, waiting on the Executive.
  if (situation.includes("aguardando sancao") || situation.includes("aguardando veto")) return -20;

  if (
    situation.includes("ordem do dia") ||
    situation.includes("pronta para pauta") ||
    situation.includes("pronto para pauta") ||
    situation.includes("agendada")
  ) {
    return 25;
  }
  if (situation.includes("aguardando parecer") || situation.includes("aguardando deliberacao")) {
    return 8;
  }
  if (situation.includes("aguardando designacao")) return -8;
  return 0;
}

/** Bonus from how recently the bill moved (−8–+10). */
function recencyBonus(lastActionAt: Date | null | undefined, now: Date): number {
  if (!lastActionAt) return 0;
  const days = (now.getTime() - lastActionAt.getTime()) / 86_400_000;
  if (days < 0) return 10; // Clock skew / future-dated agenda entry.
  if (days <= 7) return 10;
  if (days <= 30) return 6;
  if (days <= 90) return 3;
  if (days <= 365) return 0;
  return -8;
}

/**
 * Whether a source-provided situation string means the bill's journey has ended
 * (enacted, rejected, shelved, withdrawn, vetoed). Both houses phrase this
 * differently but share the same word stems, so one matcher serves both.
 */
export function isConcludedSituation(situation: string | null | undefined): boolean {
  const s = fold(situation);
  if (!s) return false;
  return (
    s.includes("transformad") ||
    s.includes("norma juridica") ||
    s.includes("arquivad") ||
    s.includes("rejeitad") ||
    s.includes("prejudicad") ||
    s.includes("retirad") ||
    s.includes("vetado total")
  );
}

/**
 * Compute the normalized 0–100 priority rank for an imported bill. `now` is
 * injectable so the ranking is deterministic in tests.
 */
export function computePriority(signals: PrioritySignals, now: Date = new Date()): number {
  const situation = fold(signals.situation);

  // Concluded bills (enacted, rejected, shelved, vetoed) are archive, not agenda.
  const concluded = signals.inProgress === false || isConcludedSituation(signals.situation);

  // The situation modifier applies only when the base came from somewhere else
  // (a published regime, or the Medida Provisória deadline). When the base was
  // itself derived from the situation, adding it again would count it twice.
  const baseFromSituation = !signals.urgency && !isMedidaProvisoria(signals.identifier);
  const modifier = baseFromSituation ? 0 : situationModifier(situation);
  const raw = regimeScore(signals) + modifier + recencyBonus(signals.lastActionAt, now);
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  return concluded ? Math.min(score, CLOSED_CEILING) : score;
}

/** Coarse priority band, for badges and filters. */
export type PriorityBand = "URGENT" | "HIGH" | "NORMAL" | "LOW";

/** Map a 0–100 priority onto its display band. */
export function priorityBand(priority: number): PriorityBand {
  if (priority >= 80) return "URGENT";
  if (priority >= 60) return "HIGH";
  if (priority >= 30) return "NORMAL";
  return "LOW";
}

/**
 * The same bands as numeric ranges, in reading order, for callers that have to
 * count by band in SQL instead of classifying a row in memory (`min` inclusive,
 * `max` exclusive). Kept here beside `priorityBand` so the cut points exist once.
 */
export const PRIORITY_BAND_RANGES: Array<{ band: PriorityBand; min: number; max?: number }> = [
  { band: "URGENT", min: 80 },
  { band: "HIGH", min: 60, max: 80 },
  { band: "NORMAL", min: 30, max: 60 },
  { band: "LOW", min: 0, max: 30 },
];

/** PT-BR labels for the priority bands (presentation only). */
export const priorityBandLabel: Record<PriorityBand, string> = {
  URGENT: "Urgente",
  HIGH: "Prioritário",
  NORMAL: "Tramitação normal",
  LOW: "Baixa prioridade",
};
