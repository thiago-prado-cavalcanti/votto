/**
 * Generates Votto's raster brand assets (PWA icons, Apple touch icon, and the
 * social/share image) from inline SVG, so the favicon, install icons, and
 * WhatsApp/social link previews all stay in sync with the brand mark.
 *
 * Run with: node scripts/generate-brand-assets.mjs
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");
const appDir = join(root, "src", "app");

// Brand palette (mirrors src/app/globals.css).
const TEAL = "#133e39";
const TEAL_DEEP = "#0a2320";
const WHITE = "#ffffff";
const ACCENT = "#ff9a2e";

/** The standalone V/check mark, scaled into a square `size` viewBox. */
function markPaths(scale = 1, x = 0, y = 0) {
  const s = (n) => n * scale;
  return `
    <path d="M${s(10.8) + x} ${s(10.6) + y} L${s(20) + x} ${s(28.6) + y}"
      stroke="${WHITE}" stroke-width="${s(5.8)}" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M${s(20) + x} ${s(28.6) + y} L${s(29.2) + x} ${s(10.6) + y}"
      stroke="${ACCENT}" stroke-width="${s(5.8)}" stroke-linecap="round" stroke-linejoin="round" />`;
}

/** Square icon: solid teal tile + centered mark. */
function iconSvg(size, { rounded = true } = {}) {
  const scale = size / 40;
  const radius = rounded ? size * 0.22 : 0;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${TEAL}" />
    ${markPaths(scale)}
  </svg>`;
}

/** Maskable icon: full-bleed teal with the mark inside the PWA safe zone (~80%). */
function maskableSvg(size) {
  const inner = size * 0.6;
  const scale = inner / 40;
  const offset = (size - inner) / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${TEAL}" />
    ${markPaths(scale, offset, offset)}
  </svg>`;
}

/** 1200×630 social/share card: just the mark + "Votto", centered on teal. */
function ogSvg() {
  const W = 1200;
  const H = 630;
  const markScale = 5; // 40 → 200px mark
  const markSize = 40 * markScale;

  // Wordmark metrics (Sora 800). Width is estimated from the font's average
  // advance so the mark+wordmark group can be centered as a whole.
  const fontSize = 150;
  const gap = 48;
  const wordWidth = fontSize * 2.55; // ~"Votto" at this size/weight

  const groupW = markSize + gap + wordWidth;
  const markX = Math.round((W - groupW) / 2);
  const markY = Math.round((H - markSize) / 2);
  const textX = markX + markSize + gap;
  const textBaseline = markY + markSize / 2 + fontSize * 0.35; // optical centering

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${TEAL}" />
        <stop offset="1" stop-color="${TEAL_DEEP}" />
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)" />
    <!-- mark tile -->
    <rect x="${markX}" y="${markY}" width="${markSize}" height="${markSize}" rx="${markSize * 0.22}" fill="rgba(255,255,255,0.06)" />
    ${markPaths(markScale, markX, markY)}
    <!-- wordmark -->
    <text x="${textX}" y="${Math.round(textBaseline)}" font-family="'Sora','Segoe UI',sans-serif" font-size="${fontSize}" font-weight="800" fill="${WHITE}" letter-spacing="-4">Votto</text>
  </svg>`;
}

async function png(svg, size, outPath) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log("✓", outPath.replace(root + "/", ""));
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  // PWA / manifest icons
  await png(iconSvg(192), 192, join(publicDir, "icon-192.png"));
  await png(iconSvg(512), 512, join(publicDir, "icon-512.png"));
  await png(maskableSvg(512), 512, join(publicDir, "icon-maskable-512.png"));

  // Apple touch icon (Next.js app-dir convention: src/app/apple-icon.png)
  await png(iconSvg(180, { rounded: false }), 180, join(appDir, "apple-icon.png"));

  // Classic favicon fallback (some crawlers/old browsers expect /favicon.ico)
  await sharp(Buffer.from(iconSvg(48)))
    .resize(48, 48)
    .toFormat("png")
    .toFile(join(publicDir, "favicon.png"));
  console.log("✓ public/favicon.png");

  // Social / share image
  await sharp(Buffer.from(ogSvg()))
    .png()
    .toFile(join(appDir, "opengraph-image.png"));
  console.log("✓ src/app/opengraph-image.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
