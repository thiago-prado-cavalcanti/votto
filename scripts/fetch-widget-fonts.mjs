/**
 * Downloads the brand fonts used by the dynamic widget/OG images (next/og +
 * satori) into public/fonts/. Satori needs raw TTF/OTF/WOFF buffers and cannot
 * use next/font; we serve them from public/ and read them at runtime with `fs`
 * via process.cwd() — which resolves under both `next dev` and the standalone
 * Docker image (public/ is copied next to the server).
 *
 * Source: @expo-google-fonts (genuine static .ttf instances), via jsDelivr.
 * Run once with: node scripts/fetch-widget-fonts.mjs
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "fonts");

// The pair from the design system (docs/design.md): Instrument Sans for labels
// and microcopy, Newsreader at 500 for every display size. No 800 weight exists
// in this system, so none is downloaded.
const FONTS = [
  {
    out: "InstrumentSans-Regular.ttf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/instrument-sans/400Regular/InstrumentSans_400Regular.ttf",
  },
  {
    out: "InstrumentSans-SemiBold.ttf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf",
  },
  {
    out: "Newsreader-Medium.ttf",
    url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/newsreader/Newsreader_500Medium.ttf",
  },
];

await mkdir(outDir, { recursive: true });

for (const f of FONTS) {
  const res = await fetch(f.url);
  if (!res.ok) throw new Error(`Failed to fetch ${f.url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(outDir, f.out), buf);
  console.log(`✓ ${f.out} (${buf.length} bytes)`);
}
