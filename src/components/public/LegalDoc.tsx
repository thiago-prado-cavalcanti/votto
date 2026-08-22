/**
 * The shared furniture of a legal page — privacy policy, terms, data deletion.
 *
 * These documents are the one place where Votto is read *literally*, so they get
 * the same treatment as the rest of the site rather than a wall of grey text:
 * a numbered clause, a hairline rule between clauses, and the serif at reading
 * size (docs/design.md — "a page is a document, not a dashboard").
 */
import * as React from "react";
import Link from "next/link";
import { Reveal } from "@/components/public/motion";
import { CONTROLLER } from "@/lib/legal";

/** A numbered clause: the index number in tabular figures, then the heading. */
export function Clause({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal as="section" variant="fade" className="border-t border-line pt-8">
      <h2 className="flex gap-3 text-[1.35rem] leading-tight text-navy-900">
        <span className="vt-num pt-[0.2em] text-[0.8rem] text-navy-500">
          {String(n).padStart(2, "0")}
        </span>
        <span>{title}</span>
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-[0.95rem] leading-[1.7] text-navy-700">
        {children}
      </div>
    </Reveal>
  );
}

/** Inline emphasis for the things a reader should not skim past. */
export function Key({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-navy-900">{children}</strong>;
}

/** A list whose items are marked by a rule on the left, not by a bullet. */
export function RuleList({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-none flex-col gap-2.5 pl-0">{children}</ul>;
}

export function RuleItem({ children }: { children: React.ReactNode }) {
  return <li className="border-l-2 border-line pl-4">{children}</li>;
}

/** Underlined-by-a-rule link, matching the footer's treatment. */
export function DocLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "border-b border-navy-300 text-navy-900 transition-colors hover:border-accent-500 hover:text-accent-500";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** `mailto:` for the controller's contact box. */
export function ContactLink() {
  return <DocLink href={`mailto:${CONTROLLER.email}`} external>{CONTROLLER.email}</DocLink>;
}

/** The column every legal page pours its clauses into. */
export function DocBody({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-2xl flex-col gap-10">{children}</div>;
}

/**
 * The boxed summary that opens each document — the part most people will read
 * instead of the document. It must therefore be true on its own, not a teaser.
 */
export function DocSummary({
  title = "Em uma tela",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal variant="fade" className="rounded-card border border-line bg-surface p-6">
      <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
        {title}
      </h2>
      <ul className="mt-4 flex list-none flex-col gap-2.5 text-[0.95rem] leading-[1.6] text-navy-700">
        {children}
      </ul>
    </Reveal>
  );
}
