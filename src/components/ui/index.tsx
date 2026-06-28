/**
 * Votto base UI kit — small, dependency-free primitives shared across the public
 * site and the admin backend. Clean, fintech-grade look (CLAUDE.md §9).
 */
import * as React from "react";
import Link from "next/link";
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

type ButtonVariant = "primary" | "secondary" | "dark" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-tight transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-500 text-navy-900 shadow-[0_8px_20px_-8px_rgba(255,154,46,0.7)] hover:bg-accent-600",
  secondary: "bg-colonial-600 text-white hover:bg-colonial-700",
  dark: "bg-navy-900 text-white hover:bg-navy-800",
  outline: "border-2 border-navy-200 bg-white text-navy-900 hover:border-navy-900 hover:bg-navy-50",
  ghost: "text-navy-800 hover:bg-navy-100",
  danger: "bg-[var(--color-negative)] text-white hover:opacity-90",
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
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(11,22,34,0.04),0_8px_24px_rgba(11,22,34,0.04)]",
        className,
      )}
    >
      {children}
    </div>
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

const badgeTones: Record<BadgeTone, string> = {
  navy: "bg-navy-100 text-navy-800",
  colonial: "bg-colonial-50 text-colonial-700",
  accent: "bg-accent-100 text-accent-800",
  positive: "bg-[#e3f3ed] text-[var(--color-positive)]",
  negative: "bg-[#fbe9e5] text-[var(--color-negative)]",
  neutral: "bg-[#fbeed5] text-[var(--color-neutral)]",
  gray: "bg-[#eaeeec] text-[var(--color-muted)]",
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
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
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
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          {label}
        </div>
        <div className="mt-1.5 font-display text-4xl font-extrabold tracking-tight text-navy-900">
          {value}
        </div>
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
      <span className="mb-1.5 block text-sm font-medium text-navy-800">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--color-muted)]">{hint}</span> : null}
    </label>
  );
}

const controlBase =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-[var(--color-muted)] focus:border-navy-400";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlBase, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(controlBase, "min-h-24", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlBase, "appearance-none", props.className)} />;
}

// ─── Index meters ────────────────────────────────────────────────────────────

/** Horizontal 0–100 meter used for the alignment index. */
export function AlignmentMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const tone = pct >= 66 ? "var(--color-positive)" : pct >= 33 ? "var(--color-neutral)" : "var(--color-negative)";
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-muted)]">Alinhamento</span>
        <span className="font-semibold" style={{ color: tone }}>
          {pct}%
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#eef1f5]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}
