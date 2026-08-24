"use client";

/**
 * Scroll motion primitives for the public site.
 *
 * The CSS vocabulary lives in globals.css; this file only decides *when* a block
 * has arrived. One IntersectionObserver per revealed block, disconnected the
 * moment it fires — a list of five hundred agents therefore costs five hundred
 * one-shot observers and no scroll listener at all.
 *
 * Nothing here hides content on its own: the resting states are behind
 * `scripting: enabled` and `prefers-reduced-motion` in the stylesheet, so a
 * reader without JavaScript, or one who asked for less motion, gets the finished
 * page instead of a blank one. Because "scripting is allowed" is not "our
 * bundle ran", a timeout in `layout.tsx` stamps the document visible after
 * 2,5s unless this file gets far enough to call it off — without that, 63 of
 * 65 blocks on `/temas` stayed at opacity zero for good whenever the bundle
 * failed to arrive.
 */
import * as React from "react";
import { cn } from "@/lib/cn";

/** How a block arrives. See the motion block in globals.css. */
export type RevealVariant = "rise" | "fade" | "ink" | "figure" | "edge";

/**
 * Fires once, the first time any part of `el` crosses into the top 90% of the
 * viewport. Elements already on screen at mount fire immediately, which is what
 * turns the same primitive into the page's load animation.
 *
 * The trigger is a zero threshold against an inset root, never a fraction of the
 * element: a block taller than about eight screens — the left column of a party
 * that holds ninety deputies — can never show a given *percentage* of itself, so
 * a fractional threshold would leave it hidden for good.
 */
function useArrived(el: HTMLElement | null): boolean {
  const [arrived, setArrived] = React.useState(false);

  React.useEffect(() => {
    if (!el || arrived) return;
    keepMotionArmed();

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArrived(true);
          io.disconnect();
        }
      },
      // The top margin is the fix for a block the reader has already scrolled
      // PAST: it is not intersecting and never will be again, so a plain root
      // left a trail of permanently invisible blocks behind every fast flick —
      // which is exactly how a touch screen is scrolled. Growing the root
      // upwards puts everything above the viewport inside it, so those blocks
      // arrive at once, while the bottom inset still decides what is "in view".
      { threshold: 0, rootMargin: "9999px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, arrived]);

  return arrived;
}

/**
 * Calls off the failsafe in `layout.tsx` that would stamp `data-motion="off"`
 * and show the whole document at once.
 *
 * Reaching here proves the two things the stylesheet's guard cannot ask about
 * on its own: this bundle ran, and it is now observing. Until that is true the
 * resting states are a promise nobody is left to keep, so the timeout wins —
 * see the motion block in globals.css.
 */
function keepMotionArmed(): void {
  const w = window as typeof window & { __vtDisarm?: ReturnType<typeof setTimeout> };
  if (w.__vtDisarm === undefined) return;
  clearTimeout(w.__vtDisarm);
  w.__vtDisarm = undefined;
}

/**
 * Attributes of every element `as` can name (a `form` needs `method`, an `ol`
 * needs `start`), minus the three names this component spends on itself.
 */
type PassThrough = Omit<React.AllHTMLAttributes<HTMLElement>, "as" | "step" | "size">;

export interface RevealProps extends PassThrough {
  /** Element to render. Defaults to a `div`; pass `article`, `header`, `li`… */
  as?: React.ElementType;
  variant?: RevealVariant;
  /** Delay before this block arrives, in ms. */
  delay?: number;
  /** Bring the direct children in one after the other rather than as a block. */
  stagger?: boolean;
  /** Interval between staggered children, in ms (default 90). */
  step?: number;
  /**
   * For blocks that open a page. Plays from CSS keyframes the moment the markup
   * is parsed, instead of waiting for hydration and an observer — the first
   * screen must never be held at opacity zero while the JavaScript arrives,
   * because that is the paint the browser scores as LCP. No observer is created.
   */
  autoplay?: boolean;
  children: React.ReactNode;
}

/**
 * A block that arrives when it is scrolled into view.
 *
 * ```tsx
 * <Reveal as="article" variant="rise" delay={80}>…</Reveal>
 * <Reveal stagger className="grid grid-cols-4">…</Reveal>
 * ```
 */
export function Reveal({
  as: Tag = "div",
  variant = "rise",
  delay = 0,
  stagger = false,
  step,
  autoplay = false,
  className,
  style,
  children,
  ...rest
}: RevealProps) {
  const [el, setEl] = React.useState<HTMLElement | null>(null);
  const arrived = useArrived(autoplay ? null : el);

  return (
    <Tag
      ref={autoplay ? undefined : setEl}
      data-vt={variant}
      data-vt-auto={autoplay ? "" : undefined}
      className={cn("vt-reveal", stagger && "vt-stagger", arrived && "vt-reveal-in", className)}
      style={{
        ...style,
        ...(delay ? (autoplay ? { animationDelay: `${delay}ms` } : { transitionDelay: `${delay}ms` }) : null),
        ...(step ? ({ "--vt-step": `${step}ms` } as React.CSSProperties) : null),
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Counts up to `value` once the figure is in view, so a masthead of national
 * statistics tallies itself instead of simply appearing.
 *
 * Held to a fixed digit count while it runs (`ch` width on tabular numerals), so
 * a four-digit total never reflows the strip on its way up. Readers who asked
 * for less motion — and browsers without JavaScript — get the final figure
 * rendered on the server, which is also what a crawler reads.
 */
export function CountUp({
  value,
  duration = 1400,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const format = React.useCallback((n: number) => n.toLocaleString("pt-BR"), []);
  const [el, setEl] = React.useState<HTMLElement | null>(null);
  const arrived = useArrived(el);
  const [shown, setShown] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!arrived) return;
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / duration);
      // Same easing curve as the rest of the system, so the count decelerates
      // the way a revealed block does.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setShown(null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [arrived, value, duration]);

  const running = shown !== null;
  return (
    <span
      ref={setEl}
      className={className}
      style={running ? { display: "inline-block", minWidth: `${format(value).length}ch` } : undefined}
    >
      {format(running ? shown : value)}
    </span>
  );
}
