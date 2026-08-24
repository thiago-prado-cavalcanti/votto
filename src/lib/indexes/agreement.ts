/**
 * A regra de concordância entre dois votos — pura, e por isso separada.
 *
 * `alignment.ts` é `server-only`: ele fala com Redis e com a sessão. Estas três
 * peças não falam com nada, e são as que **duas** leituras compartilham — o
 * alinhamento global e a concordância por área. Deixá-las lá dentro obrigava
 * qualquer coisa que as usasse a arrastar o Next junto, e um `check:` de linha de
 * comando não conseguia sequer importá-las.
 *
 * É a mesma separação que `indexes/positioning.ts` (puro) tem de
 * `integration/positioning.ts` (banco), e pelo mesmo motivo: a regra é o que
 * precisa ser testável e ter uma definição só.
 */
import type { VoteValue } from "@/generated/prisma";

/**
 * Votações em comum de que uma leitura de alinhamento precisa antes de existir.
 *
 * `n > 0` era o único critério, e sobre uma plataforma recém-aberta isso publica
 * o pior número possível: com um cidadão cadastrado, a maioria dos agentes
 * compartilha **uma** votação com ele, e concordar nela imprime "100% de
 * alinhamento" em tipo confiante, no card, ao lado do nome de um deputado.
 * Observado assim que a primeira pessoa votou.
 *
 * Cinco não é um número mágico — é a menor quantidade em que a leitura deixa de
 * ser uma moeda. Com uma votação a resposta só pode ser 0%, 50% ou 100%; com
 * cinco, a escala tem doze degraus e um desacordo isolado deixa de zerar tudo.
 * É a mesma disciplina de `MIN_EFFECTIVE_ITEMS` no posicionamento e de
 * `MIN_GOVERNISMO_OPPORTUNITIES`: abaixo do piso, `null` — nenhuma leitura em
 * vez de uma leitura falsa.
 */
export const MIN_ALIGNMENT_BASIS = 5;

/** O mapeamento do §3.1: sim = +1, não = −1, abstenção = 0. */
export function toScore(v: VoteValue): number {
  return v === "YES" ? 1 : v === "NO" ? -1 : 0;
}

/**
 * Agreement of two votes on the same theme → 0..1 (1 same, 0 opposite), or
 * `null` when the pair carries no information and must leave the shared set.
 *
 * ── Why two abstentions are not agreement ──────────────────────────────────
 *
 * The obvious formula — `1 - |a - b| / 2` over `{-1, 0, 1}` — scores two
 * abstentions **1.0, a perfect match**, because ABSTENTION maps to 0 on both
 * sides and the distance is zero. It is the most-criticised behaviour of the
 * Wahl-O-Mat, which awards a full match for neutral↔neutral, and here it lands
 * on a pair that resembles each other even less than that one does:
 *
 *   - a **citizen's** "Neutro" is the platform's own offer of *no opinion*;
 *   - an **agent's** abstention is a procedural manoeuvre under party
 *     instruction, and our importers additionally fold *obstrução* into it
 *     (`mapVote` in `camara.ts`) — obstruction being the opposition's tool for
 *     refusing to let a vote proceed at all.
 *
 * Two people who each declined to state a position have not agreed about
 * anything. Printing 100% there manufactures alignment out of two silences, and
 * it does so exactly where a citizen is least engaged with the theme — so the
 * effect is not random noise, it inflates the headline number for the most
 * abstention-heavy readers.
 *
 * The rule is the one euandi and smartvote use for "no opinion": **drop the
 * theme from the numerator and the denominator both**, rather than score it.
 * Scoring it 0.5 was the alternative and it is worse — it would assert half
 * agreement, which is still a claim about a pair that made none.
 *
 * A mixed pair (one side stated a position, the other abstained) keeps its 0.5:
 * there, one person did say something and the other did not go against it,
 * which is the standard treatment across every VAA in the field.
 */
export function pairAgreement(a: VoteValue, b: VoteValue): number | null {
  if (a === "ABSTENTION" && b === "ABSTENTION") return null;
  // distance is 0, 1 or 2 on the {-1,0,1} scale → map to 1, 0.5, 0.
  return 1 - Math.abs(toScore(a) - toScore(b)) / 2;
}
