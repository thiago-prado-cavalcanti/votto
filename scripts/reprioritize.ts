/**
 * Recompute `Theme.priority` for every imported theme, from data already stored.
 *
 *   npm run reprioritize            # aplica a fórmula atual
 *   npm run reprioritize -- --dry   # só mostra a distribuição, não grava
 *
 * The ranking in `src/lib/domain/priority.ts` is editorial judgement expressed
 * as weights, and it will be tuned more than once. Every input it needs —
 * regime, situation, identifier, progress flag, last action — is already a
 * column on Theme, so retuning does NOT require re-importing from the official
 * APIs: this recomputes the score in place, in one pass, with no network.
 *
 * Prints the resulting band distribution, which is the thing worth looking at:
 * a healthy ranking discriminates, and "everything is urgent" means the same as
 * "nothing is urgent".
 */
import { db } from "@/lib/db";
import { computePriority, priorityBand, priorityBandLabel, type PriorityBand } from "@/lib/domain/priority";
import { ImportSource } from "@/generated/prisma";

/** Rows updated per database round trip. */
const BATCH_SIZE = 500;

/** Tally of themes per band, for the before/after comparison. */
type Distribution = Record<PriorityBand, number>;

function emptyDistribution(): Distribution {
  return { URGENT: 0, HIGH: 0, NORMAL: 0, LOW: 0 };
}

/** Render a distribution as an aligned, percentage-annotated block. */
function render(label: string, dist: Distribution, total: number): string {
  const lines = (Object.keys(dist) as PriorityBand[]).map((band) => {
    const n = dist[band];
    const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round((total > 0 ? n / total : 0) * 30));
    return `    ${priorityBandLabel[band].padEnd(20)} ${String(n).padStart(5)}  ${pct.padStart(5)}%  ${bar}`;
  });
  return `  ${label}\n${lines.join("\n")}`;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry");

  const themes = await db.theme.findMany({
    where: { source: { not: ImportSource.MANUAL } },
    select: {
      id: true,
      priority: true,
      urgency: true,
      situation: true,
      identifier: true,
      inProgress: true,
      lastActionAt: true,
    },
  });

  if (themes.length === 0) {
    console.log("Nenhum tema importado encontrado. Rode `npm run backfill` primeiro.");
    await db.$disconnect();
    return;
  }

  const before = emptyDistribution();
  const after = emptyDistribution();
  const updates: Array<{ id: string; priority: number }> = [];

  for (const theme of themes) {
    before[priorityBand(theme.priority)]++;
    const priority = computePriority(theme);
    after[priorityBand(priority)]++;
    if (priority !== theme.priority) updates.push({ id: theme.id, priority });
  }

  console.log(`▶ ${themes.length.toLocaleString("pt-BR")} temas importados\n`);
  console.log(render("Antes:", before, themes.length));
  console.log("");
  console.log(render(dryRun ? "Depois (simulado):" : "Depois:", after, themes.length));
  console.log(`\n  ${updates.length.toLocaleString("pt-BR")} temas mudam de pontuação.`);

  if (dryRun) {
    console.log("  (--dry: nada foi gravado)");
    await db.$disconnect();
    return;
  }

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    // Each priority is distinct per theme, so this is a plain batch of updates
    // rather than something expressible as one statement.
    await db.$transaction(
      batch.map((u) => db.theme.update({ where: { id: u.id }, data: { priority: u.priority } })),
    );
    console.log(`  … ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}`);
  }

  console.log("\n✓ Pontuações atualizadas.");
  await db.$disconnect();
}

void main().catch(async (err) => {
  console.error("Falha:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
