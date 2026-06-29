/**
 * Shared chrome for embeddable widget cards: a self-contained branded card that
 * fills the iframe, with an eyebrow, the content, the Votto mark, and a CTA that
 * opens the full page on Votto in a new tab.
 *
 * Links are relative so they resolve against the iframe's own origin (votto.online).
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/public/Logo";

export function EmbedShell({
  eyebrow,
  href,
  cta,
  children,
}: {
  eyebrow: string;
  href: string;
  cta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-accent-600">
          {eyebrow}
        </span>
        <Link href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
          <Logo className="h-5 w-5" />
          <span className="font-display text-sm font-extrabold tracking-tight text-navy-900">
            Votto
          </span>
        </Link>
      </div>

      <div className="flex flex-1 flex-col">{children}</div>

      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent-500 text-sm font-semibold tracking-tight text-navy-900 transition hover:bg-accent-600"
      >
        {cta}
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
