/**
 * Alinhamento com o governo — a leitura que o índice de posicionamento não
 * precisa de portão nenhum para publicar.
 *
 * ── O que é, e por que ela é uma leitura e não um consolo ───────────────────
 *
 * `PublicAgent.governismo` é a fatia das votações nominais em que o agente votou
 * como o bloco `Governo` foi orientado a votar. Uma **contagem**, não uma
 * inferência: cada votação é um documento, e a orientação é publicada pela
 * própria casa (`RollCall.governmentPosition`). É por isso que o lote a grava
 * mesmo quando barra a casa nos três portões do §3.2 — nada nela depende deles.
 *
 * E ela não é um prêmio de consolação para quem não conseguiu publicar o eixo
 * esquerda↔direita. Zucco & Lauderdale (*LSQ* 36(3), 2011) mostram que a
 * **primeira** dimensão recuperada das votações da Câmara é governo↔oposição, e
 * que ela passou a explicar mais do comportamento legislativo do que a
 * ideológica. É justamente por ser tão forte que ela contamina o eixo econômico
 * — e é pela mesma razão que, sozinha e nomeada corretamente, ela é a leitura
 * mais fiel ao que uma votação nominal brasileira de fato mede.
 *
 * ── A regra de rótulo, que é a única coisa não negociável aqui ──────────────
 *
 * **Isto nunca é chamado de ideologia, de espectro, nem de esquerda↔direita.**
 * Um deputado do PSOL e um do NOVO podem ambos marcar 20%, e por motivos
 * opostos: um se opõe pela esquerda, o outro pela direita. O número não sabe a
 * diferença e a página não pode fingir que sabe. Chamar isso de ideologia é
 * exatamente o erro que o portão de falseamento do §3.2 existe para impedir —
 * seria cometê-lo à mão, na tela, depois de o índice ter se recusado a cometê-lo
 * na matemática.
 *
 * ── Sem faixas ─────────────────────────────────────────────────────────────
 *
 * Nenhuma banda, nenhum rótulo qualitativo. "Governista" é palavra carregada no
 * Brasil e transformaria uma contagem numa acusação. O que se publica é o
 * número, os dois polos e o denominador — que é a mesma disciplina da
 * performance política ("92% · 312 de 340 votações"): o índice é a leitura, o
 * número bruto é o que o cidadão confere.
 */

/** Leitura publicável do alinhamento com o governo. */
export interface GovernismoReading {
  /** 0–100: fatia das votações seguidas a orientação do Governo. */
  value: number;
  /** Votações com orientação em que o agente esteve presente. */
  base: number;
}

/**
 * A leitura de um agente, ou `null` quando não há uma.
 *
 * `null` cobre dois casos que a página trata igual e que são, no fundo, o mesmo:
 * a casa não publica orientação de bancada, ou o agente não alcançou o piso de
 * oportunidades. Em ambos não há o que afirmar.
 */
export function governismoReading(
  value: number | null | undefined,
  base: number | null | undefined,
): GovernismoReading | null {
  if (value === null || value === undefined) return null;
  // Sem denominador não se publica. Uma leitura antiga, gravada antes de a
  // coluna existir, é tratada como ausente em vez de impressa pela metade.
  if (base === null || base === undefined || base <= 0) return null;
  return { value: Math.max(0, Math.min(100, value)), base };
}

/** Os dois polos, na ordem em que a barra os desenha. */
export const GOVERNISMO_POLES = {
  low: "Vota contra",
  high: "Vota com o governo",
} as const;

/**
 * Frase que acompanha o número, sempre no mesmo formato.
 *
 * Deliberadamente descritiva e sem adjetivo: diz o que foi contado e sobre
 * quantas oportunidades, e para por aí.
 */
export function describeGovernismo(r: GovernismoReading): string {
  return `${r.value}% das ${r.base.toLocaleString("pt-BR")} votações com orientação do governo`;
}
