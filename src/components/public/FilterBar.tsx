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
        "mb-10 grid items-end gap-x-8 gap-y-5 py-5 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]",
        className,
      )}
    >
      {children}
      <div className="flex items-end">
        <Button type="submit" variant="outline" size="sm" className="w-full sm:w-auto">
          {submitLabel}
        </Button>
      </div>
    </Reveal>
  );
}
