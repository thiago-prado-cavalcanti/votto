/**
 * Generates Votto's raster brand assets (favicon, PWA icons, Apple touch icon
 * and the social/share image) from inline SVG, so every icon stays in sync with
 * the brand.
 *
 * The logo is now purely typographic — "Votto." with a terracota period, see
 * src/components/public/Wordmark.tsx — and a wordmark does not survive a 16px
 * browser tab. So two forms carry the brand at small sizes:
 *
 *   - the serif **V** with its period, for the favicon: a fragment of the
 *     signature rather than a separate symbol;
 *   - the **radar petal**, for the install icons (PWA/Apple), where there is room
 *     for the shape to breathe. It is the same organic blob the home page
 *     animates (src/components/public/AlignmentRadar.tsx), which docs/design.md
 *     calls "the brand made visible".
 *
 * Letterforms come from scripts/brand-glyphs.mjs as literal outlines: rendering
 * <text> through librsvg would silently substitute whatever serif the machine
 * happens to have.
 *
 * Run with: node scripts/generate-brand-assets.mjs
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { WORDMARK, INITIAL } from "./brand-glyphs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");
const appDir = join(root, "src", "app");

// Brand palette (mirrors src/app/globals.css — "papel & pigmento", docs/design.md).
const PINHO = "#183a33";
const PAPER = "#fcfaf6";
const INK = "#17150f";
const ACCENT = "#b4552f";

// ─── The logotype ────────────────────────────────────────────────────────────

/**
 * Places a glyph group so its ink box is centred in a `w`×`h` box, scaled to an
 * em size of `em`. The word and the period are painted separately because the
 * period is the logotype's only pigment.
 */
function setLogotype(glyph, em, w, h, wordColor, dotColor) {
  const x = (w - glyph.box.w * em) / 2 - glyph.box.x * em;
  const y = (h - glyph.box.h * em) / 2 - glyph.box.y * em;
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${em})">
      <path d="${glyph.word}" fill="${wordColor}" />
      <path d="${glyph.dot}" fill="${dotColor}" />
    </g>`;
}

// ─── The radar petal ─────────────────────────────────────────────────────────

// Same construction as src/components/public/AlignmentRadar.tsx — keep in step.
const C = 250;
const R = 147;
const N = 6;

const angle = (i, n) => ((-90 + (i * 360) / n) * Math.PI) / 180;
const point = (i, v, n) => [C + R * v * Math.cos(angle(i, n)), C + R * v * Math.sin(angle(i, n))];
/** Deterministic pseudo-random, so the icon's "hand" matches the live radar. */
const wobble = (k) => (Math.sin(k * 12.9898) * 43758.5453) % 1;

/** Closed Catmull-Rom through the vertices, converted to cubic béziers. */
function blob(values, jitter, n = values.length) {
  const P = values.map((v, i) => point(i, v, n));
  const m = P.length;
  let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < m; i++) {
    const p0 = P[(i - 1 + m) % m];
    const p1 = P[i];
    const p2 = P[(i + 1) % m];
    const p3 = P[(i + 2) % m];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 5.4 + wobble(i + 1) * jitter, p1[1] + (p2[1] - p0[1]) / 5.4 + wobble(i + 2) * jitter];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 5.4 + wobble(i + 3) * jitter, p2[1] - (p3[1] - p1[1]) / 5.4 + wobble(i + 4) * jitter];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

// The first frame of the live radar, in its terracota colourway, held still.
const GROUND_D = blob([1.24, 1.19, 1.26, 1.20, 1.23, 1.18, 1.27, 1.20, 1.22], 4, 9);
const YOU = [0.90, 0.66, 0.94, 0.58, 0.74, 0.88];
const AGENT = [0.62, 0.90, 0.68, 0.84, 0.50, 0.62];

const GROUND_FILL = "#a8452f"; // brick — the ground of the radar's third palette
const YOU_FILL = "#f7ece0";
const AGENT_FILL = "#2e2a22";

/**
 * The radar reduced to a still mark: the organic mass, the citizen's petal, and
 * its vertex dots. Hairlines, axes, labels and the second (agent) petal are all
 * dropped — they are chart furniture, and at icon scale the two overlapping
 * petals read as a scribble rather than as two profiles.
 *
 * `zoom` scales the construction about its centre; what is left over is padding.
 */
function radarMark(zoom) {
  const dots = YOU.map((v, i) => {
    const [x, y] = point(i, v, N);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${YOU_FILL}" />`;
  }).join("");

  return `<g transform="translate(${C} ${C}) scale(${zoom}) translate(${-C} ${-C})">
      <path d="${GROUND_D}" fill="${GROUND_FILL}" />
      <path d="${blob(YOU, 4, N)}" fill="${YOU_FILL}" fill-opacity="0.18" stroke="${YOU_FILL}" stroke-width="11" stroke-linejoin="round" />
      ${dots}
    </g>`;
}

// ─── Icon compositions ───────────────────────────────────────────────────────

/**
 * Favicon: the serif V on a solid pinho tile.
 *
 * The rounded tile is the one place the "paper does not round" rule is set aside
 * — a browser tab and an OS launcher both expect a rounded square, and mask it
 * anyway. The period keeps its terracota: below ~24px it stops resolving as a
 * shape and simply reads as the brand's one spot of pigment.
 */
function faviconSvg(size, { radius = 0.22 } = {}) {
  // Sized off the glyph's ink box so the V fills ~54% of the tile's height and
  // ~74% of its width — as large as the period allows before it touches the edge.
  const em = size * 0.79;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${size * radius}" fill="${PINHO}" />
    ${setLogotype(INITIAL, em, size, size, PAPER, ACCENT)}
  </svg>`;
}

/** Install icon: the radar petal on warm paper, as it sits on the home page. */
function radarIconSvg({ radius = 0.22, zoom = 1.14 } = {}) {
  return `<svg width="512" height="512" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
    <rect width="500" height="500" rx="${500 * radius}" fill="${PAPER}" />
    ${radarMark(zoom)}
  </svg>`;
}

/**
 * Maskable icon: full-bleed paper with the mark pulled inside the PWA safe zone
 * (~80%), so an aggressive circular mask never clips the petal.
 */
function maskableSvg() {
  return `<svg width="512" height="512" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
    <rect width="500" height="500" fill="${PAPER}" />
    ${radarMark(1.05)}
  </svg>`;
}

/**
 * 1200×630 social/share card: the logotype on warm paper, opened by the 3px ink
 * rule — the same clipping the dynamic cards render (src/lib/widgets). The radar
 * petal sits small in the corner as the card's only ornament.
 */
function ogSvg() {
  const W = 1200;
  const H = 630;
  const em = 200;
  const markSize = 150;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${PAPER}" />
    <!-- section opener -->
    <rect x="72" y="72" width="120" height="3" fill="${INK}" />
    ${setLogotype(WORDMARK, em, W, H, INK, ACCENT)}
    <g transform="translate(${W - markSize - 72} ${H - markSize - 72}) scale(${markSize / 500})">
      ${radarMark(1.14)}
    </g>
  </svg>`;
}

async function png(svg, size, outPath) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log("✓", outPath.replace(root + "/", ""));
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  // PWA / manifest icons — the radar petal.
  await png(radarIconSvg(), 192, join(publicDir, "icon-192.png"));
  await png(radarIconSvg(), 512, join(publicDir, "icon-512.png"));
  await png(maskableSvg(), 512, join(publicDir, "icon-maskable-512.png"));

  // Apple touch icon (Next.js app-dir convention: src/app/apple-icon.png).
  // iOS rounds the tile itself, so it is generated square.
  await png(radarIconSvg({ radius: 0 }), 180, join(appDir, "apple-icon.png"));

  // Classic favicon fallback — the serif V.
  await png(faviconSvg(48), 48, join(publicDir, "favicon.png"));

  // Social / share image
  await sharp(Buffer.from(ogSvg())).png().toFile(join(appDir, "opengraph-image.png"));
  console.log("✓ src/app/opengraph-image.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
