/**
 * Filter row for the public lists.
 *
 * No box: the fields sit on the paper between two hairlines, each one a label in
 * small caps over a rule (`variant="rule"` on the controls) — the way a form is
 * printed rather than the way a web app draws one (docs/design.md).
 *
 * Plain `<form method="get">`, so filtering keeps working without JavaScript and
 * the URL stays the state.
 */
import * as React from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export function FilterBar({
  children,
  className,
  submitLabel = "Filtrar",
}: {
  children: React.ReactNode;
  className?: string;
  submitLabel?: string;
}) {
  // The track list is auto-fit, so the same bar holds four filters or seven
  // without each page deciding its own column count.
  return (
    <form
      method="get"
      className={cn(
        "mb-10 grid items-end gap-x-8 gap-y-5 border-y border-line py-5 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]",
        className,
      )}
    >
      {children}
      <div className="flex items-end">
        <Button type="submit" variant="outline" size="sm" className="w-full sm:w-auto">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
