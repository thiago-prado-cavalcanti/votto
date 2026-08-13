/**
 * Curated party logos, keyed by acronym.
 *
 * The official sources publish a logo per party, but not a usable one: the
 * Câmara serves `internet/Deputado/img/partidos/{SIGLA}.gif` — a ~120px GIF that
 * is, for most parties, the acronym set in plain type rather than the party's
 * actual mark — and the Senado publishes none at all. Importing that means the
 * parties page shows twenty-two variations of grey text.
 *
 * So the mark is ours to curate. Each file below is the party's current logo in
 * SVG (resolution-independent, a few KB), served from `public/logos/partidos/`
 * rather than hot-linked, so a rename at the source cannot blank the page. The
 * `.png` twin next to each `.svg` exists for the OG cards — satori rasterizes
 * the share image and takes PNG/JPEG, not SVG.
 *
 * This map is applied at the single import choke point ({@link upsertParty}),
 * so re-imports keep the curated mark instead of reinstating the source's GIF.
 * A party with no entry here falls back to whatever the source published.
 *
 * Provenance and licence for every file: `docs/logos-partidos.md`.
 */

/** Public path of the curated logo, or null when we do not curate that party. */
export function partyLogoPath(acronym: string | null | undefined): string | null {
  if (!acronym) return null;
  const slug = PARTY_LOGOS[normalizeAcronym(acronym)];
  return slug ? `${BASE_PATH}/${slug}.svg` : null;
}

/**
 * Rewrite a curated logo path to its raster twin, for consumers that cannot
 * render SVG (the OG share cards). Any other URL is returned untouched.
 */
export function partyLogoRaster(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  return logoUrl.startsWith(`${BASE_PATH}/`) && logoUrl.endsWith(".svg")
    ? `${logoUrl.slice(0, -4)}.png`
    : logoUrl;
}

/**
 * Fold an acronym to a comparison key: upper-case, unaccented, letters and
 * digits only. The two houses spell the same party differently — `PCdoB` /
 * `PC do B`, `UNIÃO` / `UNIAO`, `MISSÃO` / `MISSAO` — and the alias table below
 * covers the cases where they disagree on the abbreviation itself.
 */
function normalizeAcronym(acronym: string): string {
  const key = acronym
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return ALIASES[key] ?? key;
}

const BASE_PATH = "/logos/partidos";

/**
 * Alternate abbreviations for the SAME party → the key used below: either the
 * two houses disagreeing (`PODEMOS` / `PODE`) or a rebrand the feeds have not
 * caught up with (`PPS` → Cidadania, `PRB` → Republicanos, `PMDB` → MDB).
 *
 * Mergers are deliberately absent. PTB and Patriota became PRD, but they are
 * distinct legal entities, and a card still named "PTB" wearing PRD's mark
 * would misattribute it.
 */
const ALIASES: Record<string, string> = {
  PODEMOS: "PODE",
  SD: "SOLIDARIEDADE",
  UB: "UNIAO",
  UNIAOBRASIL: "UNIAO",
  PROGRESSISTAS: "PP",
  PPS: "CIDADANIA",
  PMDB: "MDB",
  PRB: "REPUBLICANOS",
};

/** Normalized acronym → file slug in `public/logos/partidos/`. */
const PARTY_LOGOS: Record<string, string> = {
  AVANTE: "avante",
  CIDADANIA: "cidadania",
  DC: "dc",
  MDB: "mdb",
  MISSAO: "missao",
  NOVO: "novo",
  PCDOB: "pcdob",
  PDT: "pdt",
  PL: "pl",
  PODE: "pode",
  PP: "pp",
  PRD: "prd",
  PSB: "psb",
  PSD: "psd",
  PSDB: "psdb",
  PSOL: "psol",
  PT: "pt",
  PV: "pv",
  REDE: "rede",
  REPUBLICANOS: "republicanos",
  SOLIDARIEDADE: "solidariedade",
  UNIAO: "uniao",
};
