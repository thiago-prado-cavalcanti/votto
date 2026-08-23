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
import { POSITIONING_AXES } from "@/lib/indexes/positioning";

/** One vote in the ledger, as the tag the rest of the site prints it as. */
function VoteMark({ value }: { value: "YES" | "NO" | "ABSTENTION" }) {
  if (value === "YES") return <Badge tone="positive">Sim</Badge>;
  if (value === "NO") return <Badge tone="negative">Não</Badge>;
  // Stone, never ochre: an abstention is the absence of a position, and tinting
  // it would make it read as a third opinion (docs/design.md §2).
  return <Badge tone="gray">Neutro</Badge>;
}

/**
 * The worked example. Seven themes, four agreements, one half, one clash — and
 * one that leaves the table entirely: **4,5 pontos em 6**, not in 7, = 75%, and
 * a reader can verify it with a pencil.
 *
 * The numbers are deliberately not round-by-luck. A 75% built out of a ½ is what
 * makes the half-abstention rule visible, and the seventh row is what makes the
 * *other* abstention rule visible — the one nobody guesses right, because the
 * obvious arithmetic says the opposite.
 *
 * **The seven themes are perennial policy areas, never bills in play.** This page
 * explains what the platform does and must not become a snapshot of a session of
 * Congress — a named proposal reads as commentary, dates within a legislature,
 * and drags the whole figure out of date with it. So no bill number, no bracket
 * in reais, no case currently before the courts: the arithmetic is what the
 * table teaches, and it teaches it just as well over subjects that will still be
 * legible in ten years. Resist the pull to make them current again; that is what
 * `/temas` is for.
 *
 * That seventh row is the whole reason this figure exists rather than a formula.
 * Two people who each declined to state a position have not agreed about
 * anything, so the theme leaves the numerator AND the denominator. Score it 1
 * (which is what the naive distance on `{-1, 0, 1}` gives) and the platform
 * manufactures agreement out of two silences; score it 0 and it manufactures a
 * disagreement. The honest answer is that the theme does not count, and the
 * denominator saying **6** beside seven printed rows is the sentence that
 * teaches it.
 */
const EXAMPLE: Array<{
  theme: string;
  you: "YES" | "NO" | "ABSTENTION";
  agent: "YES" | "NO" | "ABSTENTION";
  worth: string;
}> = [
  { theme: "Isenção de imposto sobre medicamentos", you: "YES", agent: "YES", worth: "1" },
  { theme: "Regras do saneamento básico", you: "NO", agent: "NO", worth: "1" },
  { theme: "Reajuste do salário mínimo", you: "YES", agent: "YES", worth: "1" },
  { theme: "Licenciamento ambiental", you: "NO", agent: "NO", worth: "1" },
  { theme: "Reforma administrativa", you: "YES", agent: "ABSTENTION", worth: "½" },
  { theme: "Redução da maioridade penal", you: "NO", agent: "YES", worth: "0" },
  { theme: "Demarcação de terras indígenas", you: "ABSTENTION", agent: "ABSTENTION", worth: "—" },
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
          Exemplo com 7 temas em comum
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
          <span className="vt-num text-navy-800">6</span> temas — o sétimo saiu da
          conta, porque dois &ldquo;Neutro&rdquo; não são um acordo. Nada além disso
          entra.
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
  cost: "Fatia da cota a que tem direito que foi usada — o teto varia por estado. Gastar menos pontua mais.",
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
        <span className="text-xs text-[var(--color-muted)]">Três medidas, peso igual, régua fixa</span>
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
 * Os dois eixos em que o posicionamento é medido, nomeados e definidos.
 *
 * As definições são **lidas de `POSITIONING_AXES`**, não reescritas aqui — mesma
 * disciplina que `QualityPillars` já segue com o registro de pilares, e pelo
 * mesmo motivo: a cópia local dos rótulos de qualidade divergiu na primeira
 * renomeação. Aqui a chance de divergir é maior ainda, porque as definições são
 * traduções literais do Chapel Hill Expert Survey e o valor delas está em serem
 * exatamente aquilo.
 *
 * Deliberadamente **não** é uma escala esquerda↔direita: o veredito de cinco
 * faixas existe no código e não é publicado (CLAUDE.md §3.2), e uma figura que o
 * mostrasse aqui prometeria uma sentença que a plataforma decidiu não pronunciar.
 */
export function PositioningAxes() {
  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-1 pt-2.5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          Os dois eixos de valor
        </span>
        <span className="text-xs text-[var(--color-muted)]">
          Definições do Chapel Hill Expert Survey
        </span>
      </figcaption>

      <Axis
        label={POSITIONING_AXES.economic.label}
        negative={POSITIONING_AXES.economic.negative}
        positive={POSITIONING_AXES.economic.positive}
        question={POSITIONING_AXES.economic.definition}
        delay={360}
      />
      <Axis
        label={POSITIONING_AXES.social.label}
        negative={POSITIONING_AXES.social.negative}
        positive={POSITIONING_AXES.social.positive}
        question={POSITIONING_AXES.social.definition}
        delay={480}
      />
    </figure>
  );
}

/**
 * O peso de uma proposição, mostrado como a conta que ele é.
 *
 * Existe porque a correção mais importante do índice é invisível numa frase: um
 * tema em que a Câmara votou 470 a 21 não separa ninguém, e antes ele pesava
 * tanto quanto um votado 260 a 231. A tabela mostra o mesmo voto valendo coisas
 * diferentes conforme a votação que o cercou — que é a ideia toda, e é
 * conferível com um lápis.
 *
 * Os placares são reais em forma, não em identidade: são as três formas que uma
 * votação da Câmara assume (aclamação, disputa, pauta do Executivo), e o que a
 * tabela afirma é a REGRA, não um caso.
 */
const WEIGHTS: Array<{
  shape: string;
  tally: string;
  discrimination: string;
  government: string;
  weight: string;
}> = [
  {
    shape: "Aprovada por aclamação",
    tally: "470 × 21",
    discrimination: "0,09",
    government: "—",
    weight: "0",
  },
  {
    shape: "Disputada, sem orientação do governo",
    tally: "260 × 231",
    discrimination: "0,94",
    government: "0,10",
    weight: "0,85",
  },
  {
    shape: "Disputada, na pauta do Executivo",
    tally: "290 × 190",
    discrimination: "0,79",
    government: "0,88",
    weight: "0,09",
  },
];

export function PositioningWeights() {
  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3 pt-2.5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          Quanto vale uma votação
        </span>
        <span className="text-xs text-[var(--color-muted)]">O mesmo voto, três placares</span>
      </figcaption>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[27rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-line">
              <th className="py-2 pr-4 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                Como a casa votou
              </th>
              <th className="py-2 pr-3 text-right text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                Divide?
              </th>
              <th className="py-2 pr-3 text-right text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                É do governo?
              </th>
              <th className="py-2 text-right text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                Peso
              </th>
            </tr>
          </thead>
          <tbody>
            {WEIGHTS.map((row) => (
              <tr key={row.shape} className="border-t border-line align-middle">
                <td className="py-2.5 pr-4 text-[0.86rem] leading-snug text-navy-700">
                  {row.shape}
                  <span className="vt-num ml-2 text-[0.78rem] text-[var(--color-muted)]">
                    {row.tally}
                  </span>
                </td>
                <td className="vt-num py-2.5 pr-3 text-right text-[0.92rem] text-navy-800">
                  {row.discrimination}
                </td>
                <td className="vt-num py-2.5 pr-3 text-right text-[0.92rem] text-navy-800">
                  {row.government}
                </td>
                <td className="vt-num py-2.5 text-right text-[1.05rem] leading-none text-navy-900">
                  {row.weight}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t-2 border-navy-900 pt-4 text-[0.82rem] leading-relaxed text-[var(--color-muted)]">
        Uma votação que quase ninguém disputou não diz onde alguém está. Uma que a
        coalizão decidiu diz de que lado do governo a pessoa está — que é uma coisa
        real, mas é outra coisa.
      </p>
    </figure>
  );
}
