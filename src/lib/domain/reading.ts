/**
 * Which alignment figure a public surface prints, and what it is called.
 *
 * There are two readings of the same kind and they must never appear together:
 *
 * - **the base** — the agent against the citizens who declared them as their
 *   representative (`AgentFollow`). This is the real question, and the honest
 *   denominator: nobody is elected by everybody.
 * - **the electorate** — the agent against the aggregate of every citizen who
 *   voted. A proxy, and the only one that existed before following did.
 *
 * The rule is: the base wins wherever there is one, the electorate stands in
 * where there is not. A blank would be worse than the proxy — every agent would
 * lose its number until the first followers arrived — and printing both would
 * ask the reader to arbitrate between two figures that answer the same question.
 *
 * Every surface (cards, records, party pages, embeds, OG images, rankings) calls
 * this, so they cannot drift apart.
 */
import type { BaseAlignment } from "@/lib/indexes/alignment";

export interface PublicReading {
  /** 0–100, or null when neither reading can be computed yet. */
  value: number | null;
  /** Full label, for a meter that stands on its own. */
  label: string;
  /** Short label, for a plate where the caption already says "Alinhamento". */
  shortLabel: string;
  /** True when the figure comes from the agent's own base. */
  fromBase: boolean;
  /** Citizens in the base — 0 when nobody follows them yet. */
  followers: number;
}

/**
 * Resolve the published reading for one agent or party.
 *
 * @param base The base reading, or undefined when nobody follows them.
 * @param engagement The electorate figure (0–100), or null when unavailable.
 */
export function publicReading(
  base: BaseAlignment | undefined,
  engagement: number | null,
): PublicReading {
  // Três condições, e a dos seguidores é dita aqui de propósito. Ela já valia —
  // `agentBaseAlignments` só cria entrada para agente seguido —, mas valia como
  // consequência do formato de um `findMany` duzentas linhas adiante. Uma
  // consulta reescrita para trazer todos os agentes, por qualquer motivo
  // razoável, publicaria "alinhamento com a base" de um parlamentar que ninguém
  // segue, e nada aqui teria reclamado. Uma base vazia não tem posição média:
  // não existe leitura para calcular, e um número no lugar dela seria invenção.
  if (base && base.followers > 0 && base.alignment !== null) {
    return {
      value: base.alignment,
      label: "Alinhamento com a base",
      shortLabel: "Com a base",
      fromBase: true,
      followers: base.followers,
    };
  }
  return {
    value: engagement,
    label: "Alinhamento com eleitores",
    shortLabel: "Com os eleitores",
    fromBase: false,
    // The base may exist without a reading yet (followers who have not voted);
    // the count is still true and still worth printing.
    followers: base?.followers ?? 0,
  };
}

/** "1.284 pessoas acompanham" — the sentence a follower count belongs in. */
export function followersNote(followers: number): string {
  return followers === 1
    ? "1 pessoa acompanha este agente"
    : `${followers.toLocaleString("pt-BR")} pessoas acompanham este agente`;
}
