/**
 * Recompute the quality index for every public agent, from data already stored.
 *
 *   npm run requality            # aplica a fórmula atual
 *   npm run requality -- --dry   # só mostra a distribuição, não grava
 *
 * The weights in `src/lib/indexes/quality.ts` are editorial judgement expressed
 * as numbers, and they will be tuned more than once. Every input the index needs
 * — attendance ledger, service spans, bill counts, quota — is already a column,
 * so retuning does NOT require re-importing from the official APIs. Twin of
 * `scripts/reprioritize.ts`, for the same reason and in the same shape.
 *
 * Prints the resulting band distribution, which is the thing worth looking at.
 * Because every pillar is a percentile, a healthy run spreads across the bands;
 * a spike in the middle means the composite is averaging four uniforms into a
 * clump, and the index has stopped discriminating.
 */
// Must precede every import that reads `env` at module load.
import "./load-env";
import { db } from "@/lib/db";
import { recomputeQualityIndex } from "@/lib/integration/quality";
import {
  QUALITY_PILLARS,
  qualityBand,
  qualityBandLabel,
  type QualityBand,
} from "@/lib/indexes/quality";

type Distribution = Record<QualityBand | "UNSCORED", number>;

function emptyDistribution(): Distribution {
  return { EXCELLENT: 0, GOOD: 0, AVERAGE: 0, WEAK: 0, UNSCORED: 0 };
}

const ROW_LABEL: Record<keyof Distribution, string> = {
  ...qualityBandLabel,
  UNSCORED: "Sem nota (cobertura)",
};

/** Render a distribution as an aligned, percentage-annotated block. */
function render(label: string, dist: Distribution, total: number): string {
  const lines = (Object.keys(dist) as Array<keyof Distribution>).map((band) => {
    const n = dist[band];
    const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round((total > 0 ? n / total : 0) * 30));
    return `    ${ROW_LABEL[band].padEnd(22)} ${String(n).padStart(5)}  ${pct.padStart(5)}%  ${bar}`;
  });
  return `  ${label}\n${lines.join("\n")}`;
}

function tally(scores: Array<number | null>): Distribution {
  const dist = emptyDistribution();
  for (const score of scores) {
    if (score === null) dist.UNSCORED++;
    else dist[qualityBand(score)]++;
  }
  return dist;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry");

  const before = await db.publicAgent.findMany({
    where: { inOffice: true, type: { in: ["FEDERAL_DEPUTY", "SENATOR"] } },
    select: { qualityScore: true },
  });

  if (before.length === 0) {
    console.log("Nenhum agente em exercício encontrado. Rode `npm run backfill` primeiro.");
    await db.$disconnect();
    return;
  }

  const { scored, skippedHouses } = await recomputeQualityIndex({ dryRun });

  console.log(`▶ ${scored.length.toLocaleString("pt-BR")} agentes em exercício\n`);
  console.log(render("Antes:", tally(before.map((a) => a.qualityScore)), before.length));
  console.log("");
  console.log(
    render(dryRun ? "Depois (simulado):" : "Depois:", tally(scored.map((s) => s.score)), scored.length),
  );

  if (skippedHouses.length > 0) {
    console.log(
      `\n  ⚠ Casa(s) sem cobertura mínima, não gravadas: ${skippedHouses.join(", ")}.` +
        "\n    Percentil calculado sobre um import parcial diria a cada agente que ele" +
        "\n    está numa coorte que não é a dele. Rode os jobs de mandato e despesa antes.",
    );
  }

  const ranked = scored
    .filter((s): s is typeof s & { score: number } => s.score !== null)
    .sort((a, b) => b.score - a.score);

  if (ranked.length > 0) {
    // The calibration check that matters is human: the extremes have to be
    // recognisable. A ranking whose top and bottom read as arbitrary is not
    // measuring anything, however clean its histogram looks.
    const show = (rows: typeof ranked) =>
      rows
        .map((r) => {
          // The pillar breakdown is what makes the extremes diagnosable rather
          // than merely surprising: a name at the bottom is only useful if you
          // can see which pillar put it there.
          const pills = r.pillars
            .map((p) => `${p.key.slice(0, 4)}=${p.score ?? "—"}`)
            .join(" ");
          return `      ${String(r.score).padStart(3)}  ${r.name.padEnd(28)}  ${pills}`;
        })
        .join("\n");
    console.log(`\n  Topo:\n${show(ranked.slice(0, 5))}`);
    console.log(`\n  Fundo:\n${show(ranked.slice(-5))}`);
  }

  // Per-pillar health. A pillar whose cohort is mostly one tie block is not
  // discriminating — it adds a near-constant to everybody's score and dilutes
  // the pillars that do carry information. This is the number to watch when
  // deciding whether a pillar's source is good enough to keep its weight.
  console.log("\n  Saúde dos pilares:");
  for (const pillar of QUALITY_PILLARS) {
    const values = scored
      .map((s) => s.pillars.find((p) => p.key === pillar.key)?.score ?? null)
      .filter((v): v is number => v !== null);
    if (values.length === 0) {
      console.log(`    ${pillar.label.padEnd(22)} sem nenhuma medição`);
      continue;
    }
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    const [tieValue, tieCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const tieShare = (tieCount / values.length) * 100;
    const flag = tieShare > 40 ? "  ⚠ pouco discriminante" : "";
    console.log(
      `    ${pillar.label.padEnd(22)} ${String(values.length).padStart(3)} medidos · ` +
        `maior empate ${tieShare.toFixed(0)}% em ${tieValue}${flag}`,
    );
  }

  if (dryRun) console.log("\n  (--dry: nada foi gravado)");
  else console.log("\n✓ Índice atualizado.");

  await db.$disconnect();
}

void main().catch(async (err) => {
  console.error("Falha:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
