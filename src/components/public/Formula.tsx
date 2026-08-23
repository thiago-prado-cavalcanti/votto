/**
 * Typeset mathematics, in the same ink as the rest of the document.
 *
 * `/metodologia` is the one public page that prints formulas, and it prints a
 * lot of them. Two options were on the table and only one of them is this
 * design system: a LaTeX renderer (KaTeX/MathJax) would add a dependency, a
 * webfont of its own and a second typographic voice — a page that argues "every
 * number here is checkable" set in a typeface that appears nowhere else on the
 * site reads as a quotation from another document.
 *
 * So the maths is composed out of the system's own parts: the newspaper serif at
 * weight 500, tabular numerals for figures, a 1px ink rule for the fraction bar,
 * and the ochre grifo for the constants that are read from the source rather
 * than written into the page. A formula is a `figure`, hung under the same 2px
 * ink rule as every plate (docs/design.md §4).
 *
 * ── The authoring rule ─────────────────────────────────────────────────────
 *
 * A `Line` is a flex row, so **every literal must be wrapped** — `<Txt>`, `<Op>`,
 * `<Var>`, `<Num>` — because whitespace between elements collapses inside a flex
 * container and a bare `" = "` would lose its spaces. Spacing is carried by the
 * components' own margins, which is also what keeps it even across formulas.
 *
 * Wide expressions scroll inside the block rather than wrapping mid-expression:
 * a formula broken across two lines at an arbitrary point is harder to read than
 * one the reader drags sideways, and the page body must never scroll (§9).
 *
 * Screen readers get `plain` — the formula said out loud — via `role="math"`.
 * Without it the row reads as a stream of loose symbols.
 *
 * Server-component friendly apart from the `Reveal` wrapper, which is the same
 * client component every other block on the site arrives with.
 */
import * as React from "react";
import { Reveal } from "@/components/public/motion";
import { cn } from "@/lib/cn";

/** A variable: the serif italic, the way a printed equation sets one. */
export function Var({ children }: { children: React.ReactNode }) {
  return <i className="font-display italic text-navy-900">{children}</i>;
}

/** A number written into the formula itself (a 2, a ½, a 100). */
export function Num({ children }: { children: React.ReactNode }) {
  return <span className="vt-num text-navy-900">{children}</span>;
}

/**
 * A published constant, in the ochre grifo — and always read from the source,
 * never typed into the page.
 *
 * The colour is doing a job: it marks the numbers a reader could check against
 * the code, and separates them from the arithmetic around them (the 2 in a
 * denominator is not a decision anybody made).
 */
export function Const({ children }: { children: React.ReactNode }) {
  return <span className="vt-num text-[var(--color-ochre-ink)]">{children}</span>;
}

/** An operator, in the quieter ink, with the space a printed one carries. */
export function Op({ children }: { children: React.ReactNode }) {
  return <span className="mx-[0.34em] text-navy-500">{children}</span>;
}

/** Words inside an expression — a condition, a unit — set in the sans. */
export function Txt({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-[0.3em] font-sans text-[0.76em] text-[var(--color-muted)]">
      {children}
    </span>
  );
}

/**
 * Function application — `s(v)`, `ln(1 + r/α)` — with delimiters that stay out
 * of the way.
 *
 * `scale` grows the parentheses when the argument is tall: a fraction inside
 * 1em parens looks like it broke out of them, which is the one thing printed
 * maths never does.
 */
export function Fn({
  name,
  children,
  scale = 1,
}: {
  name: React.ReactNode;
  children: React.ReactNode;
  scale?: number;
}) {
  const style = scale === 1 ? undefined : ({ fontSize: `${scale}em` } as React.CSSProperties);
  return (
    <span className="inline-flex items-center">
      <i className="font-display italic text-navy-900">{name}</i>
      <span className="leading-none text-navy-400" style={style}>
        (
      </span>
      {children}
      <span className="leading-none text-navy-400" style={style}>
        )
      </span>
    </span>
  );
}

export function Sub({ children }: { children: React.ReactNode }) {
  return <sub className="text-[0.62em] text-navy-600">{children}</sub>;
}

export function Sup({ children }: { children: React.ReactNode }) {
  return <sup className="text-[0.62em] text-navy-600">{children}</sup>;
}

/** A fraction: numerator over denominator, split by the system's hairline. */
export function Frac({
  over,
  under,
}: {
  over: React.ReactNode;
  under: React.ReactNode;
}) {
  return (
    <span className="mx-[0.28em] inline-flex flex-col items-center text-[0.94em] leading-[1.25]">
      <span className="px-[0.4em] pb-[0.15em]">{over}</span>
      <span className="w-full border-t border-navy-800 px-[0.4em] pt-[0.15em] text-center">
        {under}
      </span>
    </span>
  );
}

/** A summation, with its index under and its bound over. */
export function Sum({
  from,
  to,
  children,
}: {
  from?: React.ReactNode;
  to?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      <span className="mx-[0.2em] inline-flex flex-col items-center leading-none">
        <span className="text-[0.55em] text-navy-500">{to}</span>
        <span className="text-[1.45em] leading-[0.9] text-navy-900">Σ</span>
        <span className="text-[0.55em] text-navy-500">{from}</span>
      </span>
      {children}
    </>
  );
}

/** A radical: the sign, then the radicand under a drawn rule. */
export function Sqrt({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-[0.15em] inline-flex items-stretch">
      <span className="self-center text-[1.2em] text-navy-800">√</span>
      <span className="border-t border-navy-800 px-[0.2em] pt-[0.12em]">{children}</span>
    </span>
  );
}

/** Parentheses scaled to what they hold, so a fraction is not pinched by them. */
export function Paren({
  children,
  scale = 1.6,
}: {
  children: React.ReactNode;
  scale?: number;
}) {
  const delim = "leading-none text-navy-400";
  const style = { fontSize: `${scale}em` } as React.CSSProperties;
  return (
    <>
      <span className={delim} style={style}>
        (
      </span>
      {children}
      <span className={delim} style={style}>
        )
      </span>
    </>
  );
}

/** Absolute value, drawn as two rules rather than as pipe characters. */
export function Abs({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-[0.18em] inline-flex items-stretch">
      <span className="w-px self-stretch bg-navy-400" />
      <span className="px-[0.3em]">{children}</span>
      <span className="w-px self-stretch bg-navy-400" />
    </span>
  );
}

/**
 * One display line of an expression.
 *
 * `w-max` rather than wrapping: the block around it scrolls, so a long line is
 * dragged sideways instead of being broken at whatever point happens to fall off
 * the screen.
 */
export function Line({
  children,
  note,
  className,
}: {
  children: React.ReactNode;
  /** A quiet aside to the right of the line — "com pesos iguais", "por casa". */
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-max max-w-full items-center gap-4", className)}>
      <div className="flex w-max items-center font-display text-[1.06rem] leading-none text-navy-900">
        {children}
      </div>
      {note ? (
        <span className="shrink-0 font-sans text-[0.72rem] text-[var(--color-muted)]">
          {note}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A piecewise definition, marked by a rule on the left rather than by a brace.
 *
 * The brace is the printed convention; the rule is this system's (`RuleItem` on
 * the legal pages), and a 2.4em glyph never aligns with the rows it is supposed
 * to embrace anyway.
 */
export function Cases({
  rows,
}: {
  rows: Array<{ value: React.ReactNode; when: React.ReactNode }>;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-l-2 border-navy-800 pl-4">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex w-max items-center font-display text-[1.02rem] leading-none text-navy-900">
            {row.value}
          </div>
          <span className="font-sans text-[0.76rem] text-[var(--color-muted)]">
            {row.when}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One entry of the legend under a formula. */
export interface FormulaSymbol {
  sym: React.ReactNode;
  def: React.ReactNode;
}

/**
 * A display formula: ink rule, caption, the expression on paper, then the
 * legend of its symbols.
 *
 * The legend is not optional decoration — a formula whose symbols are not
 * defined on the same screen is a picture of rigour rather than rigour.
 */
export function Formula({
  label,
  note,
  plain,
  where,
  cite,
  children,
  className,
}: {
  /** What the expression is, in words: "Concordância de um par". */
  label: string;
  /** The right-hand caption: scale, range, unit. */
  note?: React.ReactNode;
  /** The formula read out loud, for screen readers. */
  plain?: string;
  /** Symbol legend. */
  where?: FormulaSymbol[];
  /** Source of the method, printed under the legend. */
  cite?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Reveal
      as="figure"
      variant="fade"
      className={cn("my-8 border-t-2 border-navy-900", className)}
    >
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3 pt-2.5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          {label}
        </span>
        {note ? (
          <span className="text-xs text-[var(--color-muted)]">{note}</span>
        ) : null}
      </figcaption>

      <div className="overflow-x-auto border-y border-line bg-surface px-5 py-6">
        <div
          className="flex flex-col gap-4"
          role={plain ? "math" : undefined}
          aria-label={plain}
        >
          {children}
        </div>
      </div>

      {where && where.length > 0 ? (
        <dl className="grid gap-x-5 gap-y-2 pt-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          {where.map((item, i) => (
            <React.Fragment key={i}>
              <dt className="font-display text-[0.95rem] leading-snug text-navy-900">
                {item.sym}
              </dt>
              <dd className="text-[0.86rem] leading-[1.6] text-navy-700">{item.def}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}

      {cite ? (
        <p className="mt-3 border-t border-line pt-3 text-[0.78rem] leading-relaxed text-[var(--color-muted)]">
          {cite}
        </p>
      ) : null}
    </Reveal>
  );
}
