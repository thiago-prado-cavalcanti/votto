/**
 * Dynamic widget / OG images (next/og + satori) for shareable cards.
 *
 * One 1200×630 branded card per entity type, rendered at request time from live
 * data. Used both as the link-unfurl image (og:image / twitter:image on the
 * detail pages) and as the downloadable PNG for Instagram/manual sharing.
 *
 * Constraints (satori): inline styles only, every multi-child box needs an
 * explicit `display: flex`, and fonts must be provided as raw buffers (bundled
 * under ./fonts so the standalone build traces them).
 */
import type * as React from "react";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// ─── Brand palette ───────────────────────────────────────────────────────────
const TEAL = "#133e39";
const TEAL_DEEP = "#0a2320";
const WHITE = "#ffffff";
const ACCENT = "#ff9a2e";
const YES = "#0e9d6a";
const NO = "#ff9a2e";
const ABS = "#64748b";
const MUTED = "rgba(255,255,255,0.62)";
const SUBTLE = "rgba(255,255,255,0.10)";

const SIZE = { width: 1200, height: 630 } as const;

// ─── Fonts (loaded once) ─────────────────────────────────────────────────────
let fontCache: Array<{ name: string; data: Buffer; weight: 400 | 600 | 800; style: "normal" }> | null =
  null;

async function loadFonts() {
  if (fontCache) return fontCache;
  // Served from public/fonts and read via process.cwd() so it resolves under
  // both `next dev` and the standalone Docker image (see scripts/fetch-widget-fonts.mjs).
  const dir = join(process.cwd(), "public", "fonts");
  const read = (file: string) => readFile(join(dir, file));
  const [inter, interSemi, sora] = await Promise.all([
    read("Inter-Regular.ttf"),
    read("Inter-SemiBold.ttf"),
    read("Sora-ExtraBold.ttf"),
  ]);
  fontCache = [
    { name: "Inter", data: inter, weight: 400, style: "normal" },
    { name: "Inter", data: interSemi, weight: 600, style: "normal" },
    { name: "Sora", data: sora, weight: 800, style: "normal" },
  ];
  return fontCache;
}

// ─── Shared primitives ───────────────────────────────────────────────────────

/** The Votto "V" mark on a translucent tile, sized in px (SVG scales via viewBox). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x={0} y={0} width={40} height={40} rx={9} fill={SUBTLE} />
      <path d="M10.8 10.6 L20 28.6" stroke={WHITE} strokeWidth={5.8} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M20 28.6 L29.2 10.6"
        stroke={ACCENT}
        strokeWidth={5.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STAR_PATH =
  "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

/** Five stars filled to `value`/5 (value is the 0–5 rating). */
function Stars({ value, size = 56 }: { value: number; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", gap: 6 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <path d={STAR_PATH} fill={i < value ? ACCENT : "rgba(255,255,255,0.22)"} />
        </svg>
      ))}
    </div>
  );
}

/** Brand footer row: mark + wordmark + CTA. */
function Footer({ cta }: { cta: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Mark size={56} />
        <span style={{ fontFamily: "Sora", fontWeight: 800, fontSize: 40, color: WHITE }}>
          Votto
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: ACCENT,
          color: TEAL_DEEP,
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: 30,
          padding: "16px 32px",
          borderRadius: 9999,
        }}
      >
        {cta}
      </div>
    </div>
  );
}

/** Full-bleed gradient frame with consistent padding. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 72,
        backgroundImage: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
        color: WHITE,
        fontFamily: "Inter",
      }}
    >
      {children}
    </div>
  );
}

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

async function render(node: React.ReactElement) {
  return new ImageResponse(node, { ...SIZE, fonts: await loadFonts() });
}

/**
 * Fetch a remote avatar/logo and inline it as a data URL, but only if it is a
 * raster image satori can draw (png/jpg/webp/gif). Returns null on any failure
 * or non-raster (e.g. SVG) so the caller falls back to initials/acronym.
 */
async function toImageData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/^image\/(png|jpe?g|webp|gif)/i.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// ─── Theme card ──────────────────────────────────────────────────────────────

export async function themeCardImage(data: {
  name: string;
  yes: number;
  no: number;
  abs: number;
}) {
  const total = data.yes + data.no + data.abs;
  const segs = [
    { v: data.yes, c: YES, label: "Sim" },
    { v: data.no, c: NO, label: "Não" },
    { v: data.abs, c: ABS, label: "Neutro" },
  ];
  return render(
    <Shell>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 28, color: ACCENT }}>
          TEMA EM VOTAÇÃO
        </span>
        <span
          style={{
            fontFamily: "Sora",
            fontWeight: 800,
            // smaller type for long headlines so they fit without satori clamps
            fontSize: data.name.length > 80 ? 44 : data.name.length > 48 ? 52 : 58,
            lineHeight: 1.1,
            color: WHITE,
          }}
        >
          {data.name}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}>
          <span style={{ fontSize: 28, fontWeight: 600, color: WHITE }}>Votação</span>
          <span style={{ fontSize: 28, color: MUTED }}>
            {total.toLocaleString("pt-BR")} {total === 1 ? "voto" : "votos"}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            width: "100%",
            height: 26,
            borderRadius: 9999,
            overflow: "hidden",
            background: "rgba(255,255,255,0.12)",
          }}
        >
          {segs.map((s, i) => (
            <div key={i} style={{ display: "flex", width: `${pct(s.v, total)}%`, background: s.c }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: 36 }}>
          {segs.map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", width: 18, height: 18, borderRadius: 9999, background: s.c }} />
              <span style={{ fontSize: 26, color: WHITE }}>
                {s.label} {pct(s.v, total)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <Footer cta="Vote no Votto" />
    </Shell>,
  );
}

// ─── Rating card (agent / party) ─────────────────────────────────────────────

function RatingCard(data: {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string | null;
  fallback: string;
  alignment: number | null;
  band: string | null;
}) {
  const stars = data.alignment === null ? 0 : Math.round(data.alignment / 20);
  // Scale the name down for long titles so it fits the column without clamping.
  const titleSize = data.title.length > 28 ? 40 : data.title.length > 20 ? 46 : 54;
  return (
    <Shell>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 32 }}>
        {data.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.image}
            width={156}
            height={156}
            style={{ width: 156, height: 156, borderRadius: 28, objectFit: "cover", background: SUBTLE }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 156,
              height: 156,
              borderRadius: 28,
              background: SUBTLE,
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Sora",
              fontWeight: 800,
              fontSize: 52,
              color: WHITE,
            }}
          >
            {data.fallback}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 26, color: ACCENT }}>
            {data.eyebrow}
          </span>
          <span
            style={{ fontFamily: "Sora", fontWeight: 800, fontSize: titleSize, lineHeight: 1.05, color: WHITE }}
          >
            {data.title}
          </span>
          <span style={{ fontSize: 28, color: MUTED }}>{data.subtitle}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: WHITE }}>Alinhamento com eleitores</span>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 28 }}>
          <Stars value={stars} size={64} />
          <span style={{ fontFamily: "Sora", fontWeight: 800, fontSize: 88, color: WHITE }}>
            {data.alignment === null ? "—" : `${data.alignment}%`}
          </span>
          {data.band ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(255,255,255,0.12)",
                color: WHITE,
                fontWeight: 600,
                fontSize: 28,
                padding: "12px 24px",
                borderRadius: 9999,
              }}
            >
              {data.band}
            </div>
          ) : null}
        </div>
      </div>

      <Footer cta="Veja no Votto" />
    </Shell>
  );
}

export async function agentCardImage(data: {
  name: string;
  subtitle: string;
  imageUrl: string | null;
  alignment: number | null;
  band: string | null;
}) {
  const initials = data.name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return render(
    RatingCard({
      eyebrow: "AGENTE PÚBLICO",
      title: data.name,
      subtitle: data.subtitle,
      image: await toImageData(data.imageUrl),
      fallback: initials,
      alignment: data.alignment,
      band: data.band,
    }),
  );
}

export async function partyCardImage(data: {
  name: string;
  acronym: string;
  subtitle: string;
  logoUrl: string | null;
  alignment: number | null;
  band: string | null;
}) {
  return render(
    RatingCard({
      eyebrow: "PARTIDO",
      title: data.name,
      subtitle: data.subtitle,
      image: await toImageData(data.logoUrl),
      fallback: data.acronym,
      alignment: data.alignment,
      band: data.band,
    }),
  );
}
