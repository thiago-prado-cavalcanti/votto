"use client";

/**
 * Select — a native `<select>` that draws its own list.
 *
 * The browser's dropdown is the one part of a form no stylesheet can reach, so
 * it always arrived as an operating-system panel in the middle of a document
 * that is otherwise entirely ours. This component keeps the native `<select>`
 * as the field — it holds the value, it submits, it validates, it is what the
 * server reads — and, once mounted, hides it behind a trigger plus a paper
 * listbox built from the same options.
 *
 * What that buys, and what it costs:
 *
 * - Before hydration, and forever without JavaScript, the native select renders
 *   in place with the same hairline and chevron. The public filters stay a
 *   plain `<form method="get">`, exactly as docs/design.md requires.
 * - Options are read from the DOM rather than from `children`, so any shape a
 *   caller writes — disabled entries, `<optgroup>`, a list that grows later —
 *   is carried over without this component parsing JSX.
 * - Choosing goes through the native value setter and dispatches a real
 *   `change`, so React's value tracker sees it and a controlled parent's
 *   `onChange` still fires.
 * - The `id` moves to the trigger once enhanced (the native select keeps a
 *   suffixed one), so a `<Field htmlFor>` label always points at the element
 *   the citizen can actually click.
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import {
  control,
  controlChevronRoom,
  controlHeights,
  type ControlVariant,
} from "./control";

interface Option {
  value: string;
  label: string;
  disabled: boolean;
  group: string | null;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  variant?: ControlVariant;
  /** Shown when the current value matches no option. */
  placeholder?: string;
}

/** Accent-insensitive, case-insensitive folding, for type-ahead. */
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * `useLayoutEffect` where it exists. The component is server-rendered (as the
 * bare native select), and React warns about the layout variant there, so the
 * server takes the no-op branch — nothing it could measure exists yet anyway.
 */
const useLayoutEffectSafely =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function sameOptions(a: Option[], b: Option[]) {
  return (
    a.length === b.length &&
    a.every(
      (o, i) =>
        o.value === b[i].value &&
        o.label === b[i].label &&
        o.disabled === b[i].disabled &&
        o.group === b[i].group,
    )
  );
}

export function Select({
  variant = "box",
  className,
  children,
  id,
  placeholder = "Selecione…",
  ...props
}: SelectProps) {
  const nativeRef = React.useRef<HTMLSelectElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const typed = React.useRef({ text: "", at: 0 });
  const listId = React.useId();

  const [enhanced, setEnhanced] = React.useState(false);
  const [options, setOptions] = React.useState<Option[]>([]);
  const [value, setValue] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);

  // Subscribe to the native select and mirror it. The options come from a
  // server component, so their React identity tells us nothing — the DOM is the
  // only honest source, and a MutationObserver is what tells us it moved (a
  // caller adding parties, a row appearing). Both setters bail out when nothing
  // changed, so a mutation that does not concern us costs one comparison.
  React.useEffect(() => {
    const el = nativeRef.current;
    if (!el) return;
    function sync() {
      if (!el) return;
      const next: Option[] = Array.from(el.options).map((o) => ({
        value: o.value,
        label: (o.textContent ?? "").trim(),
        disabled: o.disabled,
        group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null,
      }));
      setOptions((prev) => (sameOptions(prev, next) ? prev : next));
      setValue((prev) => (prev === el.value ? prev : el.value));
      setEnhanced(true);
    }
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { childList: true, subtree: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  // Close on a click anywhere else, and whenever focus leaves the control.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // The panel is as wide as its longest option — a filter field is narrow, and
  // truncating "Movimentação mais recente" to it would be worse than what the
  // browser did. Growing rightwards runs off the last column of a filter row,
  // so a panel that would leave the viewport is anchored to the field's right
  // edge instead. Measured and written straight to the node before paint: it is
  // a fact about layout, not state the render depends on.
  useLayoutEffectSafely(() => {
    const el = listRef.current;
    if (!open || !el) return;
    el.style.left = "0";
    el.style.right = "auto";
    if (el.getBoundingClientRect().right > window.innerWidth - 8) {
      el.style.left = "auto";
      el.style.right = "0";
    }
  }, [open]);

  // A controlled select is owned by its parent: React writes the DOM *property*,
  // which no observer reports, so read the prop instead of the mirror.
  const currentValue = props.value !== undefined ? String(props.value) : value;
  const selectedIndex = options.findIndex((o) => o.value === currentValue);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  /** Writes through the native setter so React's tracker registers the change. */
  function commit(next: string) {
    const el = nativeRef.current;
    if (!el || el.value === next) {
      setValue(next);
      return;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(el, next);
    else el.value = next;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    setValue(el.value);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    commit(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openList() {
    if (options.length === 0) return;
    setActive(selectedIndex >= 0 ? selectedIndex : step(-1, 1));
    setOpen(true);
  }

  /** Next selectable index in `direction`; native selects do not wrap, nor do we. */
  function step(from: number, direction: 1 | -1) {
    for (let i = from + direction; i >= 0 && i < options.length; i += direction) {
      if (!options[i].disabled) return i;
    }
    return from >= 0 && from < options.length ? from : -1;
  }

  function typeahead(char: string) {
    const now = Date.now();
    const text = now - typed.current.at > 700 ? char : typed.current.text + char;
    typed.current = { text, at: now };
    const query = fold(text);
    const from = Math.max(open ? active : selectedIndex, 0);
    // A single repeated letter cycles; a longer buffer re-matches in place.
    const offset = text.length === 1 ? 1 : 0;
    for (let n = 0; n < options.length; n++) {
      const i = (from + offset + n) % options.length;
      const option = options[i];
      if (option.disabled || !fold(option.label).startsWith(query)) continue;
      if (open) setActive(i);
      else commit(option.value);
      return;
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const key = event.key;
    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        openList();
        return;
      }
    } else {
      switch (key) {
        case "Escape":
          event.preventDefault();
          setOpen(false);
          return;
        case "Enter":
        case " ":
          event.preventDefault();
          choose(active);
          return;
        case "Tab":
          setOpen(false);
          return;
        case "ArrowDown":
          event.preventDefault();
          setActive(step(active, 1));
          return;
        case "ArrowUp":
          event.preventDefault();
          setActive(step(active, -1));
          return;
        case "Home":
          event.preventDefault();
          setActive(step(-1, 1));
          return;
        case "End":
          event.preventDefault();
          setActive(step(options.length, -1));
          return;
      }
    }
    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      typeahead(key);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {enhanced ? (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-required={props.required || undefined}
          disabled={props.disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
          className={control(
            variant,
            controlHeights[variant],
            "flex items-center justify-between gap-2 text-left",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-[var(--color-muted)]")}>
            {selected ? selected.label : placeholder}
          </span>
          <Chevron open={open} />
        </button>
      ) : null}

      {/* The field itself: hidden but never removed once enhanced, so the form
          still submits it and the browser still anchors validation to it. */}
      <select
        {...props}
        ref={nativeRef}
        id={enhanced ? (id ? `${id}__native` : undefined) : id}
        tabIndex={enhanced ? -1 : props.tabIndex}
        aria-hidden={enhanced || undefined}
        className={
          enhanced
            ? "pointer-events-none absolute inset-0 h-full w-full opacity-0"
            : control(
                variant,
                controlHeights[variant],
                controlChevronRoom[variant],
                "appearance-none",
                className,
              )
        }
      >
        {children}
      </select>
      {enhanced ? null : (
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2",
            variant === "box" ? "right-3" : "right-0",
          )}
        >
          <Chevron open={false} />
        </span>
      )}

      {open ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={props["aria-label"]}
          className={cn(
            "absolute top-full z-30 mt-1 max-h-64 w-max min-w-full max-w-[min(24rem,calc(100vw-2rem))]",
            "overflow-y-auto overscroll-contain rounded-card border border-navy-300 bg-surface py-1",
          )}
        >
          {options.map((option, i) => (
            <React.Fragment key={`${option.value}-${i}`}>
              {option.group && option.group !== options[i - 1]?.group ? (
                <div
                  role="presentation"
                  className="mt-1 border-t border-line px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)] first:mt-0 first:border-t-0 first:pt-1"
                >
                  {option.group}
                </div>
              ) : null}
              <div
                id={`${listId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={option.value === currentValue}
                aria-disabled={option.disabled || undefined}
                data-active={i === active || undefined}
                // Keep focus on the trigger, and cancel the click so a wrapping
                // <label> (see Field) does not forward it back to the trigger
                // and reopen the list we are closing.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => !option.disabled && setActive(i)}
                onClick={(event) => {
                  event.preventDefault();
                  choose(i);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-ink",
                  i === active && !option.disabled && "bg-navy-100",
                  option.disabled && "cursor-not-allowed text-[var(--color-muted)]",
                )}
              >
                <span className="truncate">{option.label}</span>
                {option.value === currentValue ? (
                  <svg viewBox="0 0 14 14" aria-hidden="true" className="size-3 shrink-0 text-accent-500">
                    <path
                      d="M2.5 7.4 5.6 10.4 11.5 3.6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </div>
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A thin ink chevron — the only ornament a field gets. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 8"
      aria-hidden="true"
      className={cn(
        "size-3 shrink-0 text-[var(--color-muted)] transition-transform",
        open && "rotate-180",
      )}
    >
      <path
        d="M1 1.75 6 6.25 11 1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
