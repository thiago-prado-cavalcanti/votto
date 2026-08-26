/**
 * Votto base UI kit — small, dependency-free primitives shared across the public
 * site and the admin backend.
 *
 * Visual system: "papel & pigmento" (docs/design.md). Structure is carried by 1px
 * ink rules on warm paper, never by shadow; corners are 4px (`rounded-card`)
 * because paper folds, it does not round; display type is the newspaper serif at
 * weight 500, and the sans is reserved for labels, buttons, table headers and
 * microcopy.
 */
import { Bar } from "@/components/ui/Bar";
import * as React from "react";
import Link from "next/link";
import { alignmentInk, alignmentTone } from "@/lib/domain/tone";
import { cn } from "@/lib/cn";
import { control, controlHeights, type ControlVariant } from "./control";

export { Select, type SelectProps } from "./select";
export { type ControlVariant } from "./control";

// ─── Container ───────────────────────────────────────────────────────────────

export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant =
  | "primary"
  | "secondary"
  | "dark"
  | "ghost"
  | "danger"
  | "outline"
  | "inverse";
type ButtonSize = "sm" | "md" | "lg";

// Sans, 600, no shadow, 4px corners. Pigment blocks or a 1px ink rule — nothing
// floats above the paper.
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-card font-semibold tracking-tight transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Text on a filled pigment is **white**, not the warm off-white of the paper
 * palette. `accent-50` (#fbf3e8) on terracota measures 4.46:1 — under the 4.5:1
 * WCAG AA floor for body text — while white reaches 4.91:1. The paper tones are
 * for surfaces; a word sitting *on* pigment needs the full range.
 */
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent-500 text-white hover:bg-accent-600",
  secondary: "bg-colonial-600 text-colonial-50 hover:bg-colonial-700",
  dark: "bg-navy-900 text-navy-50 hover:bg-navy-800",
  outline: "border border-navy-300 bg-transparent text-navy-900 hover:border-navy-900 hover:bg-navy-100",
  ghost: "text-navy-800 hover:bg-navy-100",
  danger: "bg-[var(--color-negative)] text-white hover:opacity-90",
  // For ink backgrounds (footer, dark bands): a light hairline on nothing.
  inverse: "border border-navy-50/35 text-navy-50 hover:border-navy-50 hover:bg-navy-50/10",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)} {...props} />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}>
      {children}
    </Link>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-line bg-surface", className)}>{children}</div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("p-5 sm:p-6", className)}>{children}</div>;
}

// ─── Badge ───────────────────────────────────────────────────────────────────

type BadgeTone = "navy" | "colonial" | "accent" | "positive" | "negative" | "neutral" | "gray";

// A badge is a printed tag: squared corners, 1px rule, tinted paper, sans 600.
const badgeTones: Record<BadgeTone, string> = {
  navy: "border-navy-200 bg-navy-100 text-navy-800",
  colonial: "border-colonial-100 bg-colonial-50 text-colonial-700",
  accent: "border-accent-100 bg-accent-50 text-accent-700",
  positive: "border-[#dde3ce] bg-[#eef1e6] text-[var(--color-positive)]",
  negative: "border-[#eed7cf] bg-[#f7e9e4] text-[var(--color-negative)]",
  neutral: "border-[#e6d3ac] bg-[var(--color-ochre-light)] text-[var(--color-ochre-ink)]",
  gray: "border-line bg-navy-100 text-[var(--color-muted)]",
};

export function Badge({
  children,
  tone = "gray",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[0.7rem] font-semibold leading-5",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ─── Stat ────────────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardBody>
        <div className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
          {label}
        </div>
        <div className="vt-num mt-2 text-4xl text-navy-900">{value}</div>
        {hint ? <div className="mt-1 text-xs text-[var(--color-muted)]">{hint}</div> : null}
      </CardBody>
    </Card>
  );
}

// ─── Form fields ─────────────────────────────────────────────────────────────

/** Small caps over the field — the one way anything in a form is labelled. */
const fieldLabel =
  "block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]";

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className={cn(fieldLabel, "mb-1.5")}>{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--color-muted)]">{hint}</span> : null}
    </label>
  );
}

/**
 * `Input`, `Textarea` and `Select` share one surface, described in
 * `./control.ts`: `variant="box"` for the admin forms, `variant="rule"` for the
 * public filters. `Select` lives in its own client module because it replaces
 * the browser's dropdown with one of ours.
 */
export function Input({
  variant = "box",
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { variant?: ControlVariant }) {
  return <input {...props} className={control(variant, controlHeights[variant], className)} />;
}

export function Textarea({
  variant = "box",
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { variant?: ControlVariant }) {
  return <textarea {...props} className={control(variant, "min-h-24 py-2.5", className)} />;
}

// ─── Choices: radio and checkbox ─────────────────────────────────────────────

/**
 * A ballot mark, not a widget.
 *
 * The native control is kept for the semantics, the keyboard and the form value,
 * and hidden (`sr-only`) behind a mark we draw: a 2px square for a checkbox, a
 * circle for a radio — the one shape that is genuinely round, so `rounded-full`
 * is allowed. Checked is **ink**, like a paper form filled in with a pen, which
 * is also how the rest of the system shows a choice (an ink underline on the
 * ranking tabs); terracota stays reserved for action.
 *
 * The glyph inside the mark is coloured by `currentColor`, so a single
 * `peer-checked:text-*` on the mark reveals it — a descendant cannot be reached
 * by the sibling selector Tailwind's `peer-*` compiles to.
 */
const choiceMark = cn(
  "grid shrink-0 place-items-center border border-navy-400 bg-surface text-transparent transition-colors",
  "size-[1.125rem] mt-px",
  "peer-hover:border-navy-600 peer-checked:border-navy-900",
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-500",
  "peer-disabled:border-line peer-disabled:bg-navy-50",
);

const choiceRow = cn(
  "flex cursor-pointer items-start gap-2.5 text-sm leading-5 text-ink",
  "has-[:disabled]:cursor-not-allowed has-[:disabled]:text-[var(--color-muted)]",
);

export interface ChoiceProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  hint?: string;
}

function ChoiceLabel({ label, hint }: { label: React.ReactNode; hint?: string }) {
  return (
    <span className="min-w-0">
      <span className="block">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{hint}</span> : null}
    </span>
  );
}

export function Radio({ label, hint, className, ...props }: ChoiceProps) {
  return (
    <label className={cn(choiceRow, className)}>
      <input type="radio" className="peer sr-only" {...props} />
      <span className={cn(choiceMark, "rounded-full peer-checked:text-navy-900")} aria-hidden="true">
        <span className="size-2 rounded-full bg-current" />
      </span>
      <ChoiceLabel label={label} hint={hint} />
    </label>
  );
}

export function Checkbox({ label, hint, className, ...props }: ChoiceProps) {
  return (
    <label className={cn(choiceRow, className)}>
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        className={cn(choiceMark, "rounded-[2px] peer-checked:bg-navy-900 peer-checked:text-navy-50")}
        aria-hidden="true"
      >
        <svg viewBox="0 0 14 14" className="size-3">
          <path
            d="M2.5 7.4 5.6 10.4 11.5 3.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <ChoiceLabel label={label} hint={hint} />
    </label>
  );
}

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  hint?: string;
  disabled?: boolean;
}

/**
 * A set of radios under one small-caps legend — the `Field` of the choice
 * family. It is a `<fieldset>` rather than a `<label>` on purpose: a group of
 * controls is named by its legend, and wrapping radios in a label would make
 * every one of them answer to the same click.
 */
export function RadioGroup({
  label,
  name,
  options,
  value,
  defaultValue,
  onChange,
  hint,
  orientation = "vertical",
  className,
}: {
  label: string;
  name: string;
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  hint?: string;
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className={cn(fieldLabel, "mb-2")}>{label}</legend>
      <div
        className={cn(
          "flex gap-x-6 gap-y-2.5",
          orientation === "horizontal" ? "flex-wrap items-start" : "flex-col",
        )}
      >
        {options.map((option) => (
          <Radio
            key={option.value}
            name={name}
            value={option.value}
            label={option.label}
            hint={option.hint}
            disabled={option.disabled}
            checked={value === undefined ? undefined : value === option.value}
            defaultChecked={defaultValue === undefined ? undefined : defaultValue === option.value}
            onChange={onChange}
          />
        ))}
      </div>
      {hint ? <p className="mt-1.5 text-xs text-[var(--color-muted)]">{hint}</p> : null}
    </fieldset>
  );
}

// ─── Index meters ────────────────────────────────────────────────────────────

/**
 * Horizontal 0–100 meter used for the alignment / engagement indexes.
 *
 * A bar of pigment on a paper track — squared, no pill, no gradient; the reading
 * itself is set in the serif tabular numerals of `.vt-num`.
 *
 * Inside a revealed block the pigment wipes in from the left and the reading
 * arrives as it lands (`.vt-grow` / `.vt-fade`, globals.css). Outside one — the
 * embed widgets, the admin — the same markup renders finished, so no caller has
 * to know about the motion system.
 */
export function AlignmentMeter({ value, label = "Alinhamento" }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
          {label}
        </span>
        <span
          className="vt-num vt-fade text-sm"
          style={{ color: alignmentInk(pct), "--vt-d": "420ms" } as React.CSSProperties}
        >
          {pct}%
        </span>
      </div>
      <div className="mt-1.5">
        <Bar track="bg-navy-100" segments={[{ key: "v", width: pct, color: alignmentTone(pct) }]} />
      </div>
    </div>
  );
}
