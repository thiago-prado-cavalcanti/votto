/**
 * Recalcular o índice de posicionamento, e mostrar se ele pode ser publicado.
 *
 *   npm run reposition            # aplica e grava
 *   npm run reposition -- --dry   # só mede, não grava
 *
 * Gêmeo de `requality` e `reprioritize`: tudo o que o índice lê já é coluna, então
 * retunar peso ou limiar é um recálculo sem rede.
 *
 * A diferença é o que ele imprime. `requality` mostra uma distribuição, porque a
 * pergunta lá é "o índice está discriminando?". Aqui a pergunta é outra e é mais
 * dura — **"isto é ideologia ou é governismo com outro nome?"** —, e ela só tem
 * resposta contra duas réguas externas: a correlação com o governismo, que
 * precisa ser baixa, e a ordenação partidária contra o Brazilian Legislative
 * Survey, que precisa ser alta. As duas saem aqui, lado a lado com a tabela
 * partido a partido, porque a calibragem que importa é humana: uma ordenação em
 * que o PSOL aparece à direita do PSDB está errada por mais bonito que esteja o
 * histograma.
 */
// Precisa vir antes de todo import que lê `env` na carga do módulo.
import "./load-env";
import { db } from "@/lib/db";
import {
  describeBlock,
  recomputePositioningIndex,
  type AgentScore,
} from "@/lib/integration/positioning";
import { bandGate, POSITIONING_AXES, type AxisKey } from "@/lib/indexes/positioning";
import {
  anchorsFor,
  MAX_GOVERNMENT_CORRELATION,
  MIN_ANCHOR_CORRELATION,
  MIN_SPREAD_RATIO,
} from "@/lib/domain/anchors";

/** Uma barra de histograma sobre −100..100, em dez baldes. */
function histogram(values: number[]): string {
  const buckets = new Array<number>(10).fill(0);
  for (const v of values) {
    const i = Math.min(9, Math.max(0, Math.floor(((v + 100) / 200) * 10)));
    buckets[i]++;
  }
  const max = Math.max(1, ...buckets);
  return buckets
    .map((n, i) => {
      const from = -100 + i * 20;
      const bar = "█".repeat(Math.round((n / max) * 24));
      return `    ${String(from).padStart(4)}..${String(from + 20).padStart(4)} ${String(n).padStart(4)}  ${bar}`;
    })
    .join("\n");
}

function axisValues(agents: AgentScore[], axis: AxisKey): number[] {
  return agents
    .map((a) => a.position[axis].value)
    .filter((v): v is number => v !== null);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry");

  const { agents, parties, houses, legacyShare } = await recomputePositioningIndex({ dryRun });

  if (agents.length === 0) {
    console.log("Nenhum agente em exercício encontrado. Rode `npm run backfill` primeiro.");
    await db.$disconnect();
    return;
  }

  console.log(`▶ ${agents.length.toLocaleString("pt-BR")} agentes em exercício\n`);

  // ── As portas, casa por casa ───────────────────────────────────────────────
  console.log("  Portas:");
  for (const h of houses) {
    const mark = h.blocked ? "✗" : "✓";
    console.log(
      `    ${mark} ${h.house.padEnd(7)} ${String(h.items).padStart(4)} itens ` +
        `(${h.itemsControlled} com controle de governo) · ` +
        `${h.agentsScored}/${h.agents} agentes com leitura`,
    );
    if (h.governmentCorrelation !== null) {
      const flag = Math.abs(h.governmentCorrelation) > MAX_GOVERNMENT_CORRELATION ? "  ⚠" : "";
      console.log(
        `        governismo r=${h.governmentCorrelation.toFixed(2)} ` +
          `(máx ${MAX_GOVERNMENT_CORRELATION})${flag}`,
      );
    }
    if (h.anchorCorrelation !== null) {
      const flag = h.anchorCorrelation < MIN_ANCHOR_CORRELATION ? "  ⚠" : "";
      console.log(
        `        âncora BLS ρ=${h.anchorCorrelation.toFixed(2)} ` +
          `(mín ${MIN_ANCHOR_CORRELATION}) · cobertura ${(h.anchorCoverage * 100).toFixed(0)}% das cadeiras${flag}`,
      );
    }
    if (h.axisCorrelation !== null) {
      console.log(
        `        eixos entre si r=${h.axisCorrelation.toFixed(2)}` +
          (h.socialCollinear
            ? "  → eixo social só na figura, sem número próprio (esperado: o CHES-LA mede 0,94 nos partidos brasileiros)"
            : "  → os dois eixos se separam"),
      );
    }
    if (h.spreadRatio !== null) {
      const flag = h.spreadRatio < MIN_SPREAD_RATIO ? "  ⚠" : "";
      console.log(
        `        dispersão ${(h.spreadRatio * 100).toFixed(0)}% da âncora ` +
          `(mín ${MIN_SPREAD_RATIO * 100}%) — o eixo espalha tanto quanto a régua?${flag}`,
      );
    }
    if (h.unanchored.length > 0) {
      console.log(`        sem âncora: ${h.unanchored.join(", ")}`);
    }
    if (h.blocked) {
      console.log(`        ⚠ não gravada — ${describeBlock(h.blocked)}`);
    }
  }

  // ── Distribuição por eixo ─────────────────────────────────────────────────
  for (const axis of ["economic", "social"] as const) {
    const values = axisValues(agents, axis);
    const meta = POSITIONING_AXES[axis];
    console.log(
      `\n  ${meta.label} (${meta.negative} ↔ ${meta.positive}) — ${values.length} com leitura:`,
    );
    if (values.length === 0) {
      console.log("    sem nenhuma medição");
      continue;
    }
    console.log(histogram(values));
  }

  // ── A régua externa, partido a partido ────────────────────────────────────
  // É a tabela que decide. Um índice cuja ordenação não reconhece PSOL, PT, PL e
  // NOVO não está medindo ideologia, esteja como estiver a correlação.
  const byParty = new Map<string, number[]>();
  for (const a of agents) {
    const v = a.position.economic.value;
    if (v === null || !a.partyAcronym) continue;
    const list = byParty.get(a.partyAcronym) ?? [];
    list.push(v);
    byParty.set(a.partyAcronym, list);
  }

  if (byParty.size > 0) {
    console.log("\n  Eixo econômico por partido, contra as duas âncoras:");
    console.log("    partido        n   Votto   Bolo    BLS   Δposto");
    const rows = [...byParty.entries()]
      .map(([acronym, values]) => ({
        acronym,
        n: values.length,
        ours: values.reduce((s, v) => s + v, 0) / values.length,
        ...anchorsFor(acronym),
      }))
      .sort((a, b) => a.ours - b.ours);

    // Δposto: quantas posições o partido se move entre a nossa ordenação e a da
    // âncora. É onde um erro individual aparece, mesmo quando a correlação
    // global está boa — CIDADANIA e SOLIDARIEDADE foram os dois que a pesquisa
    // mediu fora do lugar.
    const anchored = rows.filter((r) => r.bolognesi !== null || r.bls !== null);
    const anchorOf = (r: (typeof rows)[number]) => r.bolognesi ?? (r.bls as number);
    const ourRank = new Map(anchored.map((r, i) => [r.acronym, i]));
    const anchorRank = new Map(
      [...anchored].sort((a, b) => anchorOf(a) - anchorOf(b)).map((r, i) => [r.acronym, i]),
    );

    for (const r of rows) {
      const hasAnchor = r.bolognesi !== null || r.bls !== null;
      const shift = (ourRank.get(r.acronym) ?? 0) - (anchorRank.get(r.acronym) ?? 0);
      const delta = hasAnchor ? String(shift).padStart(4) : "   —";
      const flag = hasAnchor && Math.abs(shift) >= 4 ? "  ⚠" : "";
      const show = (v: number | null) => (v === null ? "—" : (v * 100).toFixed(0)).padStart(5);
      console.log(
        `    ${r.acronym.padEnd(14)}${String(r.n).padStart(3)} ` +
          `${r.ours.toFixed(0).padStart(6)}  ${show(r.bolognesi)}  ${show(r.bls)}  ${delta}${flag}`,
      );
    }
  }

  // ── Partidos, já encolhidos ───────────────────────────────────────────────
  if (parties.length > 0) {
    console.log("\n  Partidos (média encolhida · média observada · confiabilidade · dispersão):");
    for (const p of [...parties].sort(
      (a, b) => (a.economic?.value ?? 0) - (b.economic?.value ?? 0),
    )) {
      const e = p.economic;
      if (!e) continue;
      console.log(
        `    ${(p.acronym ?? "?").padEnd(14)} ` +
          `${String(e.value).padStart(5)}  ${String(e.observed).padStart(5)}  ` +
          `B=${e.reliability.toFixed(2)}  ψ=${String(e.dispersion).padStart(3)}  ` +
          `n=${String(e.members).padStart(3)}  ` +
          `coesão=${p.cohesion === null ? "—" : `${p.cohesion}%`}`,
      );
    }
  }

  // ── Faixas: quantas passariam ─────────────────────────────────────────────
  // A faixa continua desmontada, mas o número que decide quando ela pode voltar
  // é este: com quantos agentes o intervalo de 95% cabe inteiro dentro de uma
  // faixa. Enquanto for uma minoria, publicar faixa é publicar ruído com nome.
  const validated = houses.some((h) => !h.blocked);
  let separable = 0;
  let withReading = 0;
  for (const a of agents) {
    if (a.position.economic.value === null) continue;
    withReading++;
    if (bandGate(a.position.economic, validated).band !== null) separable++;
  }
  if (withReading > 0) {
    const pct = ((separable / withReading) * 100).toFixed(0);
    console.log(
      `\n  Faixas: ${separable} de ${withReading} agentes (${pct}%) têm intervalo de 95% ` +
        "dentro de uma única faixa." +
        (separable / withReading < 0.6
          ? "\n    ⚠ Minoria. Uma faixa publicada agora seria decidida por ruído na maior parte dos casos."
          : ""),
    );
  }

  // ── Saúde das tags ────────────────────────────────────────────────────────
  console.log(
    `\n  Classificação: ${(legacyShare * 100).toFixed(0)}% dos itens usados ainda vêm do formato antigo` +
      (legacyShare > 0.5
        ? "\n    ⚠ Maioria. Essas tags fundem direção e magnitude e não têm confiança medida." +
          "\n      Rode `npm run summarize` para reclassificar no formato 2."
        : ""),
  );

  // ── Governismo, que é publicável esteja o resto como estiver ──────────────
  const gov = agents
    .filter((a): a is AgentScore & { governismo: number } => a.governismo !== null)
    .sort((a, b) => b.governismo - a.governismo);
  if (gov.length > 0) {
    const show = (rows: typeof gov) =>
      rows
        .map(
          (r) =>
            `      ${String(r.governismo).padStart(3)}%  ${r.name.padEnd(28)} ${r.partyAcronym ?? ""}`,
        )
        .join("\n");
    console.log(`\n  Governismo — ${gov.length} agentes medidos:`);
    console.log(show(gov.slice(0, 5)));
    console.log("      ...");
    console.log(show(gov.slice(-5)));
  } else {
    console.log(
      "\n  ⚠ Governismo não medido para ninguém: a orientação do bloco Governo não foi importada." +
        "\n    Sem ela o teste de falseamento não roda, e sem o teste nada é publicado." +
        "\n    Rode `npm run sync camara:votes -- --days 365`.",
    );
  }

  if (dryRun) console.log("\n  (--dry: nada foi gravado)");
  else console.log("\n✓ Posicionamento atualizado.");

  await db.$disconnect();
}

void main().catch(async (err) => {
  console.error("Falha:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
