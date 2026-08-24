/**
 * Autoria por área — sobre o que o parlamentar trabalha, pelo que ele protocolou.
 *
 * A leitura irmã da concordância por área (§3.4), e a diferença entre as duas é
 * a razão de esta existir: **votar é reagir à pauta que a Mesa montou,
 * apresentar é escolha da pessoa**. Medido em 24/08/2026, a distribuição de
 * votos por área varia ±5 pontos entre os 623 deputados — praticamente idêntica
 * para todos, porque descreve a pauta e não quem votou. A autoria é o traço que
 * sobra.
 *
 * ── Descritiva, nunca inferencial ───────────────────────────────────────────
 *
 * *"Dos 47 projetos que apresentou, 40% são de saúde"* é um **censo**: conta
 * documentos públicos, não tem erro padrão e se defende projeto a projeto.
 * *"Ele se interessa por saúde"* estimaria uma disposição latente a partir da
 * mesma contagem, e aí o n passa a importar muito — com o deputado mediano
 * protocolando 4 a 6 projetos, essa estimativa carregaria ±40pp. A plataforma
 * publica a primeira frase. É por isso que o total viaja sempre junto, a mesma
 * regra de `governismoBase` (§3.2) e do "312 de 340 votações" do §3.3.
 *
 * ── O piso é sobre o total, e não sobre a fatia ─────────────────────────────
 *
 * Porque isto é **uma** distribuição multinomial, não nove leituras
 * independentes: as fatias vêm todas do mesmo denominador, então o que decide se
 * há leitura é quantos projetos existem ao todo. Um piso por área faria o
 * contrário do pretendido — apagaria justamente as áreas pequenas, que são as
 * que informam o perfil, deixando de pé só a maior. Abaixo de
 * `MIN_AUTHORSHIP_TOTAL` não há figura nenhuma, e a página imprime a contagem
 * crua, que continua verdadeira.
 *
 * ── As fatias não somam 100% ────────────────────────────────────────────────
 *
 * As taxonomias das casas são multi-etiqueta e `codTema` faz **união**: um
 * projeto de saneamento é saúde e infraestrutura, e conta nas duas. Cada eixo é
 * uma fração do mesmo total, de 0 a 100%, e a soma passa de 100 — o que é
 * correto aqui e seria erro numa pizza. Nunca desenhar isto como partes de um
 * todo.
 */
import { POLICY_AREAS, type PolicyArea } from "@/lib/domain/policy-areas";

/**
 * Abaixo disto não se publica figura. Não é um teste estatístico — não há
 * inferência a proteger — é o ponto em que a figura deixa de ser mais legível
 * que a frase: com 6 projetos, cada fatia só pode assumir sete valores e o
 * polígono vira ruído com aparência de perfil.
 */
export const MIN_AUTHORSHIP_TOTAL = 10;

/** O que `syncAuthorship` grava em `PublicAgent.authorshipAreas`. */
export interface AuthorshipAreas {
  /** Proposições do mandato corrente, todas as áreas — inclusive as sem área. */
  total: number;
  /** Contagem por área. Ausente é zero aqui: a varredura mede todas as nove. */
  byArea: Partial<Record<PolicyArea, number>>;
}

export interface AuthorshipSlice {
  area: PolicyArea;
  label: string;
  /** Projetos daquela área. */
  count: number;
  /** `count / total`, 0–100. */
  share: number;
}

export interface AuthorshipReading {
  total: number;
  /** As nove áreas sempre, em ordem de `POLICY_AREAS`. */
  slices: AuthorshipSlice[];
  /** Falso quando o total não alcança o piso: há contagem, não há figura. */
  publishable: boolean;
}

/**
 * Interpreta a coluna JSON. Devolve `null` quando a varredura nunca rodou para
 * o parlamentar — que é diferente de "protocolou zero projetos", e as duas
 * coisas precisam de frases diferentes na página.
 */
export function authorshipReading(raw: unknown): AuthorshipReading | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<AuthorshipAreas>;
  if (typeof data.total !== "number" || !Number.isFinite(data.total)) return null;
  const byArea = (data.byArea ?? {}) as Partial<Record<PolicyArea, number>>;

  const slices = POLICY_AREAS.map(({ key, label }) => {
    const count = byArea[key] ?? 0;
    return {
      area: key,
      label,
      count,
      share: data.total! > 0 ? Math.round((count / data.total!) * 100) : 0,
    };
  });

  return {
    total: data.total,
    slices,
    publishable: data.total >= MIN_AUTHORSHIP_TOTAL,
  };
}
