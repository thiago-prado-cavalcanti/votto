"use client";

/**
 * The public masthead, made aware of the reading position.
 *
 * Two things happen as the document moves, both of them the system's own
 * language rather than new decoration:
 *
 * - the 1px rule under the masthead **fills with terracota** in proportion to how
 *   much of the page has been read — a reading rule, not a progress pill;
 * - the masthead **condenses** by 8px once the page has left its first screen, so
 *   the header stops competing with the page it introduces.
 *
 * It wraps the server-rendered contents (which carry the citizen session), so
 * nothing below it becomes a client component. One rAF-coalesced scroll listener
 * for the whole site.
 */
import * as React from "react";

export function SiteHeader({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const measure = () => {
      raf = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
      el.style.setProperty("--vt-p", String(progress));
      el.dataset.scrolled = String(window.scrollY > 24);
    };

    const onScroll = () => {
      raf ||= requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <header
      ref={ref}
      className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur"
    >
      {children}
      {/* Sits on the border rule itself, so the terracota reads as that rule
          being inked in rather than as a second line under it. */}
      <span
        aria-hidden
        className="vt-progress absolute inset-x-0 -bottom-px block h-px bg-accent-500"
      />
    </header>
  );
}
