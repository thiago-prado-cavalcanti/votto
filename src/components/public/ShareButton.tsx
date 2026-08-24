"use client";

/**
 * Share trigger placed on every theme/agent/party card and detail page. Opens the
 * ShareDialog (link, embed code, image download, WhatsApp/X/native share).
 *
 * `variant="icon"` is the compact control for cards; `variant="button"` is the
 * labeled control for detail pages.
 *
 * On a phone the **system sheet comes first**. `navigator.share` is the one
 * control that reaches WhatsApp, Instagram and the rest of what a Brazilian
 * actually shares into, and it is one tap; our own dialog offered it as one
 * tile of four, behind a panel that loads a live preview iframe first. The
 * dialog is still the whole answer on a desktop, where `navigator.share` does
 * not exist, and it remains the way to reach the embed code and the image.
 */
import { useState } from "react";
import { DETAIL_PATH, ShareDialog, type ShareKind } from "@/components/public/ShareDialog";
import { cn } from "@/lib/cn";

function ShareIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
    </svg>
  );
}

export function ShareButton({
  kind,
  kid,
  title,
  variant = "icon",
  className,
}: {
  kind: ShareKind;
  kid: string;
  title: string;
  variant?: "icon" | "button";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  /**
   * Hand the page to the system sheet where there is one, and fall back to our
   * dialog otherwise. A cancelled sheet is not an error and must not reopen
   * anything — `AbortError` is what the browser throws when the citizen simply
   * changed their mind.
   */
  async function share() {
    // The record's own address, not `location.href`: this control also sits on
    // cards inside a list, where the current page is the list.
    const url = `${window.location.origin}/${DETAIL_PATH[kind]}/${kid}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${title} — Votto`, url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    setOpen(true);
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={share}
          aria-label="Compartilhar"
          title="Compartilhar"
          className={cn(
            // The mark stays 28px, with its rule; only the area a finger has
            // to find grows, through a pseudo-element that reaches 44px and
            // moves nothing on the page.
            "relative inline-flex h-7 w-7 items-center justify-center rounded-card border border-line text-navy-600 transition-colors hover:border-navy-300 hover:bg-navy-100 hover:text-navy-900",
            "after:absolute after:-inset-2 after:content-[''] sm:after:hidden",
            className,
          )}
        >
          <ShareIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={share}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-card border border-navy-300 bg-surface px-3 py-1.5 text-xs font-semibold text-navy-900 transition-colors hover:border-navy-900 hover:bg-navy-100 sm:min-h-0",
            className,
          )}
        >
          <ShareIcon />
          Compartilhar
        </button>
      )}

      {open ? (
        <ShareDialog kind={kind} kid={kid} title={title} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
