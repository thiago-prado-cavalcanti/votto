/**
 * Official-source import CLI.
 *
 * Usage:
 *   tsx scripts/import.ts <camara|senado> [--days N] [--limit N]
 *
 * Examples:
 *   tsx scripts/import.ts camara --days 30
 *   tsx scripts/import.ts senado --days 60 --limit 50
 *
 * Requires DATABASE_URL (and, for any CPF-bearing flows, the CPF keys) in the
 * environment. Exits 0 on success, non-zero on failure.
 */
import { camaraImporter } from "@/lib/integration/camara";
import { senadoImporter } from "@/lib/integration/senado";
import { runImport, type Importer, type ImportOptions } from "@/lib/integration/importer";

/** Map a source name argument to its importer. */
function pickImporter(name: string): Importer | null {
  switch (name.toLowerCase()) {
    case "camara":
    case "câmara":
      return camaraImporter;
    case "senado":
      return senadoImporter;
    default:
      return null;
  }
}

/** Parse `--days`/`--limit` flags from argv into ImportOptions. */
function parseOptions(argv: string[]): ImportOptions {
  const opts: ImportOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days") {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) opts.days = Math.floor(n);
    } else if (a === "--limit") {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) opts.limit = Math.floor(n);
    }
  }
  return opts;
}

/** Entry point: select importer, run it, print a summary. */
async function main(): Promise<void> {
  const [, , source, ...rest] = process.argv;

  if (!source) {
    console.error("Uso: tsx scripts/import.ts <camara|senado> [--days N] [--limit N]");
    process.exit(2);
  }

  const importer = pickImporter(source);
  if (!importer) {
    console.error(`Fonte desconhecida: "${source}". Use "camara" ou "senado".`);
    process.exit(2);
  }

  const opts = parseOptions(rest);
  console.log(
    `▶ Importando de ${importer.source} ` +
      `(days=${opts.days ?? "default"}, limit=${opts.limit ?? "none"})…`,
  );

  const startedAt = Date.now();
  try {
    const result = await runImport(importer, opts);
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `✓ Concluído em ${secs}s — vistos: ${result.itemsSeen}, ` +
        `upserts: ${result.itemsUpserted}.`,
    );
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Falha na importação: ${message}`);
    process.exit(1);
  }
}

void main();
