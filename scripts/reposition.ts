/**
 * Recalcular o índice de posicionamento, e mostrar se ele pode ser publicado.
 *
 *   npm run reposition                      # aplica e grava
 *   npm run reposition -- --dry             # só mede, não grava
 *   npm run reposition -- --dry --weights=raw     # mede sem o desconto de contaminação
 *   npm run reposition -- --dry --weights=clean --max-contamination=0.4
 *                                           # mede só sobre os itens que a coalizão não conduziu
 *   npm run reposition -- --dry --weights=clean --max-contamination=0.4 --min-effective-items=2
 *                                           # ...e afrouxa o piso por agente, para a ordenação
 *                                           #    partidária poder ser medida sobre poucos itens
 *   npm run reposition -- --dry --estimator=pca
 *                                           # direção e peso vindos da matriz de votos, com as
 *                                           #    tags só orientando a ponta do eixo
 *   npm run reposition -- --dry --estimator=pca --residual=off
 *                                           # ...sem residualizar o governismo, para a porta 2
 *                                           #    voltar a significar algo
 *   npm run reposition -- --dry --estimator=pca --items=substantive
 *                                           # ...admitindo so votacao de MERITO, pela descricao
 *                                           #    (requer `npm run redescribe` antes)
 *   npm run reposition -- --dry --estimator=pca --score=residual
 *                                           # ...descontando o governismo tambem dos escores,
 *                                           #    e nao so das cargas
 *
 * Em produção nada disso roda direto — não há toolchain Node na instância:
 *
 *   docker compose --env-file .env.production -f docker-compose.prod.yml \
 *     run --rm migrate npm run reposition -- --dry --weights=clean
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
  type Estimator,
} from "@/lib/integration/positioning";
import {
  bandGate,
  CLEAN_MAX_CONTAMINATION,
  DEFAULT_WEIGHT_MODE,
  MIN_EFFECTIVE_ITEMS,
  POSITIONING_AXES,

  type AxisKey,
  type WeightMode,
} from "@/lib/indexes/positioning";
import {
  anchorsFor,
  MAX_GOVERNMENT_CORRELATION,
  MIN_ANCHOR_CORRELATION,
  MIN_SIGNAL_RATIO,
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

/**
 * Ler `--weights=<modo>`.
 *
 * Recusa um valor desconhecido em vez de cair no padrão: um typo que
 * silenciosamente rodasse a metodologia em vigor produziria dois relatórios
 * idênticos e a conclusão de que o desconto não muda nada — que é exatamente a
 * pergunta do experimento.
 */
function parseWeights(argv: string[]): WeightMode {
  const arg = argv.find((a) => a.startsWith("--weights"));
  if (!arg) return DEFAULT_WEIGHT_MODE;
  const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : "";
  if (value === "discount" || value === "raw" || value === "clean") return value;
  console.error(
    `Valor inválido para --weights: "${value}". Use "discount" (metodologia em vigor), ` +
      `"raw" (sem o desconto de contaminação) ou "clean" (só itens abaixo do teto).`,
  );
  process.exit(1);
}

/** Ler `--max-contamination=<0..1>`. Recusa fora da faixa, pela mesma razão. */
function parseMaxContamination(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--max-contamination"));
  if (!arg) return CLEAN_MAX_CONTAMINATION;
  const n = Number(arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : NaN);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  console.error("Valor inválido para --max-contamination: use um número entre 0 e 1.");
  process.exit(1);
}

/** Ler `--estimator=<tags|pca>`. Recusa desconhecido, pela mesma razão. */
function parseEstimator(argv: string[]): Estimator {
  const arg = argv.find((a) => a.startsWith("--estimator"));
  if (!arg) return "tags";
  const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : "";
  if (value === "tags" || value === "pca") return value;
  console.error(
    `Valor inválido para --estimator: "${value}". Use "tags" (metodologia em vigor) ou "pca".`,
  );
  process.exit(1);
}

/**
 * Ler `--items=all|policy`.
 *
 * `policy` descarta requerimentos e afins da matriz — ver
 * `src/lib/domain/bill-types.ts`. Faz diferença só sob `--estimator=pca`, porque
 * o estimador de tags nunca viu esses itens: a IA já os marcava `scoreable:
 * false`, e foi soltar o filtro de tag que os trouxe para dentro.
 */
function parseItems(argv: string[]): "all" | "policy" | "substantive" {
  const arg = argv.find((a) => a.startsWith("--items"));
  if (!arg) return "all";
  const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : "";
  if (value === "all" || value === "policy" || value === "substantive") return value;
  console.error(
    `Valor inválido para --items: "${value}". Use "all", "policy" (identificador) ` +
      `ou "substantive" (descrição da votação).`,
  );
  process.exit(1);
}

/**
 * Ler `--score=raw|residual`.
 *
 * `residual` desconta o governismo dos escores, além das cargas. É medição: a
 * pontuação usa votos crus de propósito, para o eixo continuar sendo média de
 * ±1 e a escala não precisar de constante — e o preço medido é que o governismo
 * volta por ali (r = −0,45 na Câmara).
 */
function parseScore(argv: string[]): boolean {
  const arg = argv.find((a) => a.startsWith("--score"));
  if (!arg) return false;
  const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : "";
  if (value === "raw") return false;
  if (value === "residual") return true;
  console.error(`Valor inválido para --score: "${value}". Use "raw" ou "residual".`);
  process.exit(1);
}

/** Ler `--residual=on|off`. Só tem efeito sob `--estimator=pca`. */
function parseResidual(argv: string[]): boolean {
  const arg = argv.find((a) => a.startsWith("--residual"));
  if (!arg) return true;
  const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : "";
  if (value === "on") return true;
  if (value === "off") return false;
  console.error(`Valor inválido para --residual: "${value}". Use "on" ou "off".`);
  process.exit(1);
}

/**
 * Ler `--min-effective-items=<n>`. Zero é recusado junto com o resto: sem piso
 * nenhum, um único item classificado devolveria ±100 e a média partidária
 * passaria a ser sobre esses extremos.
 */
function parseMinEffectiveItems(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--min-effective-items"));
  if (!arg) return MIN_EFFECTIVE_ITEMS;
  const n = Number(arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : NaN);
  if (Number.isFinite(n) && n > 0) return n;
  console.error("Valor inválido para --min-effective-items: use um número maior que 0.");
  process.exit(1);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry");
  const weights = parseWeights(process.argv);
  const maxContamination = parseMaxContamination(process.argv);
  const minEffectiveItems = parseMinEffectiveItems(process.argv);
  const estimator = parseEstimator(process.argv);
  const residualise = parseResidual(process.argv);
  const scoreResidual = parseScore(process.argv);
  const itemFilter = parseItems(process.argv);
  const loweredFloor = minEffectiveItems !== MIN_EFFECTIVE_ITEMS;

  if (
    weights !== DEFAULT_WEIGHT_MODE ||
    loweredFloor ||
    estimator !== "tags" ||
    scoreResidual ||
    itemFilter !== "all"
  ) {
    const lines: string[] = [];
    if (estimator === "pca")
      lines.push(
        "direção e peso vêm do componente principal da matriz de votos, com as tags só orientando" +
          (residualise ? "; colunas residualizadas contra o governismo" : "; SEM residualizar") +
          (scoreResidual ? "; governismo descontado TAMBÉM dos escores" : "") +
          (itemFilter === "policy" ? "; só identificador de mérito na matriz" : "") +
          (itemFilter === "substantive" ? "; só votação de mérito na matriz, pela descrição" : ""),
      );
    if (weights === "raw") lines.push("o fator (1 − contaminação) está desligado");
    if (weights === "clean")
      lines.push(`só entram itens com contaminação ≤ ${maxContamination}, com peso cheio`);
    if (loweredFloor)
      lines.push(
        `o piso por eixo é ${minEffectiveItems} em vez de ${MIN_EFFECTIVE_ITEMS} — ` +
          "leitura individual sobre poucos itens, só a ordenação partidária significa algo",
      );
    console.log(
      `\n  ⚗ MEDIÇÃO — ${lines.join("; ")}.` +
        "\n    Não é uma metodologia alternativa, é a ausência (ou a caricatura) de um controle." +
        "\n    Nada aqui é publicável, e a gravação é recusada mesmo sem --dry.\n",
    );
  }

  const { agents, parties, houses, legacyShare } = await recomputePositioningIndex({
    dryRun,
    weights,
    maxContamination,
    minEffectiveItems,
    estimator,
    residualise,
    scoreResidual,
    itemFilter,
  });

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
    // `items` é o que o modo de fato usa e `itemsControlled` é onde a
    // contaminação pôde ser medida. Em `clean` os dois divergem, e imprimi-los
    // colados sem dizer isso lia como defeito ("35 itens (217 com controle)").
    const scope =
      h.items === h.itemsControlled
        ? `${h.itemsControlled} com contaminação medida`
        : `usados de ${h.itemsControlled} com contaminação medida`;
    console.log(
      `    ${mark} ${h.house.padEnd(7)} ${String(h.items).padStart(4)} itens ` +
        `(${scope}) · ${h.agentsScored}/${h.agents} agentes com leitura`,
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
      // Os dois números lado a lado, sempre: o piso de bancada não pode ser um
      // lugar onde a conclusão muda sem que dê para ver.
      const all =
        h.anchorCorrelationAll !== null && h.anchorCorrelationAll !== h.anchorCorrelation
          ? ` · sem pesar pela bancada ρ=${h.anchorCorrelationAll.toFixed(2)}`
          : "";
      console.log(
        `        âncora BLS ρ=${h.anchorCorrelation.toFixed(2)} ` +
          `(mín ${MIN_ANCHOR_CORRELATION}) · cobertura ${(h.anchorCoverage * 100).toFixed(0)}% das cadeiras${all}${flag}`,
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
    // A distribuição decide o teto do modo `clean`: só há subconjunto limpo
    // enquanto couber MIN_HOUSE_ITEMS embaixo dele.
    if (h.droppedNonPolicy > 0) {
      console.log(
        `        ${h.droppedNonPolicy} itens fora por serem rito e não mérito ` +
          "(requerimento, preferência, redação final)",
      );
    }
    // A identificação que justificou o backfill de 2019 só existe se o corpus
    // atravessar a troca de presidente NA PRÁTICA — ver `HouseReport.itemsByTerm`.
    const terms = Object.entries(h.itemsByTerm).sort(([a], [b]) => a.localeCompare(b));
    if (terms.length > 0) {
      const total = terms.reduce((sum, [, n]) => sum + n, 0);
      const cells = terms
        .map(([term, n]) => `${term}: ${n} (${Math.round((n / Math.max(1, total)) * 100)}%)`)
        .join("  ");
      const single = terms.filter(([t]) => t !== "sem mandato").length < 2;
      console.log(
        `        mandatos — ${cells}` +
          (single ? "  ⚠ um mandato só: ideologia e governismo não se separam" : ""),
      );
    }
    if (h.contaminationBands.length > 0) {
      const cells = h.contaminationBands
        .map((b) => `≤${b.maxContamination.toFixed(1)}: ${b.items}`)
        .join("  ");
      console.log(
        `        contaminação — ${cells}` +
          (h.itemsUncontrolled > 0 ? `  · sem medida: ${h.itemsUncontrolled}` : ""),
      );
    }
    if (h.recovery) {
      // A concordância com as tags é DIAGNÓSTICO e não orienta nada. Ela mede a
      // qualidade da classificação: perto de 0, a IA etiquetou ruído.
      for (const axis of ["economic", "social"] as const) {
        const r = h.recovery[axis];
        // "17% da variância" não é afirmação sozinha: o piso de ruído depende
        // do formato da matriz. A razão contra Marchenko–Pastur é o número.
        const ratioFlag = r.signalRatio < MIN_SIGNAL_RATIO ? "  ⚠ ≈ ruído" : "";
        const tagFlag = Math.abs(r.tagAgreement) < 0.3 ? "  ⚠ tags ≈ ruído" : "";
        console.log(
          `        ${axis === "economic" ? "PC1 econômico" : "PC2 social   "} — ` +
            `${(r.explained * 100).toFixed(0)}% da variância contra piso de ruído de ` +
            `${(r.noiseFloor * 100).toFixed(1)}% = ${r.signalRatio.toFixed(2)}× ` +
            `(mín ${MIN_SIGNAL_RATIO}×)${ratioFlag}`,
        );
        console.log(
          `          tags concordam ${r.tagAgreement >= 0 ? "+" : ""}${r.tagAgreement.toFixed(2)} ` +
            `sobre ${r.tagged} itens etiquetados${tagFlag}`,
        );
        const o = h.orientation?.[axis];
        if (o) {
          console.log(
            o.left.length > 0
              ? `          pontas nomeadas por ${o.left.join(", ")} ↔ ${o.right.join(", ")}`
              : axis === "economic"
                ? "          ⚠ sem âncora suficiente para nomear as pontas — eixo não orientado"
                : "          sem régua externa para o eixo social — número não publicado (só a figura)",
          );
        }
      }
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

  const parts: string[] = [];
  if (estimator !== "tags")
    parts.push(
      `estimador "${estimator}"${residualise ? "" : " sem resíduo"}` +
        (scoreResidual ? " · escores residualizados" : ""),
    );
  if (weights !== DEFAULT_WEIGHT_MODE)
    parts.push(`pesos "${weights}"${weights === "clean" ? ` ≤${maxContamination}` : ""}`);
  if (loweredFloor) parts.push(`piso ${minEffectiveItems}`);
  if (itemFilter !== "all") parts.push(`itens "${itemFilter}"`);
  const stamp = parts.length > 0 ? ` · ${parts.join(" · ")} (medição)` : "";
  if (dryRun) console.log(`\n  (--dry: nada foi gravado${stamp})`);
  else console.log("\n✓ Posicionamento atualizado.");

  await db.$disconnect();
}

void main().catch(async (err) => {
  console.error("Falha:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
