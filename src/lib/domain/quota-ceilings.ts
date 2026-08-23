/**
 * The published monthly ceiling of the parliamentary quota, per state and house.
 *
 * This table is what makes the cost pillar comparable at all. The quota is not
 * one number: it scales with the distance from Brasília, because it has to pay
 * for flights home. A deputy from Roraima may spend R$51,406/month within the
 * rules; one from the Distrito Federal may spend R$36,582. Ranking them on reais
 * ranks geography.
 *
 * Dividing by the ceiling turns the pillar into a **utilisation rate** — the
 * share of an entitlement a member actually drew — which is bounded, comparable
 * between states AND between houses (whose ceilings live on different scales
 * entirely), and needs no peer cohort at all. That last point is what removes
 * the worst statistical defect the index had: normalising inside cohorts as
 * small as five members published scores carrying ±27 points of pure sampling
 * noise, because half the reading was who else happened to be in the group.
 *
 * It also fixes a live injustice in the raw figures. An Amazonas senator drawing
 * 57% of their entitlement spends R$25,377/month; a Distrito Federal senator
 * drawing 79% spends R$16,737. In reais the careful one looks worse. Only the
 * rate reads it correctly.
 *
 * One other Brazilian index does this: the Ranking dos Políticos scores
 * `(1 - gasto/teto) x 10` against the same per-state ceilings (Manual de
 * Metodologia 2026, p. 15-16). An earlier version of this comment claimed no
 * Brazilian index did, which was wrong. The rankings that do inherit the
 * geographic bias undisclosed are the ones built on absolute reais — Congresso
 * em Foco, Poder360, Meu Congresso Nacional.
 *
 * ── Provenance ──────────────────────────────────────────────────────────────
 * Câmara (CEAP): Ato da Mesa nº 43/2009, Anexo Único, as updated by Ato da Mesa
 *   nº 244 de 2026-02-20 (IPCA). Every value is exactly ×1,13750 the 2023 table,
 *   which is a clean integrity check if it is ever re-derived.
 *   https://www.camara.leg.br/transparencia/gastos-parlamentares
 *   https://www2.camara.leg.br/comunicacao/assessoria-de-imprensa/guia-para-jornalistas/cota-parlamentar
 * Senado (CEAPS): Cota para o Exercício da Atividade Parlamentar dos Senadores.
 *   https://www12.senado.leg.br/transparencia/leg/pdf/CotaExercicioAtivParlamSenadores.pdf
 *
 * Both are adjusted by the houses themselves (the Câmara's by IPCA after the
 * annual budget law). When they move, this table moves with them — and because
 * the index divides by it rather than by an observed extreme, a member's score
 * only ever changes when the member's own spending or their own ceiling does.
 *
 * ── Two known limits, stated rather than hidden ─────────────────────────────
 *
 * 1. **Leadership add-ons are not counted.** Ato da Mesa 43/2009 art. 1º §1º
 *    grants a party leader, a committee chair and a few other posts an extra
 *    allowance on top of the state ceiling. Their legal entitlement is therefore
 *    larger than this table says, and they read as spending a higher share of it
 *    than they do. Correcting it needs the roster of posts per month, which is
 *    not imported yet.
 * 2. **The Senate table is the one the Senate publishes, and it is nine years
 *    old.** Re-verified against the live source on 2026-08-23: the PDF below
 *    still carries these exact 27 values, and its own metadata still reads
 *    `Microsoft Word 2013 / CreationDate 2017-06-19`. It is stale, and no
 *    current per-state Senate table exists at any Senate address.
 *
 *    The Ranking dos Políticos publishes a 2026 Senate table 19-96% higher than
 *    this one, credited to "Senado Federal". It is **not** a Senate table: its
 *    27 values are reproduced exactly (to the centavo) by
 *
 *        CEAPS_2026 = max(this table x 1.192477, CEAP_2026 x 0.879121)
 *
 *    — 23 of 27 states sit on the second branch at a ratio constant to eight
 *    decimal places, which no independently-set fee schedule does. It is a
 *    reconstruction presented as a source, so it is not adopted here: publishing
 *    somebody's model of the ceiling as the ceiling is the same error as
 *    publishing an estimate as official, which is what this note already
 *    refused to do.
 *
 *    The consequence is real and stated rather than hidden: senators' cost is
 *    read against a floor that is probably low, so their utilisation rate reads
 *    high and the pillar understates them. `npm run requality` prints median
 *    utilisation per house precisely so the size of that gap is visible, and
 *    `npm run check:sources` fails the day the Senate republishes the document.
 */
import { AgentType } from "@/generated/prisma";

/**
 * The Senate document `SENADO_CEILING` was transcribed from, and its fingerprint
 * at transcription time.
 *
 * `npm run check:sources` re-downloads it and compares. The hash is over the
 * whole PDF rather than its parsed values because the file is a 2013 Word export
 * whose text lives in object streams that no dependency-free parser here can
 * read — but the failure mode that matters is "the Senate changed the document
 * and nobody noticed", and a byte hash catches that. It is byte-stable across
 * repeated downloads (verified three times, 2026-08-23).
 *
 * A republish that only re-stamps the timestamp will also fail this check. That
 * is the correct outcome: it costs one look at the PDF, and the alternative is
 * scoring 81 named senators against a ceiling that moved.
 */
export const SENADO_CEILING_SOURCE = {
  url: "https://www12.senado.leg.br/transparencia/leg/pdf/CotaExercicioAtivParlamSenadores.pdf",
  sha256: "92d258e2a9f6817ea116ff18b47d8a2e163ab46d3fcefac00c96a69468b8e88c",
  bytes: 200_272,
  /** The document's own CreationDate, not ours. */
  publishedAt: "2017-06-19",
  verifiedAt: "2026-08-23",
} as const;

/** Câmara dos Deputados — CEAP, R$/month by state. */
const CAMARA_CEILING: Record<string, number> = {
  AC: 57359.87, AL: 53164.36, AM: 56151.46, AP: 55929.26, BA: 50965.29,
  CE: 54879.34, DF: 41612.55, ES: 49160.15, GO: 46979.73, MA: 54537.99,
  MG: 47645.91, MS: 52707.93, MT: 51439.83, PA: 54624.17, PB: 54402.48,
  PE: 53997.81, PI: 53195.84, PR: 50807.19, RJ: 47267.41, RN: 55198.09,
  RO: 56267.9, RR: 58474.7, RS: 53086.78, SC: 51951.42, SE: 52248.86,
  SP: 48727.46, TO: 51525.8,
};

/** Senado Federal — CEAPS, R$/month by state. */
const SENADO_CEILING: Record<string, number> = {
  AC: 38854.45, AL: 35056.2, AM: 44276.6, AP: 42855.2, BA: 35416.2,
  CE: 38186.6, DF: 21045.2, ES: 33176.6, GO: 21045.2, MA: 37396.6,
  MG: 28496.2, MS: 32905.2, MT: 34934.45, PA: 40426.2, PB: 35555.2,
  PE: 36266.6, PI: 38834.45, PR: 32586.6, RJ: 31816.2, RN: 35976.2,
  RO: 34615.2, RR: 40724.45, RS: 35886.6, SC: 32871.32, SE: 41844.45,
  SP: 30226.2, TO: 25215.2,
};

/**
 * The monthly quota ceiling for one agent, or null when we cannot place them.
 *
 * Null rather than a national average on purpose: a utilisation rate computed
 * against the wrong ceiling is worse than no reading, and the pillar already
 * knows how to redistribute its weight when a reading is missing.
 */
export function quotaCeiling(type: AgentType, state: string | null): number | null {
  if (!state) return null;
  const uf = state.trim().toUpperCase();
  if (type === AgentType.FEDERAL_DEPUTY) return CAMARA_CEILING[uf] ?? null;
  if (type === AgentType.SENATOR) return SENADO_CEILING[uf] ?? null;
  return null;
}

/**
 * Every ceiling in both tables, for the contract check that guards their range
 * (`checkQuotaCeilings` in `scripts/check-sources.ts`).
 *
 * The doc comment here used to promise that check while nothing called this
 * function. It does now.
 */
export function allCeilings(): number[] {
  return [...Object.values(CAMARA_CEILING), ...Object.values(SENADO_CEILING)];
}
