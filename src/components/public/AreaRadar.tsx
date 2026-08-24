/**
 * O radar por área — a figura, sozinha e sem saber o que está medindo.
 *
 * Duas leituras a usam e elas são diferentes em espécie: a **concordância** por
 * área com um parlamentar (§3.4) e a **autoria** por área dele. Extraída aqui
 * porque desenhar duas vezes o mesmo polígono é o jeito mais confiável de as duas
 * divergirem — foi o motivo de `blobPath` e `blobThrough` viverem juntos em
 * `src/lib/viz/figure.ts`, e vale igual um nível acima.
 *
 * ── É a marca, parada ───────────────────────────────────────────────────────
 *
 * Mesma construção de `AlignmentRadar`: vértices unidos pela curva fechada,
 * sobre a mesma massa orgânica, na colorway terracota do estudo de cor. Lá ela é
 * ilustração com dados fictícios; aqui desenha leitura medida — e por isso a
 * pétala tem o tremor quase removido. **O orgânico fica por conta da massa, a
 * precisão por conta da leitura.**
 *
 * ── Buraco não é zero ───────────────────────────────────────────────────────
 *
 * Um eixo sem base é `null`, e desenhá-lo no centro afirmaria zero — que é uma
 * leitura, não uma ausência. A pétala passa só pelos eixos que existem, nos
 * ângulos verdadeiros deles, e os demais ficam marcados com um tracejado fora da
 * forma. Abaixo de três leituras não há forma nenhuma: a lista ao lado continua
 * verdadeira e a figura não inventa um triângulo.
 *
 * Server component: sem hooks, sem estado.
 */
import { blobThrough, vertexAngle, vertexPoint, GROUND_VALUES, type Field } from "@/lib/viz/figure";

const C = 250;
/**
 * Campo da leitura, e o raio é uma consequência do rótulo e não do gosto.
 *
 * A placa mora numa coluna de 19rem, então o SVG de 500 é desenhado a **0,61×**.
 * Nessa escala a fonte tem de ser dimensionada para trás: 17 unidades viram
 * ~10px na tela, que é o piso do sistema. Rótulo maior pede mais margem, e a
 * margem sai do desenho — daí 148 onde antes eram 168. Medido no navegador, não
 * estimado: a 11 unidades o rótulo saía com **6,7px**, metade do menor texto que
 * o resto do site usa.
 */
const R = 148;
const FIELD: Field = { cx: C, cy: C, radius: R };
/** A massa é a do radar da home, na mesma proporção: ela é a marca, não a escala. */
const GROUND_FIELD: Field = { cx: C, cy: C, radius: 130 };
/** O anel de referência, a 80% da escala — e a ~75% da massa. */
const RING = 0.8;
/** Tamanhos em unidades do viewBox; ver o raio acima para o porquê. */
const LABEL_SIZE = 17;
const TICK_SIZE = 15;
/** Acima disto o rótulo quebra na última palavra, para não invadir o vizinho. */
const LABEL_WRAP_AT = 12;

/** Colorway "terracota", verbatim de `AlignmentRadar`. */
const GROUND = "#a8452f";
const INK = "#f7ece0";

const GROUND_D = blobThrough(
  GROUND_VALUES.map((v, i) => vertexPoint(GROUND_FIELD, i, v, GROUND_VALUES.length)),
  4,
);

/**
 * Quebra o rótulo na última palavra quando ele é longo.
 *
 * "Educação e Ciência" e "Segurança e Justiça" numa linha só, no tamanho de que
 * precisam para serem lidos, encostam no rótulo vizinho. Quebra na ÚLTIMA
 * palavra e não no meio: "Educação e / Ciência" lê melhor que "Educação / e
 * Ciência". Palavra única não quebra — "Infraestrutura" fica como está.
 */
function wrapLabel(label: string): string[] {
  if (label.length <= LABEL_WRAP_AT) return [label];
  const i = label.lastIndexOf(" ");
  return i <= 0 ? [label] : [label.slice(0, i), label.slice(i + 1)];
}

export interface RadarAxis {
  key: string;
  label: string;
  /** 0–100, ou `null` quando o eixo não tem base — nunca 0 para dizer "não sei". */
  value: number | null;
}

export function AreaRadar({ axes, title }: { axes: RadarAxis[]; title: string }) {
  const n = axes.length;
  const read = axes
    .map((a, i) => ({ ...a, i }))
    .filter((a): a is RadarAxis & { value: number; i: number } => a.value !== null);

  const petal =
    read.length >= 3
      ? blobThrough(
          read.map((a) => vertexPoint(FIELD, a.i, a.value / 100, n)),
          1,
        )
      : "";

  return (
    <svg
      viewBox="0 0 500 500"
      className="block h-auto w-full overflow-visible"
      role="img"
      aria-label={`${title}: ${read.map((a) => `${a.label} ${a.value}%`).join(", ")}.`}
    >
      <path d={GROUND_D} fill={GROUND} />

      {axes.map((a, i) => {
        const [x, y] = vertexPoint(FIELD, i, 1, n);
        return (
          <line
            key={a.key}
            x1={C}
            y1={C}
            x2={x.toFixed(1)}
            y2={y.toFixed(1)}
            stroke={INK}
            strokeWidth={1}
            opacity={0.22}
          />
        );
      })}
      <path
        d={blobThrough(
          axes.map((_, i) => vertexPoint(FIELD, i, RING, n)),
          5,
        )}
        fill="none"
        stroke={INK}
        strokeWidth={1}
        opacity={0.22}
      />

      {petal ? (
        <path
          d={petal}
          fill={INK}
          fillOpacity={0.16}
          stroke={INK}
          strokeWidth={2.7}
          strokeLinejoin="round"
        />
      ) : null}

      {read.map((a) => {
        const [x, y] = vertexPoint(FIELD, a.i, a.value / 100, n);
        return <circle key={a.key} cx={x.toFixed(1)} cy={y.toFixed(1)} r={4.5} fill={INK} />;
      })}

      {/* Eixo sem leitura: um traço no lugar, fora da pétala. */}
      {axes
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.value === null)
        .map(({ a, i }) => {
          const [x1, y1] = vertexPoint(FIELD, i, 0.86, n);
          const [x2, y2] = vertexPoint(FIELD, i, 0.94, n);
          return (
            <line
              key={a.key}
              x1={x1.toFixed(1)}
              y1={y1.toFixed(1)}
              x2={x2.toFixed(1)}
              y2={y2.toFixed(1)}
              stroke={INK}
              strokeWidth={2}
              opacity={0.4}
              strokeDasharray="2 3"
            />
          );
        })}

      <text x={C + 8} y={C + 5} fill={INK} opacity={0.55} fontSize={TICK_SIZE} className="vt-num">
        0%
      </text>
      <text
        x={C + 8}
        y={(C - R * RING + 5).toFixed(0)}
        fill={INK}
        opacity={0.55}
        fontSize={TICK_SIZE}
        className="vt-num"
      >
        80%
      </text>

      {axes.map((a, i) => {
        const mid = Math.abs(Math.cos(vertexAngle(i, n))) < 0.2;
        const [x, y] = vertexPoint(FIELD, i, mid ? 1.28 : 1.34, n);
        const lines = wrapLabel(a.label);
        // Duas linhas sobem meia entrelinha, para o par ficar centrado no eixo
        // em vez de pender para baixo dele.
        const dy = (mid ? (y < C ? -8 : 16) : 6) - (lines.length - 1) * 9;
        return (
          <text
            key={a.key}
            x={x.toFixed(0)}
            y={(y + dy).toFixed(0)}
            textAnchor="middle"
            fontSize={LABEL_SIZE}
            fill="var(--color-muted)"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {lines.map((line, k) => (
              <tspan key={line} x={x.toFixed(0)} dy={k === 0 ? 0 : 18}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * A lista que acompanha a figura. Ela **nunca** aparece sozinha, e a figura
 * também não: a forma é a leitura de relance, os números são o que se defende
 * projeto a projeto — a convenção que `PositioningPlate` já segue.
 */
export function AreaList({
  rows,
}: {
  rows: Array<{ key: string; label: string; value: number | null; note: string }>;
}) {
  return (
    <dl className="m-0">
      {[...rows]
        .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
        .map((r) => (
          <div
            key={r.key}
            className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-line py-2.5 first:border-t-0"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <dt className="text-sm text-navy-900">{r.label}</dt>
              <div className="h-[7px] rounded-r-[4px] bg-colonial-100">
                {r.value === null ? null : (
                  <div
                    className="h-[7px] rounded-r-[4px] bg-colonial-500"
                    style={{ width: `${Math.min(100, r.value)}%` }}
                  />
                )}
              </div>
              <span className="text-[0.72rem] text-[var(--color-muted)]">{r.note}</span>
            </div>
            <dd className="vt-num text-right text-[1.05rem] leading-none text-navy-900">
              {r.value === null ? (
                <span className="font-sans text-xs text-[var(--color-muted)]">sem leitura</span>
              ) : (
                `${r.value}%`
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
