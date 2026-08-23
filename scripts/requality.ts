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
  GOALPOSTS,
  QUALITY_METHODOLOGY,
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

  const { scored, shapes, skippedHouses, blockedBy } = await recomputeQualityIndex({ dryRun });

  console.log(
    `▶ ${scored.length.toLocaleString("pt-BR")} agentes em exercício · ` +
      `metodologia ${QUALITY_METHODOLOGY.version} (${QUALITY_METHODOLOGY.changedAt})\n`,
  );
  console.log(render("Antes:", tally(before.map((a) => a.qualityScore)), before.length));
  console.log("");
  console.log(
    render(dryRun ? "Depois (simulado):" : "Depois:", tally(scored.map((s) => s.score)), scored.length),
  );

  for (const [house, pillars] of blockedBy) {
    console.log(
      `\n  ⚠ ${house}: nenhum agente pôde ser medido em ${pillars.join(" e ")}.` +
        "\n    Isso não é cobertura parcial, é dado que não foi carregado — e sem o aviso" +
        "\n    cada agente publicaria uma nota plausível com o pilar mais pesado ausente." +
        "\n    A assiduidade vem do livro de votações: rode `camara:votes` e `senado:votes`" +
        "\n    (com --days largo) e recalcule.",
    );
  }
  const thin = skippedHouses.filter((h) => !blockedBy.has(h));
  if (thin.length > 0) {
    console.log(
      `\n  ⚠ Casa(s) sem cobertura mínima, não gravadas: ${thin.join(", ")}.` +
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

  // Shape of each cohort BEFORE normalization. This is the check that says
  // whether the normalization is defensible at all: a distribution one outlier
  // is driving cannot be normalized raw without crushing everybody else, and
  // |assimetria| > 2 com curtose > 3.5 é a convenção que marca esse caso.
  if (shapes.length > 0) {
    console.log("\n  Forma das coortes (antes de normalizar):");
    for (const { pillar, cohort, shape } of shapes.sort(
      (a, b) => Math.abs(b.shape.skewness) - Math.abs(a.shape.skewness),
    ).slice(0, 8)) {
      const flag = shape.needsTreatment ? "  ⚠ um outlier domina" : "";
      console.log(
        `    ${`${pillar}·${cohort}`.padEnd(26)} n=${String(shape.n).padStart(3)} ` +
          `assim=${shape.skewness.toFixed(2).padStart(6)} curt=${shape.kurtosis.toFixed(2).padStart(7)} ` +
          `max/med=${(shape.max / (shape.median || 1)).toFixed(1)}×${flag}`,
      );
    }
  }

  // Utilização da cota por casa. Diagnóstico, não nota — existe porque a tabela
  // da CEAPS que o Senado publica é de 2017 (`domain/quota-ceilings.ts`), então
  // a utilização dos senadores é lida contra um teto provavelmente baixo. O
  // sintoma é a mediana do Senado destoar da mediana da Câmara: as duas casas
  // gastam contra tetos diferentes, mas não há razão para que a FRAÇÃO que
  // consomem seja sistematicamente diferente. Se destoar, o teto está errado —
  // não os senadores.
  console.log("\n  Utilização da cota, por casa (diagnóstico do teto):");
  for (const house of ["CAMARA", "SENADO"] as const) {
    const values = scored
      .filter((s) => s.house === house)
      .map((s) => s.costUtilisation)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (values.length === 0) {
      console.log(`    ${house.padEnd(8)} sem medição de custo`);
      continue;
    }
    const at = (q: number) => values[Math.min(values.length - 1, Math.floor(values.length * q))];
    const pinned = values.filter((v) => v >= GOALPOSTS.cost.floor).length;
    const flag = pinned / values.length > 0.25 ? "  ⚠ teto provavelmente defasado" : "";
    console.log(
      `    ${house.padEnd(8)} n=${String(values.length).padStart(3)} · ` +
        `mediana ${(at(0.5) * 100).toFixed(0)}% · p10 ${(at(0.1) * 100).toFixed(0)}% · ` +
        `p90 ${(at(0.9) * 100).toFixed(0)}% · ${((pinned / values.length) * 100).toFixed(0)}% no piso${flag}`,
    );
  }

  if (dryRun) console.log("\n  (--dry: nada foi gravado)");
  else console.log("\n✓ Performance política atualizada.");

  await db.$disconnect();
}

void main().catch(async (err) => {
  console.error("Falha:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
