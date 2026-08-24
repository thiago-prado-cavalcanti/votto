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
/** Campo da leitura: 100% fica a um passo da borda interna da massa. */
const R = 168;
const FIELD: Field = { cx: C, cy: C, radius: R };
/** A massa é a do radar da home, no raio original: ela é a marca, não a escala. */
const GROUND_FIELD: Field = { cx: C, cy: C, radius: 147 };
/** O anel de referência, a 80% da escala — e a ~75% da massa. */
const RING = 0.8;

/** Colorway "terracota", verbatim de `AlignmentRadar`. */
const GROUND = "#a8452f";
const INK = "#f7ece0";

const GROUND_D = blobThrough(
  GROUND_VALUES.map((v, i) => vertexPoint(GROUND_FIELD, i, v, GROUND_VALUES.length)),
  4,
);

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

      <text x={C + 7} y={C + 3} fill={INK} opacity={0.55} fontSize={11} className="vt-num">
        0%
      </text>
      <text
        x={C + 7}
        y={(C - R * RING + 4).toFixed(0)}
        fill={INK}
        opacity={0.55}
        fontSize={11}
        className="vt-num"
      >
        80%
      </text>

      {axes.map((a, i) => {
        const mid = Math.abs(Math.cos(vertexAngle(i, n))) < 0.2;
        const [x, y] = vertexPoint(FIELD, i, mid ? 1.32 : 1.38, n);
        return (
          <text
            key={a.key}
            x={x.toFixed(0)}
            y={(y + (mid ? (y < C ? -6 : 14) : 4)).toFixed(0)}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-muted)"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {a.label}
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
