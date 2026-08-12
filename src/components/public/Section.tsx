/**
 * Editorial page and section openers.
 *
 * Every public page opens the same way: a 3px ink rule (`.vt-rule-ink`, the one
 * opener of the system — never a double rule), the title in the newspaper serif,
 * then a lead paragraph. Sections inside a page repeat the pattern one step down,
 * with room for an action on the right (docs/design.md).
 */
import * as React from "react";
import { cn } from "@/lib/cn";

export function PageIntro({
  title,
  lead,
  children,
  className,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** Optional trailing content (chips, counts, secondary actions). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8", className)}>
      <hr className="vt-rule-ink w-14" />
      <h1 className="mt-5 text-[2.05rem] leading-[1.04] sm:text-[2.5rem]">{title}</h1>
      {lead ? (
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy-700">{lead}</p>
      ) : null}
      {children}
    </header>
  );
}

export function SectionHead({
  title,
  lead,
  action,
  className,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div>
        <hr className="vt-rule-ink w-10" />
        <h2 className="mt-4 text-[1.7rem] leading-tight">{title}</h2>
        {lead ? (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">{lead}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
