/**
 * Filter row for the public lists.
 *
 * No box and no rules around it: the fields sit directly on the paper, each one a
 * label in small caps over a rule (`variant="rule"` on the controls) — the way a
 * form is printed rather than the way a web app draws one (docs/design.md). The
 * only hairlines in the block are the ones under the fields themselves; a frame
 * around them would make the bar a second box competing with the masthead above.
 *
 * Plain `<form method="get">`, so filtering keeps working without JavaScript and
 * the URL stays the state.
 *
 * The fields arrive left to right behind the page opener, so the bar reads as
 * part of the same masthead rather than as a second thing that appeared.
 *
 * **Two columns on a phone**, and the search spans both. Stacked one per line
 * the block measured 597px on `/temas` — taller than the masthead above it, and
 * the single largest reason the first bill sat two and a half screens down. A
 * printed form puts short fields side by side for the same reason. It stays one
 * `<form method="get">`, with no disclosure to open and nothing that needs
 * JavaScript to reach a control.
 */
import * as React from "react";
import { Reveal } from "@/components/public/motion";
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
    <Reveal
      as="form"
      variant="fade"
      stagger
      step={70}
      method="get"
      className={cn(
        "mb-8 grid grid-cols-2 items-end gap-x-5 gap-y-4 py-4",
        "sm:mb-10 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] sm:gap-x-8 sm:gap-y-5 sm:py-5",
        // The search is the field someone actually types in; it gets the full
        // width on a phone while the selects pair up beneath it.
        "[&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1",
        className,
      )}
    >
      {children}
      <div className="col-span-2 flex items-end sm:col-span-1">
        <Button type="submit" variant="outline" size="sm" className="w-full sm:w-auto">
          {submitLabel}
        </Button>
      </div>
    </Reveal>
  );
}
