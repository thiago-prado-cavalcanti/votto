/**
 * Fill in the missing authorship of bills already imported.
 *
 *   npm run reauthor                  # repara Câmara e Senado
 *   npm run reauthor -- --dry         # só conta o que falta, não busca nada
 *   npm run reauthor -- --limit 200   # repara os 200 mais prioritários
 *   npm run reauthor -- --source camara
 *
 * The twin of `npm run reprioritize`, with one difference that decides the whole
 * design: priority is recomputed from columns we already store, authorship is
 * not — it has to be asked of the houses again. So this one talks to the network
 * and is paced by the importers' own delay.
 *
 * Why it is needed at all: `upsertTheme` maps a null author to `undefined`, so a
 * lookup that failed never wipes an author we already had. The cost of that
 * (correct) choice is that a bill first written WITHOUT an author keeps the hole
 * until something touches it again — and the weekly sweeps only revisit bills
 * that moved in the last 30–90 days. A bill parked at "Pronta para Pauta" is
 * exactly the kind the themes list ranks highest and the kind the sweeps never
 * come back to, which is how the order paper ended up with no faces on it.
 *
 * Idempotent and safe to interrupt: it only looks at themes that still have
 * neither `proposerId` nor `proposerName`, so a second run picks up where the
 * first stopped. Requires DATABASE_URL.
 */
// Must precede every import that reads `env` at module load.
import "./load-env";
import * as camara from "@/lib/integration/camara";
import * as senado from "@/lib/integration/senado";
import type { SyncOptions, SyncResult } from "@/lib/integration/importer";
import { db } from "@/lib/db";
import { ImportSource } from "@/generated/prisma";

interface Options {
  dryRun: boolean;
  limit?: number;
  source?: "camara" | "senado";
}

/** The repair pass of each house, in the order the themes list ranks them. */
const REPAIRS = [
  { key: "camara" as const, label: "Câmara dos Deputados", source: ImportSource.CAMARA, run: camara.repairAuthorship },
  { key: "senado" as const, label: "Senado Federal", source: ImportSource.SENADO, run: senado.repairAuthorship },
];

function parseArgs(argv: string[]): Options {
  const opts: Options = { dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry") {
      opts.dryRun = true;
    } else if (arg === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Valor inválido para --limit: "${argv[i]}".`);
        process.exit(2);
      }
      opts.limit = Math.floor(n);
    } else if (arg === "--source") {
      const value = (argv[++i] ?? "").toLowerCase();
      if (value !== "camara" && value !== "senado") {
        console.error(`Fonte desconhecida: "${value}". Use camara ou senado.`);
        process.exit(2);
      }
      opts.source = value;
    } else {
      console.error(`Argumento desconhecido: "${arg}".`);
      process.exit(2);
    }
  }

  return opts;
}

/**
 * How many imported bills carry no accountable face, against how many are in
 * progress at all. The ratio is the number worth printing: "312 sem autoria" is
 * a different story depending on whether the base is 400 or 40.000.
 */
async function survey(source: ImportSource): Promise<{ missing: number; total: number }> {
  const [missing, total] = await Promise.all([
    db.theme.count({ where: { source, inProgress: true, proposerId: null, proposerName: null } }),
    db.theme.count({ where: { source, inProgress: true } }),
  ]);
  return { missing, total };
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const selected = REPAIRS.filter((r) => !opts.source || r.key === opts.source);

  console.log("\n  Autoria ausente em temas em tramitação\n");
  for (const repair of selected) {
    const { missing, total } = await survey(repair.source);
    console.log(
      `  ${repair.label.padEnd(24)} ${String(missing).padStart(6)} de ${String(total).padStart(6)}  (${percent(missing, total)})`,
    );
  }

  if (opts.dryRun) {
    console.log("\n  (--dry: nada foi buscado nem gravado)\n");
    await db.$disconnect();
    return;
  }

  const results: Array<{ label: string; result: SyncResult; error?: unknown }> = [];

  for (const repair of selected) {
    console.log(`\n▶ ${repair.label}${opts.limit ? ` · até ${opts.limit} temas` : ""}`);
    const runOpts: SyncOptions = {
      limit: opts.limit,
      onProgress: (p) => console.log(`  … ${p.note ?? `${p.seen} temas`} · ${p.upserted} gravados`),
    };
    try {
      results.push({ label: repair.label, result: await repair.run(runOpts) });
    } catch (err) {
      // One house failing must not cost the other's repair — the same isolation
      // the worker gives its jobs.
      console.error(`  ✗ ${repair.label}: ${err instanceof Error ? err.message : String(err)}`);
      results.push({ label: repair.label, result: { itemsSeen: 0, itemsUpserted: 0 }, error: err });
    }
  }

  console.log("\n  Resultado\n");
  for (const { label, result, error } of results) {
    const { missing, total } = await survey(REPAIRS.find((r) => r.label === label)!.source);
    const mark = error ? "✗" : "✓";
    console.log(
      `  ${mark} ${label.padEnd(24)} ${result.itemsSeen} visitados · ${result.itemsUpserted} gravados · ` +
        `restam ${missing} de ${total} sem autoria`,
    );
  }
  console.log("");

  await db.$disconnect();
  if (results.some((r) => r.error)) process.exit(1);
}

void main().catch(async (err) => {
  console.error("Falha:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
