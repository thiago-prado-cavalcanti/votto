/**
 * Page header for admin screens: title, optional description and a right-aligned
 * action slot.
 */
import * as React from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="relative pl-4">
        <span
          className="absolute left-0 top-1 h-7 w-1 bg-accent-500"
          aria-hidden
        />
        <h1 className="font-display text-3xl text-navy-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
