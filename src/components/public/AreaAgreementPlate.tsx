/**
 * Onde o cidadão concorda com um parlamentar, área a área.
 *
 * ── A figura é a da home, parada ─────────────────────────────────────────────
 *
 * Mesma construção de `AlignmentRadar`: vértices unidos pela curva fechada de
 * `blobPath`, sobre a mesma massa orgânica, na colorway terracota do estudo de
 * cor. Lá ela é ilustração de marca com dados fictícios; aqui desenha uma leitura
 * medida — e por isso a pétala tem o tremor quase removido. **O orgânico fica por
 * conta da massa, a precisão por conta da leitura.**
 *
 * ── O título não é decoração ────────────────────────────────────────────────
 *
 * Sem ele o leitor supõe que o eixo mede *dedicação ao assunto*, e não
 * concordância — foi o que aconteceu com a primeira pessoa que viu o protótipo.
 * O subtítulo nomeia a interpretação errada de propósito: nomear é o que a
 * desarma.
 *
 * ── Uma pétala, não duas ────────────────────────────────────────────────────
 *
 * A forma convencional de comparar seria sobrepor "quanto cada um votou SIM" por
 * área. Medida sobre os mesmos temas, ela **converge falsamente**: dois deputados
 * de polos opostos votam SIM em 50% e 61% dos projetos de ambiente — quase
 * idênticos — e concordam em 11%. Votam sim na mesma frequência em projetos
 * diferentes. Ver `area-alignment.ts`.
 *
 * ── Eixo sem leitura não vira zero ──────────────────────────────────────────
 *
 * Uma área abaixo do piso é `null`, e desenhá-la no centro afirmaria concordância
 * zero. A pétala passa só pelos eixos que existem (`blobThrough`), e os demais
 * ficam marcados no lugar, fora da forma. Abaixo de três leituras não há forma
 * nenhuma — só a lista, que continua verdadeira.
 *
 * Server component: sem hooks, sem estado.
 */
import { blobThrough, vertexAngle, vertexPoint, GROUND_VALUES, type Field } from "@/lib/viz/figure";
import type { AreaAgreement } from "@/lib/indexes/area-alignment";

const C = 250;
/** Campo da leitura. O anel a 80% dele fica a ~75% da massa — ver `RING`. */
const R = 168;
const FIELD: Field = { cx: C, cy: C, radius: R };
/** A massa é a do radar da home, no raio original: ela é a marca, não a escala. */
const GROUND_FIELD: Field = { cx: C, cy: C, radius: 147 };
const RING = 0.8;

/** Colorway "terracota", verbatim de `AlignmentRadar`. */
const GROUND = "#a8452f";
const INK = "#f7ece0";

export function AreaAgreementPlate({
  areas,
  agentName,
}: {
  areas: AreaAgreement[];
  agentName: string;
}) {
  const n = areas.length;
  const read = areas
    .map((a, i) => ({ ...a, i }))
    .filter((a): a is AreaAgreement & { agreement: number; i: number } => a.agreement !== null);

  const petal =
    read.length >= 3
      ? blobThrough(
          read.map((a) => vertexPoint(FIELD, a.i, a.agreement / 100, n)),
          1,
        )
      : "";

  const totalThemes = areas.reduce((max, a) => Math.max(max, a.sharedThemes), 0);

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-center">
      <figure className="m-0">
        <p className="text-[1.05rem] leading-snug text-navy-900">
          Onde você concorda com {agentName}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
          Cada eixo é a fatia dos projetos daquela área em que vocês votaram igual — não o quanto
          ele se dedica ao assunto.
        </p>

        <svg
          viewBox="0 0 500 500"
          className="mt-4 block h-auto w-full overflow-visible"
          role="img"
          aria-label={`Concordância por área com ${agentName}: ${read
            .map((a) => `${a.label} ${a.agreement}%`)
            .join(", ")}.`}
        >
          <path d={blobThrough(GROUND_VALUES.map((v, i) => vertexPoint(GROUND_FIELD, i, v, GROUND_VALUES.length)), 4)} fill={GROUND} />

          {areas.map((_, i) => {
            const [x, y] = vertexPoint(FIELD, i, 1, n);
            return (
              <line
                key={i}
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
            d={blobThrough(areas.map((_, i) => vertexPoint(FIELD, i, RING, n)), 5)}
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
            const [x, y] = vertexPoint(FIELD, a.i, a.agreement / 100, n);
            return <circle key={a.area} cx={x.toFixed(1)} cy={y.toFixed(1)} r={4.5} fill={INK} />;
          })}

          {/* Eixo sem leitura: um traço no lugar dele, fora da pétala. Marca a
              ausência em vez de fingir um zero. */}
          {areas
            .map((a, i) => ({ a, i }))
            .filter(({ a }) => a.agreement === null)
            .map(({ a, i }) => {
              const [x1, y1] = vertexPoint(FIELD, i, 0.86, n);
              const [x2, y2] = vertexPoint(FIELD, i, 0.94, n);
              return (
                <line
                  key={a.area}
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

          {areas.map((a, i) => {
            const mid = Math.abs(Math.cos(vertexAngle(i, n))) < 0.2;
            const [x, y] = vertexPoint(FIELD, i, mid ? 1.32 : 1.38, n);
            return (
              <text
                key={a.area}
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

        <figcaption className="mt-4 max-w-[46ch] text-xs leading-relaxed text-[var(--color-muted)]">
          O centro é 0% e o anel marca 80%. Um eixo tracejado é uma área com poucos projetos em
          comum — sem leitura, e não zero.
        </figcaption>
      </figure>

      <div>
        <h3 className="mb-4 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
          Concordância, projeto a projeto
        </h3>
        <dl className="m-0">
          {[...areas]
            .sort((a, b) => (b.agreement ?? -1) - (a.agreement ?? -1))
            .map((a) => (
              <div
                key={a.area}
                className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-line py-2.5 first:border-t-0"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <dt className="text-sm text-navy-900">{a.label}</dt>
                  <div className="h-[7px] rounded-r-[4px] bg-colonial-100">
                    {a.agreement === null ? null : (
                      <div
                        className="h-[7px] rounded-r-[4px] bg-colonial-500"
                        style={{ width: `${a.agreement}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[0.72rem] text-[var(--color-muted)]">
                    {a.sharedThemes === 0
                      ? "nenhum projeto em comum"
                      : `${a.sharedThemes} ${a.sharedThemes === 1 ? "projeto" : "projetos"} em comum`}
                  </span>
                </div>
                <dd className="vt-num text-right text-[1.05rem] leading-none text-navy-900">
                  {a.agreement === null ? (
                    <span className="font-sans text-xs text-[var(--color-muted)]">sem leitura</span>
                  ) : (
                    `${a.agreement}%`
                  )}
                </dd>
              </div>
            ))}
        </dl>
        {totalThemes > 0 ? null : (
          <p className="mt-4 text-xs text-[var(--color-muted)]">
            Vocês ainda não votaram nos mesmos projetos.
          </p>
        )}
      </div>
    </div>
  );
}
