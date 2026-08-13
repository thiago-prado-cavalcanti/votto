/**
 * Builds the party logos served from public/logos/partidos/ out of the untouched
 * Commons originals in assets/party-logos/.
 *
 * Three steps, all of them the reason this is a build and not a folder of files:
 *
 *  1. **Crop.** Most official marks are a two-tier lockup: the symbol on top, the
 *     party's full name (sometimes a slogan) set underneath. In a bounded slot
 *     that band eats the height, the symbol shrinks, and the name is unreadable
 *     at that size anyway. `crop` drops it by shrinking the SVG's viewBox — the
 *     visible window changes, no path is touched. Careful when retuning:
 *     descenders (the "p" of psd, of podemos) fall below the baseline and get
 *     cut with the caption if the fraction goes too far.
 *
 *  2. **Normalize the optical weight.** The marks range from 1:1 (the PT star)
 *     to 7:1 (Rede). Dropped into one slot with `object-contain`, the square one
 *     fills the height while the wide one becomes a 9px thread — the same list
 *     shows logos that look enormous next to logos that look tiny. So each mark
 *     is placed on a shared canvas at a size that keeps its **area** constant:
 *     height ∝ ratio^-0.5, which is the exponent that makes a 1:1 and a 7:1 mark
 *     cover the same amount of ink. Because every output shares one canvas, they
 *     stay in proportion to each other in *any* slot the UI gives them.
 *
 *  3. **Rasterize.** A PNG twin per mark for the OG share cards, which satori
 *     draws from PNG/JPEG and not SVG.
 *
 * Run with: npm run assets:party-logos
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, "..", "assets", "party-logos");
const OUT_DIR = join(__dirname, "..", "public", "logos", "partidos");

/**
 * Canvas height, shared by every mark; the width is cut to each mark.
 *
 * The height is what carries the normalization: give the <img> a height in CSS
 * and every mark scales by the same factor, so their relative weights survive.
 * The width being tight is what makes them placeable — the element wraps the
 * mark instead of padding it, so it sits flush against whatever edge the layout
 * aligns it to, left or right, with no per-mark indent.
 */
const CANVAS_H = 100;
/** Equal area. 1.0 would mean equal width — that is the defect being fixed. */
const ALPHA = 0.5;
/**
 * Base height, in canvas units. 92 is the largest that keeps every mark inside
 * the canvas; the marks sit below that on purpose — at full size they compete
 * with the agent's portrait on the card, and a party is the agent's attribute,
 * not their equal.
 */
const BASE = 74;
/** Longest side of the PNG twin, in px. */
const RASTER = 512;

/**
 * Fraction of the source height to drop from the bottom, per mark: the band
 * carrying the party name. 0 means the file is already symbol-only.
 */
const CROP = {
  avante: 0,
  cidadania: 0,
  dc: 0.48,
  mdb: 0,
  missao: 0,
  novo: 0.34,
  pcdob: 0,
  pdt: 0,
  pl: 0.3,
  pode: 0.12,
  pp: 0,
  prd: 0.22,
  psb: 0,
  psd: 0.12,
  psdb: 0,
  psol: 0,
  pt: 0,
  pv: 0,
  rede: 0.2,
  republicanos: 0,
  solidariedade: 0.42,
  uniao: 0,
};

/** Read an SVG's viewBox, falling back to its width/height attributes. */
function viewBoxOf(svg) {
  const m = svg.match(
    /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)\s*["']/,
  );
  if (m) return [+m[1], +m[2], +m[3], +m[4]];
  const w = +(svg.match(/\bwidth\s*=\s*["']([\d.]+)/)?.[1] ?? 0);
  const h = +(svg.match(/\bheight\s*=\s*["']([\d.]+)/)?.[1] ?? 0);
  if (!w || !h) throw new Error("SVG has neither viewBox nor numeric width/height");
  return [0, 0, w, h];
}

/**
 * Rewrite the root <svg> tag, dropping the geometry attributes and setting the
 * given ones. Done on the tag alone: a blanket replace over the document also
 * hits child elements, and leaving a stale attribute behind makes librsvg refuse
 * the file outright ("attribute height redefined").
 */
function withRootAttrs(svg, attrs) {
  return svg.replace(/<svg([^>]*)>/i, (_all, raw) => {
    const kept = raw.replace(
      /\s(width|height|x|y|viewBox|preserveAspectRatio)\s*=\s*(["'])[\s\S]*?\2/gi,
      "",
    );
    const added = Object.entries(attrs)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join("");
    return `<svg${kept}${added}>`;
  });
}

/** Drop `frac` of the height off the bottom by shrinking the viewBox. */
function crop(svg, frac) {
  if (!frac) return svg;
  const [x, y, w, h] = viewBoxOf(svg);
  const nh = h * (1 - frac);
  return withRootAttrs(svg, { viewBox: `${x} ${y} ${w} ${nh}`, width: w, height: nh });
}

/**
 * The box the mark's ink actually occupies, in viewBox units.
 *
 * A declared viewBox is not a bounding box: several of these files carry empty
 * margin inside it (Solidariedade's is padded on the left). Trusting it would
 * both indent that mark away from the column it should align to and overstate
 * its size when the weights are computed — it would be normalized on air.
 * Measured by rasterizing once and asking sharp where the transparent border
 * ends.
 */
async function inkBox(svg) {
  const vb = viewBoxOf(svg);
  const probe = 800;
  // Pin the probe's size in px on the root tag rather than scaling by density.
  // Several of these files declare their width in MILLIMETRES, so a density
  // computed from the viewBox renders them at an unrelated scale — the MDB mark
  // came out past sharp's pixel limit and PCdoB came out 28px wide.
  const scale = Math.max(vb[2], vb[3]) / probe;
  const probeSvg = withRootAttrs(svg, {
    viewBox: vb.join(" "),
    width: Math.round(vb[2] / scale),
    height: Math.round(vb[3] / scale),
  });
  const raster = await sharp(Buffer.from(probeSvg)).ensureAlpha().png().toBuffer();
  const { info } = await sharp(raster).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  return [
    vb[0] + -(info.trimOffsetLeft ?? 0) * scale,
    vb[1] + -(info.trimOffsetTop ?? 0) * scale,
    info.width * scale,
    info.height * scale,
  ];
}

/** Place the mark on the shared canvas at constant area (see step 2 above). */
async function normalize(svg) {
  const vb = await inkBox(svg);
  const ratio = vb[2] / vb[3];
  let h = BASE * Math.pow(ratio, -ALPHA);
  let w = ratio * h;
  const fit = Math.min(1, CANVAS_H / h);
  h *= fit;
  w *= fit;
  // The canvas is exactly as wide as the mark and always CANVAS_H tall: the mark
  // fills it horizontally and floats in the middle vertically. So the rendered
  // <img> box is the mark's own box, and only the shared height is padded.
  const canvasW = w;
  const x = 0;
  const y = (CANVAS_H - h) / 2;

  const inner = withRootAttrs(
    svg.replace(/<\?xml[^>]*\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, ""),
    {
      viewBox: vb.join(" "),
      x: x.toFixed(2),
      y: y.toFixed(2),
      width: w.toFixed(2),
      height: h.toFixed(2),
      preserveAspectRatio: "xMidYMid meet",
    },
  ).trim();

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasW.toFixed(2)} ${CANVAS_H}"` +
    ` width="${canvasW.toFixed(2)}" height="${CANVAS_H}">${inner}</svg>`
  );
}

await mkdir(OUT_DIR, { recursive: true });

const rows = [];
for (const [slug, frac] of Object.entries(CROP)) {
  const source = await readFile(join(SRC_DIR, `${slug}.svg`), "utf8");
  const built = await normalize(crop(source, frac));
  await writeFile(join(OUT_DIR, `${slug}.svg`), built);

  // Rasterize AT the target size: some sources declare a nominal size in the
  // tens of thousands of px, which blows sharp's pixel limit if rendered at
  // native density and only then downscaled.
  const buf = Buffer.from(built);
  // Raster twins share the canvas HEIGHT, like the vectors: the OG card gives
  // them a height and lets the width follow, so the weights survive there too.
  const png = await sharp(buf, { density: (72 * RASTER) / CANVAS_H })
    .resize({ height: RASTER })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(join(OUT_DIR, `${slug}.png`), png);

  const [, , sw, sh] = await inkBox(crop(source, frac));
  const out = await sharp(buf).metadata();
  rows.push({
    slug,
    corte: frac ? `${Math.round(frac * 100)}%` : "—",
    proporção: `${(sw / sh).toFixed(2)}:1`,
    "canvas": `${Math.round(out.width)}×${CANVAS_H}`,
    svg: `${(buf.length / 1024).toFixed(1)} KB`,
    png: `${(png.length / 1024).toFixed(1)} KB`,
  });
}

console.table(rows);
console.log(
  `\n${rows.length} logo(s) em ${OUT_DIR}\n` +
    `altura de canvas ${CANVAS_H} para todas, largura justa a cada marca — ` +
    `dê ALTURA aos slots da UI e deixe a largura livre.`,
);
