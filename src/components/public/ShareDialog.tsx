"use client";

/**
 * Share sheet for a theme/agent/party widget. Offers every channel the platform
 * needs to proliferate: native share, WhatsApp, X, copy link, copy <iframe>
 * embed code, and download the PNG card (Instagram / manual posts).
 *
 * Everything is derived from `window.location.origin`, so it works on any
 * environment (localhost, votto.online) with no extra config.
 *
 * **Rendered through a portal into `<body>`, and it has to be.** `position:
 * fixed` is only fixed to the viewport while no ancestor has a `transform`,
 * `filter`, `backdrop-filter`, `perspective` or `contain` — any one of those
 * makes that ancestor the containing block *and* a stacking context, which
 * traps the overlay inside the page block it was opened from and leaves it
 * painting under the blocks that follow. This site is full of such ancestors by
 * design: every screen is wrapped in `Reveal`, whose entrance animates
 * `transform` and `filter`, and the document carries a blended grain overlay.
 * Raising `z-index` cannot fix that — a z-index only orders siblings inside the
 * stacking context it belongs to. Leaving the page entirely does.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ShareKind = "tema" | "agente" | "partido";

const DETAIL_PATH: Record<ShareKind, string> = {
  tema: "temas",
  agente: "agentes",
  partido: "partidos",
};

// iframe dimensions per widget type. The theme widget is the tall one: it
// carries the full voting panel — the winning share, the bar and the tally.
const EMBED_DIMS: Record<ShareKind, { w: number; h: number }> = {
  tema: { w: 500, h: 360 },
  agente: { w: 380, h: 230 },
  partido: { w: 380, h: 230 },
};

export function ShareDialog({
  kind,
  kid,
  title,
  onClose,
}: {
  kind: ShareKind;
  kid: string;
  title: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);

    // Hold the page still underneath. A sheet that scrolls the article behind
    // it reads as two documents fighting.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // Rendered only from a click, so there is no server pass and no hydration to
  // mismatch — the browser can be read straight during render. The guard is
  // insurance: were this ever mounted open by default, reading `window` on the
  // server would crash the page instead of merely losing the sheet.
  if (typeof window === "undefined") return null;

  const origin = window.location.origin;
  const canNativeShare = !!navigator.share;

  const link = `${origin}/${DETAIL_PATH[kind]}/${kid}`;
  const embedSrc = `${origin}/embed/${kind}/${kid}`;
  const imageUrl = `${origin}/api/og/${kind}/${kid}?download=1`;
  const { w, h } = EMBED_DIMS[kind];
  const embedCode = `<iframe src="${embedSrc}" width="${w}" height="${h}" style="border:0;border-radius:16px;overflow:hidden" loading="lazy" title="${title} — Votto"></iframe>`;
  const shareText = `${title} — Votto`;

  async function copy(text: string, which: "link" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: shareText, text: shareText, url: link });
    } catch {
      /* user cancelled */
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Compartilhar"
    >
      <div
        className="w-full max-w-md rounded-card bg-surface p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl text-navy-900">Compartilhar</h2>
            <p className="mt-0.5 line-clamp-1 text-sm text-[var(--color-muted)]">{title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-card p-1.5 text-navy-500 hover:bg-navy-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Live preview of the embeddable widget */}
        {origin ? (
          <div className="mt-4 overflow-hidden rounded-card border border-line bg-canvas">
            <iframe
              src={embedSrc}
              width="100%"
              height={h}
              style={{ border: 0, display: "block" }}
              loading="lazy"
              title={`Prévia — ${title}`}
            />
          </div>
        ) : null}

        {/* Quick channels */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {canNativeShare ? (
            <ChannelButton label="Compartilhar" onClick={nativeShare} icon={IconShare} />
          ) : null}
          <ChannelButton
            label="WhatsApp"
            href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${link}`)}`}
            icon={IconWhatsApp}
          />
          <ChannelButton
            label="X"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`}
            icon={IconX}
          />
          <ChannelButton label="Baixar imagem" href={imageUrl} download icon={IconDownload} />
        </div>

        {/* Copy link */}
        <CopyRow
          label="Link"
          value={link}
          copied={copied === "link"}
          onCopy={() => copy(link, "link")}
        />

        {/* Copy embed code */}
        <CopyRow
          label="Código para incorporar (embed)"
          value={embedCode}
          copied={copied === "embed"}
          onCopy={() => copy(embedCode, "embed")}
          multiline
        />
      </div>
    </div>,
    document.body,
  );
}

function ChannelButton({
  label,
  icon: Icon,
  href,
  download,
  onClick,
}: {
  label: string;
  icon: () => ReactNode;
  href?: string;
  download?: boolean;
  onClick?: () => void;
}) {
  const cls =
    "flex flex-col items-center justify-center gap-1.5 rounded-card border border-line bg-canvas px-2 py-3 text-center text-xs font-medium text-navy-800 transition hover:border-navy-300 hover:bg-navy-50";
  const inner = (
    <>
      <span className="text-navy-700">
        <Icon />
      </span>
      <span>{label}</span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target={download ? undefined : "_blank"}
        rel="noopener noreferrer"
        download={download}
        className={cls}
      >
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
  multiline,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  multiline?: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-xs font-medium text-navy-800">{label}</div>
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1 truncate rounded-card border border-line bg-canvas px-3 py-2 text-xs text-[var(--color-muted)]">
          {multiline ? <code className="block truncate">{value}</code> : value}
        </div>
        <button
          onClick={onCopy}
          className="shrink-0 rounded-card bg-navy-900 px-3.5 text-xs font-semibold text-navy-50 transition hover:bg-navy-800"
        >
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

// ─── Icons (inline, dependency-free) ─────────────────────────────────────────
function IconShare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
    </svg>
  );
}
function IconWhatsApp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M.06 24l1.68-6.13A11.87 11.87 0 0 1 .14 11.9C.14 5.33 5.48 0 12.05 0a11.82 11.82 0 0 1 8.42 3.49 11.82 11.82 0 0 1 3.48 8.42c0 6.57-5.34 11.9-11.91 11.9a11.9 11.9 0 0 1-5.69-1.45L.06 24zM6.6 20.2c1.68 1 3.28 1.6 5.44 1.6 5.46 0 9.9-4.43 9.9-9.88a9.84 9.84 0 0 0-2.9-7A9.82 9.82 0 0 0 12.05 2c-5.46 0-9.9 4.43-9.9 9.9 0 2.27.66 3.96 1.77 5.73l-.99 3.62 3.67-1.05zm11.4-5.46c-.07-.12-.27-.2-.57-.35-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07a8.13 8.13 0 0 1-2.4-1.48 9 9 0 0 1-1.66-2.06c-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.46 0 1.45 1.06 2.85 1.21 3.05.15.2 2.09 3.2 5.07 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41z" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.9 1.5h3.6l-7.9 9 9.3 12.3h-7.3l-5.7-7.5-6.5 7.5H.7l8.4-9.6L.2 1.5h7.5l5.2 6.9 5.9-6.9zm-1.3 19.7h2L6.5 3.4H4.4l13.2 17.8z" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
