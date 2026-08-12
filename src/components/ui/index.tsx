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
import * as React from "react";
import Link from "next/link";
import { alignmentInk, alignmentTone } from "@/lib/domain/tone";
import { cn } from "@/lib/cn";

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

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent-500 text-accent-50 hover:bg-accent-600",
  secondary: "bg-colonial-600 text-colonial-50 hover:bg-colonial-700",
  dark: "bg-navy-900 text-navy-50 hover:bg-navy-800",
  outline: "border border-navy-300 bg-transparent text-navy-900 hover:border-navy-900 hover:bg-navy-100",
  ghost: "text-navy-800 hover:bg-navy-100",
  danger: "bg-[var(--color-negative)] text-accent-50 hover:opacity-90",
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
      <span className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--color-muted)]">{hint}</span> : null}
    </label>
  );
}

/**
 * Two field treatments, both hairline:
 *
 * - `box` (default) — a 1px rule around the field, 4px corners. Used in the admin
 *   forms, where density and an obvious hit area matter.
 * - `rule` — no box at all, just a rule underneath, the way a form is printed.
 *   Used for the public filters (docs/design.md).
 */
type ControlVariant = "box" | "rule";

const controlBase =
  "w-full text-sm text-ink placeholder:text-[var(--color-muted)] transition-colors";

const controlVariants: Record<ControlVariant, string> = {
  box: "rounded-card border border-line bg-surface px-3 py-2.5 focus:border-navy-400",
  rule: "border-0 border-b border-navy-300 bg-transparent px-0 py-2 focus:border-navy-900 focus-visible:outline-none",
};

const control = (variant: ControlVariant = "box", className?: string) =>
  cn(controlBase, controlVariants[variant], className);

export function Input({
  variant = "box",
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { variant?: ControlVariant }) {
  return <input {...props} className={control(variant, className)} />;
}

export function Textarea({
  variant = "box",
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { variant?: ControlVariant }) {
  return <textarea {...props} className={control(variant, cn("min-h-24", className))} />;
}

export function Select({
  variant = "box",
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { variant?: ControlVariant }) {
  return <select {...props} className={control(variant, cn("appearance-none", className))} />;
}

// ─── Index meters ────────────────────────────────────────────────────────────

/**
 * Horizontal 0–100 meter used for the alignment / engagement indexes.
 *
 * A bar of pigment on a paper track — squared, no pill, no gradient; the reading
 * itself is set in the serif tabular numerals of `.vt-num`.
 */
export function AlignmentMeter({ value, label = "Alinhamento" }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
          {label}
        </span>
        <span className="vt-num text-sm" style={{ color: alignmentInk(pct) }}>
          {pct}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden bg-navy-100">
        <div className="h-full" style={{ width: `${pct}%`, background: alignmentTone(pct) }} />
      </div>
    </div>
  );
}
