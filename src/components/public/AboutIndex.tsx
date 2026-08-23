/**
 * The figures that carry the "Sobre" page's explanation of the three indexes.
 *
 * Both exist because the alternative is a formula, and a formula is exactly the
 * thing this page promised not to print. A worked example does the same job for
 * a reader who will never open `src/lib/indexes/alignment.ts`: it shows the rule
 * being applied rather than stated, and it is checkable by hand.
 *
 * They are plates in the sense the design system means (docs/design.md §4) —
 * hung under a 2px ink rule, hairline between rows, figures in the serif tabular
 * numerals — so they read as part of the same document as the mastheads.
 *
 * Server-component friendly: no client hooks. Motion is inherited from whatever
 * `.vt-reveal` block they are dropped into.
 */
import type { CSSProperties } from "react";
import { Badge } from "@/components/ui";
import { alignmentInk } from "@/lib/domain/tone";
import { QUALITY_PILLARS } from "@/lib/indexes/quality";

/** One vote in the ledger, as the tag the rest of the site prints it as. */
function VoteMark({ value }: { value: "YES" | "NO" | "ABSTENTION" }) {
  if (value === "YES") return <Badge tone="positive">Sim</Badge>;
  if (value === "NO") return <Badge tone="negative">Não</Badge>;
  // Stone, never ochre: an abstention is the absence of a position, and tinting
  // it would make it read as a third opinion (docs/design.md §2).
  return <Badge tone="gray">Neutro</Badge>;
}

/**
 * The worked example. Six themes, four agreements, one half and one clash —
 * 4,5 pontos em 6 = 75%, which a reader can verify with a pencil.
 *
 * The numbers are deliberately not round-by-luck: a 75% built out of a ½ is what
 * makes the abstention rule visible, and that rule is the only part of the
 * computation people get wrong when they guess it.
 */
const EXAMPLE: Array<{
  theme: string;
  you: "YES" | "NO" | "ABSTENTION";
  agent: "YES" | "NO" | "ABSTENTION";
  worth: string;
}> = [
  { theme: "Isenção do imposto de renda até R$ 5.000", you: "YES", agent: "YES", worth: "1" },
  { theme: "Marco legal do saneamento", you: "NO", agent: "NO", worth: "1" },
  { theme: "Piso salarial da enfermagem", you: "YES", agent: "YES", worth: "1" },
  { theme: "Licenciamento ambiental", you: "NO", agent: "NO", worth: "1" },
  { theme: "Reforma administrativa", you: "YES", agent: "ABSTENTION", worth: "½" },
  { theme: "Redução da maioridade penal", you: "NO", agent: "YES", worth: "0" },
];

const RESULT = 75;

export function AlignmentLedger() {
  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3 pt-2.5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          A conta, feita à mão
        </span>
        <span className="text-xs text-[var(--color-muted)]">
          Exemplo com 6 temas em comum
        </span>
      </figcaption>

      {/* The table is the one wide element on the page, so it scrolls inside
          itself rather than pushing the document sideways. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[27rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-line">
              <th className="py-2 pr-4 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                Tema
              </th>
              <th className="py-2 pr-3 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                Você
              </th>
              <th className="py-2 pr-3 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                A deputada
              </th>
              <th className="py-2 text-right text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                Vale
              </th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLE.map((row) => (
              <tr key={row.theme} className="border-t border-line align-middle">
                <td className="py-2.5 pr-4 text-[0.86rem] leading-snug text-navy-700">
                  {row.theme}
                </td>
                <td className="py-2.5 pr-3">
                  <VoteMark value={row.you} />
                </td>
                <td className="py-2.5 pr-3">
                  <VoteMark value={row.agent} />
                </td>
                <td className="vt-num py-2.5 text-right text-[1.05rem] leading-none text-navy-900">
                  {row.worth}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The result, given the size the reading has everywhere else on the site. */}
      <div className="flex items-end justify-between gap-4 border-t-2 border-navy-900 pt-4">
        <p className="max-w-xs text-[0.82rem] leading-relaxed text-[var(--color-muted)]">
          <span className="vt-num text-navy-800">4,5</span> pontos em{" "}
          <span className="vt-num text-navy-800">6</span> temas. Nada além disso entra
          na conta.
        </p>
        <div
          className="vt-num vt-fade text-[2.7rem] leading-none"
          style={{ ...({ "--vt-d": "420ms" } as CSSProperties), color: alignmentInk(RESULT) }}
        >
          {RESULT}
          <span className="text-[1.35rem]">%</span>
        </div>
      </div>
    </figure>
  );
}

/**
 * The four pillars of the quality index.
 *
 * Weights, and deliberately not a worked score: every pillar is a percentile
 * inside a peer group, so an illustrative agent would need an invented cohort
 * behind them to mean anything, and an invented cohort on the page that argues
 * "the data is official and checkable" is exactly the wrong thing to draw. The
 * weights, by contrast, are the whole design decision. They and the labels are
 * READ from `QUALITY_PILLARS` rather than restated here: this file used to keep
 * its own copy with the comment "the two must be changed together", and they
 * diverged on the very first rename. Only the prose stays local, keyed by
 * pillar, so a factor added to the registry shows up here missing a sentence
 * rather than silently absent.
 *
 * Pinho rather than the earth pigments of the alignment scale: this index is
 * about institutional duty, not about agreement, and the reader should be able
 * to tell the two figures apart from across the page.
 */
/** The prose for each pillar, keyed by its registry `key`. */
const PILLAR_NOTES: Record<string, string> = {
  attendance: "Votações a que compareceu, entre as que houve enquanto ocupava a cadeira.",
  production:
    "Projetos apresentados e relatados, por mês de mandato. Os que andaram contam em dobro.",
  cost: "Média mensal da cota parlamentar consumida. Aqui, gastar menos pontua mais.",
};

const PILLARS = QUALITY_PILLARS.map((pillar) => ({
  label: pillar.label,
  note: PILLAR_NOTES[pillar.key] ?? "",
}));

export function QualityPillars() {
  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3 pt-2.5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          Como o índice é formado
        </span>
        {/* The weights used to be drawn as bars. They are equal now, so four
            identical bars would be a chart of nothing — the sentence says it
            once and the rows get on with what each pillar measures. */}
        <span className="text-xs text-[var(--color-muted)]">Três medidas, peso igual</span>
      </figcaption>

      <ul>
        {PILLARS.map((pillar) => (
          <li key={pillar.label} className="border-t border-line py-3">
            <span className="text-[0.86rem] text-navy-800">{pillar.label}</span>
            <p className="mt-1 text-[0.78rem] leading-relaxed text-[var(--color-muted)]">
              {pillar.note}
            </p>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** One value axis: the two poles it runs between, and what it is asking. */
function Axis({
  label,
  negative,
  positive,
  question,
  delay,
}: {
  label: string;
  negative: string;
  positive: string;
  question: string;
  delay: number;
}) {
  return (
    <div className="border-t border-line py-5">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {label}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="font-display text-[1.05rem] leading-none text-navy-900">
          {negative}
        </span>
        {/* The scale itself: a hairline stopped by a tick at each pole. Drawn as
            a rule, like every other structure in the system.

            Rule and ticks grow as ONE object. Left outside the `.vt-grow`, the
            two ticks would land first and hang there as a pair of marks with
            nothing between them until the line caught up. */}
        <span className="relative flex h-3 flex-1 items-center" aria-hidden>
          <span
            className="vt-grow relative block h-3 w-full"
            style={{ "--vt-d": `${delay}ms` } as CSSProperties}
          >
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-navy-300" />
            <span className="absolute left-0 top-0 h-3 w-px bg-navy-400" />
            <span className="absolute right-0 top-0 h-3 w-px bg-navy-400" />
          </span>
        </span>
        <span className="font-display text-[1.05rem] leading-none text-navy-900">
          {positive}
        </span>
      </div>

      <p className="mt-3 text-[0.86rem] leading-relaxed text-navy-700">{question}</p>
    </div>
  );
}

/**
 * The two axes the positioning index is built on, named and explained.
 *
 * Deliberately *not* a left↔right scale: the single spectrum score exists in the
 * code but is not published (CLAUDE.md §3.2), and a figure that showed it here
 * would promise a verdict the platform has decided not to pronounce yet.
 */
export function PositioningAxes() {
  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="pb-1 pt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
        Os dois eixos de valor
      </figcaption>

      <Axis
        label="Eixo econômico"
        negative="Estado"
        positive="Mercado"
        question="O quanto uma decisão entrega ao poder público, e o quanto entrega à iniciativa privada."
        delay={360}
      />
      <Axis
        label="Eixo social"
        negative="Comunidade"
        positive="Indivíduo"
        question="O quanto ela protege o coletivo, e o quanto protege a escolha de cada um."
        delay={480}
      />
    </figure>
  );
}
