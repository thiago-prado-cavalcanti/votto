"use client";

/**
 * Share trigger placed on every theme/agent/party card and detail page. Opens the
 * ShareDialog (link, embed code, image download, WhatsApp/X/native share).
 *
 * `variant="icon"` is the compact control for cards; `variant="button"` is the
 * labeled control for detail pages.
 */
import { useState } from "react";
import { ShareDialog, type ShareKind } from "@/components/public/ShareDialog";
import { cn } from "@/lib/cn";

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Compartilhar"
          title="Compartilhar"
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-navy-600 transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900",
            className,
          )}
        >
          <ShareIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border-2 border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-900 transition hover:border-navy-900 hover:bg-navy-50",
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
