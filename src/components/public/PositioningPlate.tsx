/**
 * A leitura de posicionamento, com o que a sustenta impresso ao lado.
 *
 * A figura sozinha (`PositioningChart`) mostra uma inclinação; esta placa é o
 * que impede a inclinação de ser lida como precisão que ela não tem. Três coisas
 * vêm junto, e nenhuma é decorativa:
 *
 * - **o número bruto de proposições** que entraram em cada eixo. É a mesma regra
 *   que a performance política já segue ("92% · 312 de 340 votações"): o índice
 *   é a leitura, o número é o que o cidadão confere;
 * - **a margem**, quando existe. Uma posição de −40 com margem de ±25 e uma de
 *   −40 com margem de ±6 são afirmações diferentes, e imprimir só a primeira
 *   metade é afirmar a segunda;
 * - **a proposição mais influente**, quando uma sozinha desloca a leitura mais
 *   que alguns pontos. Se um projeto move o número em quinze, o número é um
 *   relatório sobre aquele projeto, e quem lê tem direito de saber qual.
 *
 * O padrão vem do Voteview, que publica `number_of_votes` e `number_of_errors`
 * ao lado de cada ponto ideal: **a estatística de ajuste viaja com a estimativa**,
 * e é isso que separa um índice defensável de um teste de internet.
 *
 * Sem faixa. A conta que reduziria os dois eixos a "Centro direita" existe e
 * continua não publicada (CLAUDE.md §3.2) — aqui, o que se mostra é a forma e o
 * que ela custou.
 *
 * Server-component friendly (sem hooks de cliente).
 */
import { PositioningChart } from "@/components/public/PositioningChart";
import { POSITIONING_AXES, type AxisReading } from "@/lib/indexes/positioning";

/** Uma linha de eixo: polos, valor e o que o sustenta. */
function AxisRow({
  axis,
  value,
  reading,
}: {
  axis: keyof typeof POSITIONING_AXES;
  value: number | null;
  reading?: AxisReading;
}) {
  const meta = POSITIONING_AXES[axis];
  const items = reading?.items ?? 0;
  const se = reading?.standardError ?? null;

  return (
    <div className="border-t border-line py-3">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-xs text-[var(--color-muted)]">
          {meta.negative} ↔ {meta.positive}
        </dt>
        <dd className="vt-num text-[1.05rem] leading-none text-navy-900">
          {value === null ? (
            <span className="font-sans text-xs text-[var(--color-muted)]">sem leitura</span>
          ) : (
            <>
              {value > 0 ? `+${value}` : value}
              {se !== null ? (
                <span className="text-[0.72rem] text-[var(--color-muted)]"> ± {se}</span>
              ) : null}
            </>
          )}
        </dd>
      </div>
      {value !== null && items > 0 ? (
        <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--color-muted)]">
          {items} {items === 1 ? "proposição classificada" : "proposições classificadas"}
          {reading?.influence && reading.influence.delta >= 5
            ? ` · uma delas responde por ${reading.influence.delta.toFixed(0)} pontos`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

export function PositioningPlate({
  economic,
  social,
  detail,
  /** Só para partidos: dispersão interna e coesão, com a tira de membros. */
  party,
}: {
  economic: number | null;
  social: number | null;
  detail?: {
    economic?: AxisReading;
    social?: AxisReading;
    socialCollinear?: boolean;
  } | null;
  party?: {
    /** Média observada antes do encolhimento. */
    observed: number | null;
    /** Dispersão real entre os membros, com o ruído de medição descontado. */
    dispersion: number | null;
    members: number;
    /** Coesão em excesso sobre o acaso, 0–100. */
    cohesion: number | null;
  };
}) {
  const hasReading = economic !== null || social !== null;

  if (!hasReading) {
    return (
      <div className="border-t-2 border-navy-900 pt-4">
        <p className="text-[0.86rem] leading-relaxed text-navy-700">
          Ainda não há proposições classificadas suficientes para posicionar.
        </p>
        <p className="mt-2 text-[0.78rem] leading-relaxed text-[var(--color-muted)]">
          A leitura fica em branco em vez de aparecer no centro: zero, nesses eixos, é a
          coordenada de quem está no meio — e não a de quem não foi medido.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PositioningChart economic={economic} social={social} />

      <dl className="mt-4">
        <AxisRow axis="economic" value={economic} reading={detail?.economic} />
        <AxisRow axis="social" value={social} reading={detail?.social} />
      </dl>

      {detail?.socialCollinear ? (
        // Dito aqui, e não escondido na metodologia, porque é a explicação de
        // uma ausência na própria página em que ela aparece. Nos partidos
        // brasileiros os dois eixos correlacionam a 0,94: quem está à esquerda
        // na economia está à esquerda nos costumes quase sempre, e imprimir dois
        // números afirmaria duas leituras independentes onde há uma.
        <p className="border-t border-line pt-3 text-[0.7rem] leading-relaxed text-[var(--color-muted)]">
          No Brasil os dois eixos quase não se separam — posição econômica e
          posição em costumes andam juntas. Por isso o segundo eixo entra na
          figura e não vira número à parte.
        </p>
      ) : null}

      {party ? (
        <div className="border-t border-line pt-3">
          <p className="text-[0.7rem] leading-relaxed text-[var(--color-muted)]">
            Média de {party.members}{" "}
            {party.members === 1 ? "parlamentar medido" : "parlamentares medidos"}
            {party.observed !== null && economic !== null && party.observed !== economic
              ? `, puxada de ${party.observed > 0 ? "+" : ""}${party.observed} para ${
                  economic > 0 ? "+" : ""
                }${economic} em direção à média da casa`
              : ""}
            .
          </p>
          {party.dispersion !== null && party.dispersion > 0 ? (
            <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--color-muted)]">
              A bancada se espalha ± {party.dispersion} pontos em torno dessa posição
              {party.cohesion !== null ? ` · coesão ${party.cohesion}%` : ""}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
