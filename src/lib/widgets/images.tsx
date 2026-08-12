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

// ─── Brand palette — "papel & pigmento" (docs/design.md) ─────────────────────
// The share card is a newspaper clipping, not a dark app screen: warm paper,
// ink type, earth pigments, squared corners and 1px rules.
const PAPER = "#fcfaf6";
const INK = "#17150f";
const MUTED = "#5b5648";
const LINE = "#e2ddd0";
const TRACK = "#f2eee3";
const TERRACOTA = "#b4552f";
const PINHO = "#183a33";
const OCHRE = "#c07f2c";
const YES = "#556b3d";
const NO = "#a8452f";
const ABS = "#8a8578";

const SIZE = { width: 1200, height: 630 } as const;

// ─── Fonts (loaded once) ─────────────────────────────────────────────────────
let fontCache: Array<{ name: string; data: Buffer; weight: 400 | 500 | 600; style: "normal" }> | null =
  null;

async function loadFonts() {
  if (fontCache) return fontCache;
  // Served from public/fonts and read via process.cwd() so it resolves under
  // both `next dev` and the standalone Docker image (see scripts/fetch-widget-fonts.mjs).
  const dir = join(process.cwd(), "public", "fonts");
  const read = (file: string) => readFile(join(dir, file));
  const [sans, sansSemi, serif] = await Promise.all([
    read("InstrumentSans-Regular.ttf"),
    read("InstrumentSans-SemiBold.ttf"),
    read("Newsreader-Medium.ttf"),
  ]);
  fontCache = [
    { name: "Instrument", data: sans, weight: 400, style: "normal" },
    { name: "Instrument", data: sansSemi, weight: 600, style: "normal" },
    // The display serif exists in one weight here, as in the site itself.
    { name: "Newsreader", data: serif, weight: 500, style: "normal" },
  ];
  return fontCache;
}

// ─── Shared primitives ───────────────────────────────────────────────────────

/** The Votto "V" mark on a tinted tile, sized in px (SVG scales via viewBox). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x={0} y={0} width={40} height={40} rx={4} fill="#eef3f0" />
      <path d="M10.8 10.6 L20 28.6" stroke={PINHO} strokeWidth={5.8} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M20 28.6 L29.2 10.6"
        stroke={TERRACOTA}
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
          <path d={STAR_PATH} fill={i < value ? OCHRE : LINE} />
        </svg>
      ))}
    </div>
  );
}

/** Brand footer row: a hairline, then mark + wordmark + CTA. */
function Footer({ cta }: { cta: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", width: "100%", height: 1, background: LINE }} />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 28,
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Mark size={56} />
          <span style={{ fontFamily: "Newsreader", fontWeight: 500, fontSize: 44, color: INK }}>
            Votto
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: TERRACOTA,
            color: PAPER,
            fontFamily: "Instrument",
            fontWeight: 600,
            fontSize: 30,
            padding: "16px 32px",
            borderRadius: 4,
          }}
        >
          {cta}
        </div>
      </div>
    </div>
  );
}

/** Paper frame: warm ground, a 3px ink opener, consistent padding. */
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
        background: PAPER,
        color: INK,
        fontFamily: "Instrument",
      }}
    >
      <div style={{ display: "flex", width: 120, height: 3, background: INK }} />
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
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span
          style={{
            fontFamily: "Instrument",
            fontWeight: 600,
            fontSize: 26,
            letterSpacing: 3,
            color: TERRACOTA,
          }}
        >
          TEMA EM VOTAÇÃO
        </span>
        <span
          style={{
            fontFamily: "Newsreader",
            fontWeight: 500,
            // smaller type for long headlines so they fit without satori clamps
            fontSize: data.name.length > 80 ? 48 : data.name.length > 48 ? 56 : 64,
            lineHeight: 1.12,
            letterSpacing: -1.2,
            color: INK,
          }}
        >
          {data.name}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}>
          <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: 3, color: MUTED }}>
            VOTAÇÃO
          </span>
          {/* Siblings in a flex row, never text mixed with an element: satori
              needs an explicit display on any box with more than one child. */}
          <div style={{ display: "flex", flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "Newsreader", fontWeight: 500, fontSize: 30, color: INK }}>
              {total.toLocaleString("pt-BR")}
            </span>
            <span style={{ fontSize: 28, color: MUTED }}>
              {total === 1 ? "voto" : "votos"}
            </span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            width: "100%",
            height: 20,
            overflow: "hidden",
            background: TRACK,
          }}
        >
          {segs.map((s, i) => (
            <div key={i} style={{ display: "flex", width: `${pct(s.v, total)}%`, background: s.c }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: 36 }}>
          {segs.map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", width: 14, height: 14, background: s.c }} />
              <span style={{ fontSize: 26, color: MUTED }}>{s.label}</span>
              <span style={{ fontFamily: "Newsreader", fontWeight: 500, fontSize: 28, color: INK }}>
                {pct(s.v, total)}%
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
            style={{ width: 156, height: 156, borderRadius: 4, objectFit: "cover", background: TRACK }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 156,
              height: 156,
              borderRadius: 4,
              background: TRACK,
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Newsreader",
              fontWeight: 500,
              fontSize: 56,
              color: INK,
            }}
          >
            {data.fallback}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "Instrument",
              fontWeight: 600,
              fontSize: 24,
              letterSpacing: 3,
              color: TERRACOTA,
            }}
          >
            {data.eyebrow}
          </span>
          <span
            style={{
              fontFamily: "Newsreader",
              fontWeight: 500,
              fontSize: titleSize,
              lineHeight: 1.06,
              letterSpacing: -1,
              color: INK,
            }}
          >
            {data.title}
          </span>
          <span style={{ fontSize: 28, color: MUTED }}>{data.subtitle}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: 3, color: MUTED }}>
          ALINHAMENTO COM ELEITORES
        </span>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 28 }}>
          <Stars value={stars} size={64} />
          <span style={{ fontFamily: "Newsreader", fontWeight: 500, fontSize: 92, color: INK }}>
            {data.alignment === null ? "—" : `${data.alignment}%`}
          </span>
          {data.band ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                border: `1px solid ${LINE}`,
                background: TRACK,
                color: MUTED,
                fontWeight: 600,
                fontSize: 26,
                padding: "10px 20px",
                borderRadius: 2,
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
