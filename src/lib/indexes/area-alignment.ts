/**
 * Concordância por área de política — a mesma conta do alinhamento, particionada.
 *
 * ── O que ela afirma, e o que deliberadamente não afirma ─────────────────────
 *
 * *"Vocês votaram igual em 30% dos projetos de Direitos em que ambos votaram."*
 * É **contagem sobre documentos públicos**, defensável projeto a projeto, e é
 * por isso que ela não precisa de régua externa nenhuma — ao contrário do índice
 * de posicionamento (§3.2), que precisava afirmar onde a pessoa está num
 * espectro e reprovou em três testes independentes.
 *
 * Ela **não** diz o quanto o parlamentar se dedica àquela área. Isso é outra
 * leitura, feita sobre os projetos que ele *apresentou*, e as duas não se
 * confundem: votar é reagir à pauta que a Mesa montou, apresentar é escolha
 * dele. Medido em 24/08/2026, a distribuição de votos por área varia ±5 pontos
 * entre os 623 deputados — praticamente a mesma para todos, porque é a pauta e
 * não a pessoa.
 *
 * ── Por que a sobreposição de duas pétalas foi descartada ────────────────────
 *
 * A forma convencional para comparar seria sobrepor "quanto cada um votou SIM"
 * por área. Medido sobre os mesmos temas, ela **converge falsamente**: Lindbergh
 * Farias (PT) e Nikolas Ferreira (PL) votam SIM em 50% e 61% dos projetos de
 * ambiente — quase idênticos — e concordam em **11%**. Votam SIM na mesma
 * frequência em projetos diferentes. Duas pétalas coladas sugeririam alinhamento
 * onde não há nenhum, e é o que esta leitura evita ao contar projeto a projeto.
 *
 * A figura correta é uma pétala só, e o problema que sobra é de rótulo, não de
 * geometria: sem um título dizendo *"onde você concorda com fulano"*, o leitor
 * supõe que o eixo mede dedicação ao assunto.
 */
import { db } from "@/lib/db";
import { MIN_ALIGNMENT_BASIS, pairAgreement } from "@/lib/indexes/agreement";
import { POLICY_AREAS, themeAreas, type PolicyArea } from "@/lib/domain/policy-areas";
import type { VoteValue } from "@/generated/prisma";

/** A leitura de um eixo. `agreement` é `null` quando a área não alcança o piso. */
export interface AreaAgreement {
  area: PolicyArea;
  label: string;
  /** 0–100, ou `null` abaixo do piso. */
  agreement: number | null;
  /** Temas que de fato informaram a leitura — o número impresso ao lado. */
  sharedThemes: number;
}

/**
 * Um par de votos sobre um tema, com as áreas que esse tema toca.
 *
 * Um tema entra em **cada** área que toca: as taxonomias são multi-etiqueta e um
 * projeto de saneamento é saúde e infraestrutura ao mesmo tempo. Os eixos são
 * independentes de 0 a 100% e **não somam 100%** — o que é correto para
 * concordância e seria errado para uma distribuição.
 */
export interface AreaVotePair {
  areas: Iterable<PolicyArea>;
  a: VoteValue;
  b: VoteValue;
}

/**
 * A conta, pura — sem banco, sem cache, sem relógio.
 *
 * Devolve **as nove áreas sempre**, na ordem de `POLICY_AREAS`, com `null` onde
 * não há base. Um eixo ausente e um eixo vazio são coisas diferentes na figura:
 * o primeiro deforma o polígono, o segundo diz "não sei". A mesma razão pela
 * qual `qualityScore` é nulo em vez de zero — um vazio que parece leitura é pior
 * que um vazio declarado.
 */
export function areaAgreements(pairs: Iterable<AreaVotePair>): AreaAgreement[] {
  const acc = new Map<PolicyArea, { sum: number; n: number }>();

  for (const pair of pairs) {
    // `null` é a dupla abstenção: o tema sai do numerador E do denominador, a
    // regra do §3.1. Vale por área exatamente como vale no total.
    const agreement = pairAgreement(pair.a, pair.b);
    if (agreement === null) continue;
    for (const area of pair.areas) {
      const cur = acc.get(area) ?? { sum: 0, n: 0 };
      cur.sum += agreement;
      cur.n += 1;
      acc.set(area, cur);
    }
  }

  return POLICY_AREAS.map(({ key, label }) => {
    const cur = acc.get(key);
    const n = cur?.n ?? 0;
    return {
      area: key,
      label,
      // O mesmo piso da leitura global, e pelo mesmo motivo: com poucos temas em
      // comum a área só sabe dizer 0%, 50% ou 100%, e nenhum dos três é uma
      // afirmação sobre uma pessoa.
      agreement: cur && n >= MIN_ALIGNMENT_BASIS ? Math.round((cur.sum / n) * 100) : null,
      sharedThemes: n,
    };
  });
}

/**
 * Concordância por área entre um cidadão e um parlamentar.
 *
 * Restrita aos temas que **os dois** votaram, que é o mesmo conjunto do
 * alinhamento global — a partição não muda o denominador, só o distribui.
 */
export async function citizenAgentAreaAgreement(
  userId: string,
  agentKid: string,
): Promise<AreaAgreement[]> {
  const userVotes = await db.vote.findMany({
    where: { userId, voterType: "USER" },
    select: { themeId: true, value: true },
  });
  if (userVotes.length === 0) return areaAgreements([]);

  const byTheme = new Map(userVotes.map((v) => [v.themeId, v.value]));
  const agentVotes = await db.vote.findMany({
    where: {
      voterType: "AGENT",
      agent: { kid: agentKid, status: "ACTIVE" },
      themeId: { in: [...byTheme.keys()] },
    },
    select: {
      value: true,
      themeId: true,
      theme: { select: { house: true, classifications: true } },
    },
  });

  const pairs: AreaVotePair[] = [];
  for (const av of agentVotes) {
    const mine = byTheme.get(av.themeId);
    if (!mine) continue;
    const areas = themeAreas(av.theme?.classifications, av.theme?.house);
    // Tema sem classificação não some da leitura global — só não entra em
    // nenhum eixo. É o custo de a fila da IA e as casas não cobrirem tudo, e a
    // página deve dizer isso em vez de fingir que o tema não existiu.
    if (areas.size === 0) continue;
    pairs.push({ areas, a: mine, b: av.value });
  }

  return areaAgreements(pairs);
}
