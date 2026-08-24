/**
 * The shared surface of every Votto form control.
 *
 * Lives in its own module (not in the kit's `index.tsx`) because the select is a
 * client component and would otherwise import the whole kit back into itself.
 *
 * Two treatments, both hairline (docs/design.md §4):
 *
 * - `box` (default) — a 1px rule around the field, 4px corners, 44px tall so a
 *   field and a `size="md"` button line up. Used in the admin forms, where
 *   density and an obvious hit area matter.
 * - `rule` — no box at all, just a rule underneath, the way a form is printed.
 *   36px tall, matching the `size="sm"` button beside it in the filter bar.
 *
 * Three states are shared by every control so a form reads as one object:
 * hovering warms the hairline, focus takes it to ink (on top of the global
 * terracota focus ring in `globals.css`), and a field the browser has judged
 * invalid *after the citizen touched it* (`:user-invalid`) switches its rule to
 * brick. `aria-invalid` does the same for errors we raise ourselves.
 */
import { cn, type ClassValue } from "@/lib/cn";

export type ControlVariant = "box" | "rule";

/**
 * `text-base` on a touch screen, `text-sm` from `sm` up.
 *
 * Below 16px, Safari on iOS zooms the page the moment a field takes focus, and
 * then leaves it zoomed — every field on the CPF form did this. The breakpoint
 * is width rather than `pointer: coarse` on purpose: Tailwind generates the
 * `sm:` variant natively, and the small screens this protects are exactly the
 * ones below it. The desktop keeps the 14px the design system specifies.
 */
const controlBase =
  "w-full min-w-0 text-base sm:text-sm text-ink transition-colors placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed disabled:text-[var(--color-muted)]";

const invalid =
  "aria-[invalid=true]:border-[var(--color-negative)] [&:user-invalid]:border-[var(--color-negative)]";

const controlVariants: Record<ControlVariant, string> = {
  box: cn(
    "rounded-card border border-line bg-surface px-3",
    "hover:border-navy-300 focus:border-navy-900 disabled:border-line disabled:bg-navy-50",
    invalid,
  ),
  rule: cn(
    "border-0 border-b border-navy-300 bg-transparent px-0",
    "hover:border-navy-500 focus:border-navy-900 disabled:border-line",
    invalid,
  ),
};

/**
 * Height of a single-line control, per treatment. Textareas set their own.
 *
 * `rule` is 44px on a phone and 36px from `sm` up. The 36 exist to match the
 * `size="sm"` button *beside* it in the filter bar — but parity with a
 * neighbour is a rule about a horizontal row, and on a phone the filter bar has
 * no row: every field is stacked and the only thing 36px lines up with is a
 * fingertip that needs 44.
 */
export const controlHeights: Record<ControlVariant, string> = {
  box: "h-11",
  rule: "h-11 sm:h-9",
};

/** Room on the right for the chevron of a select. */
export const controlChevronRoom: Record<ControlVariant, string> = {
  box: "pr-9",
  rule: "pr-6",
};

/** Composes the shared surface with a treatment and any per-control extras. */
export function control(variant: ControlVariant = "box", ...extra: ClassValue[]) {
  return cn(controlBase, controlVariants[variant], ...extra);
}
