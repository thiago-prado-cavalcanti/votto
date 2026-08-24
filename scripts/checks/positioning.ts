/**
 * Checagem da matemática do índice de posicionamento (CLAUDE.md §3.2).
 *
 *   npm run check:positioning
 *
 * Sem banco e sem rede: só as funções puras, contra casos construídos à mão em
 * que a resposta certa é conhecida de antemão. Gêmeo de `check:identity` e
 * `check:vote`, e existe pelo mesmo motivo — este índice publica um número ao
 * lado do nome de uma pessoa real, e as propriedades que o tornam defensável são
 * propriedades que dá para afirmar num teste:
 *
 *   - cobertura insuficiente devolve `null`, **nunca 0** (zero é a coordenada de
 *     um centrista, e foi assim que partidos incontroversos foram parar no
 *     centro);
 *   - uma votação unânime pesa zero;
 *   - o encolhimento partidário nunca desloca uma bancada mais que um erro
 *     padrão da própria média (o limitador do problema Clemente);
 *   - a coesão usa o índice de concordância e não o de Rice, então abstenção em
 *     bloco não é lida como colapso.
 *
 * Um `✗` aqui é uma regressão numa promessa publicada, não um detalhe de
 * implementação.
 */
import {
  computePosition, discrimination, itemWeight, parseDimensions, bandGate,
  MIN_EFFECTIVE_ITEMS,
  type ScorableVote,
} from "@/lib/indexes/positioning";
import {
  recoverAxis,
  type RecoveryItem,
  type RecoveryVote,
} from "@/lib/indexes/recovery";
import { pool, betweenVariance, agreementIndex, excessCohesion, expectedRandomAgreement } from "@/lib/indexes/pooling";
import { spearman, pearson, anchorFor, stdDev, MIN_SPREAD_RATIO } from "@/lib/domain/anchors";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) { fails++; console.log(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name} ${extra}`);
};

console.log("\nDiscriminação");
ok("unânime = 0", discrimination({ yes: 470, no: 0, contamination: null }) === 0);
ok("90×10 ≈ 0,20", Math.abs(discrimination({ yes: 90, no: 10, contamination: null }) - 0.2) < 1e-9);
ok("meio a meio = 1", discrimination({ yes: 50, no: 50, contamination: null }) === 1);

console.log("\nPeso do item");
const tag = { direction: 1 as const, magnitude: 1, confidence: 1 };
ok("abaixo do corte de discriminação → 0", itemWeight(tag, { yes: 95, no: 5, contamination: 0 }) === 0);
ok("contaminação total → 0", itemWeight(tag, { yes: 50, no: 50, contamination: 1 }) === 0);
ok("contaminação desconhecida não zera", itemWeight(tag, { yes: 50, no: 50, contamination: null }) === 1);

// O modo de medição (`--weights=raw`) desliga o fator (1 − contaminação) e NADA
// mais. As três asserções abaixo são o contrato: o padrão não muda, o desconto
// some, e a discriminação continua valendo — uma votação unânime não separa
// ninguém, o que não tem relação nenhuma com a coalizão.
ok(
  "raw ignora a contaminação",
  itemWeight(tag, { yes: 50, no: 50, contamination: 1 }, "raw") === 1,
);
ok(
  "raw ainda descarta a votação unânime",
  itemWeight(tag, { yes: 95, no: 5, contamination: 0 }, "raw") === 0,
);
ok(
  "o padrão continua sendo o desconto",
  itemWeight(tag, { yes: 50, no: 50, contamination: 0.5 }) ===
    itemWeight(tag, { yes: 50, no: 50, contamination: 0.5 }, "discount"),
);

// `clean` corta em vez de escalar: abaixo do teto o item vale cheio, acima
// vale zero, e sem medida de contaminação vale zero — porque o modo inteiro é
// a afirmação "a coalizão não conduziu esta votação", e de um `null` não dá.
ok(
  "clean: abaixo do teto entra com peso cheio",
  itemWeight(tag, { yes: 50, no: 50, contamination: 0.2 }, "clean", 0.3) === 1,
);
ok(
  "clean: acima do teto sai",
  itemWeight(tag, { yes: 50, no: 50, contamination: 0.4 }, "clean", 0.3) === 0,
);
ok(
  "clean: no teto ainda entra",
  itemWeight(tag, { yes: 50, no: 50, contamination: 0.3 }, "clean", 0.3) === 1,
);
ok(
  "clean: sem medida de contaminação sai",
  itemWeight(tag, { yes: 50, no: 50, contamination: null }, "clean", 0.3) === 0,
);
ok(
  "clean: unânime continua valendo zero",
  itemWeight(tag, { yes: 95, no: 5, contamination: 0 }, "clean", 0.3) === 0,
);

console.log("\nRecuperação de dimensão");

// Uma casa sintética com estrutura conhecida: dois blocos de agentes que votam
// sempre em lados opostos, sobre itens perfeitamente divisivos. O componente
// tem de encontrar exatamente essa clivagem, e a única coisa que as tags fazem
// é decidir qual bloco fica no lado positivo.
function synthetic(nPerBloc: number, nItems: number, tagDirection: -1 | 0 | 1) {
  const votes: RecoveryVote[] = [];
  for (let j = 0; j < nItems; j++) {
    for (let i = 0; i < nPerBloc; i++) {
      votes.push({ agentId: `esq${i}`, themeId: `t${j}`, sign: -1 });
      votes.push({ agentId: `dir${i}`, themeId: `t${j}`, sign: 1 });
    }
  }
  const items: RecoveryItem[] = Array.from({ length: nItems }, (_, j) => ({
    themeId: `t${j}`,
    tagDirection,
  }));
  return { votes, items };
}

const syn = synthetic(20, 10, 1);
const rec = recoverAxis(syn.votes, syn.items, new Map(), { residualise: false });
ok("recupera todos os itens", rec.items.size === 10);
ok(
  "clivagem perfeita → peso cheio em todo item",
  [...rec.items.values()].every((it) => Math.abs(it.weight - 1) < 1e-6),
);
ok(
  "orienta pelas tags: +1 → direção +1",
  [...rec.items.values()].every((it) => it.direction === 1),
);
ok("concordância total com as tags", Math.abs(rec.diagnostics.tagAgreement - 1) < 1e-9);

// A ponta do eixo é decidida pelas tags e por nada mais: a mesma matriz, com as
// tags invertidas, tem de devolver o eixo espelhado. É o que torna o estimador
// robusto a tag ruim de item — só a soma dos sinais decide.
const flipped = recoverAxis(
  syn.votes,
  synthetic(20, 10, -1).items,
  new Map(),
  { residualise: false },
);
ok(
  "tags invertidas → eixo espelhado",
  [...flipped.items.values()].every((it) => it.direction === -1),
);

// Sem tag alguma o componente ainda existe, mas a ponta é arbitrária — e o
// diagnóstico tem de dizer isso em vez de publicar um sinal inventado.
const blind = recoverAxis(syn.votes, synthetic(20, 10, 0).items, new Map(), {
  residualise: false,
});
ok("sem tags → marcado como não orientado", blind.diagnostics.unoriented);

// Uma votação unânime não tem variância, então o componente lhe dá carga zero
// sem que ninguém precise reaplicar `discrimination()`.
const withUnanimous = synthetic(20, 10, 1);
for (let i = 0; i < 20; i++) {
  withUnanimous.votes.push({ agentId: `esq${i}`, themeId: "unan", sign: 1 });
  withUnanimous.votes.push({ agentId: `dir${i}`, themeId: "unan", sign: 1 });
}
withUnanimous.items.push({ themeId: "unan", tagDirection: 1 });
const withU = recoverAxis(withUnanimous.votes, withUnanimous.items, new Map(), {
  residualise: false,
});
ok(
  "votação unânime recebe carga zero sem reaplicar discriminação",
  (withU.items.get("unan")?.weight ?? 1) < 1e-9,
);

// Deflação: o segundo componente não pode ser o primeiro outra vez. Sobre uma
// matriz com uma clivagem só, o PC2 não tem o que carregar.
const pc2 = recoverAxis(syn.votes, syn.items, new Map(), {
  residualise: false,
  skipComponents: 1,
});
ok(
  "PC2 sobre clivagem única não carrega variância",
  pc2.diagnostics.explained < 1e-6 && rec.diagnostics.explained > 0.9,
);

// Residualizar contra o governismo tem de remover a clivagem que É o
// governismo. Aqui os dois blocos são exatamente governo e oposição, então o
// resíduo não deve sobrar nada — que é o teste de que o controle age.
const govMap = new Map<string, number>();
for (let i = 0; i < 20; i++) {
  govMap.set(`esq${i}`, 100);
  govMap.set(`dir${i}`, 0);
}
const resid = recoverAxis(syn.votes, syn.items, govMap, { residualise: true });
ok(
  "residualizar remove a clivagem governista",
  resid.diagnostics.explained < 1e-6,
  `(explicada ${(resid.diagnostics.explained * 100).toFixed(1)}%)`,
);
ok(
  "e sem residualizar ela continua lá",
  rec.diagnostics.explained > 0.9,
  `(explicada ${(rec.diagnostics.explained * 100).toFixed(1)}%)`,
);

console.log("\nFormato das tags");
const v1 = parseDimensions({ economic: -0.8, social: 0 });
ok("formato 1 vira legacy", v1.legacy && v1.scoreable && v1.economic?.direction === -1 && v1.social === null);
const v2 = parseDimensions({ version: 2, scoreable: true, reason: null,
  economic: { direction: 1, magnitude: 0.5, confidence: 0.9 }, social: null, salience: 0.3 });
ok("formato 2 lido", !v2.legacy && v2.economic?.magnitude === 0.5);
ok("excluído não pontua", parseDimensions({ version: 2, reason: "honorific", economic: { direction: 1 } }).scoreable === false);

console.log("\nPosição");
const mk = (i: number, value: "YES" | "NO", dir: -1 | 1, yes: number, no: number): ScorableVote => ({
  value, themeKey: `t${i}`, stats: { yes, no, contamination: 0 },
  dimensions: parseDimensions({ version: 2, scoreable: true, reason: null,
    economic: { direction: dir, magnitude: 1, confidence: 1 }, social: null, salience: 0.5 }),
});
// O tamanho das amostras vem do PISO, não de um número escrito à mão: assim a
// checagem continua testando o comportamento depois de o piso ser recalibrado
// (§11 diz que ele será), em vez de quebrar ou, pior, passar por acidente.
// Cada item aqui vale peso 1 (dividido ao meio, confiança e magnitude cheias).
const N = MIN_EFFECTIVE_ITEMS;

// Todas marcadas +1 e votadas SIM → +100.
const allYes = Array.from({ length: N }, (_, i) => mk(i, "YES", 1, 50, 50));
const p1 = computePosition(allYes);
ok("coerente = +100", p1.economic.value === 100, `(${p1.economic.value})`);
ok("eixo sem tag fica null", p1.social.value === null);

// A fronteira do piso, nos dois lados. É a asserção que mais importa do arquivo:
// um item abaixo do piso NÃO pode devolver 0, porque 0 é a coordenada do centro.
const atFloor = computePosition(Array.from({ length: N }, (_, i) => mk(i, "YES", 1, 50, 50)));
const belowFloor = computePosition(Array.from({ length: N - 1 }, (_, i) => mk(i, "YES", 1, 50, 50)));

// O piso de medição (`--min-effective-items`) sobrepõe MIN_EFFECTIVE_ITEMS e
// nada mais. Os mesmos votos que ficam sem leitura no piso da metodologia
// passam a ter uma quando o piso desce — que é a única coisa que o override
// precisa fazer para a ordenação partidária poder ser medida sobre poucos itens.
ok(
  "piso de medição libera o que o piso da metodologia barra",
  belowFloor.economic.value === null &&
    computePosition(
      Array.from({ length: N - 1 }, (_, i) => mk(i, "YES", 1, 50, 50)),
      { minEffectiveItems: N - 1 },
    ).economic.value !== null,
);
ok(
  "piso de medição não mexe no valor, só na admissão",
  computePosition(
    Array.from({ length: N }, (_, i) => mk(i, "YES", 1, 50, 50)),
    { minEffectiveItems: 1 },
  ).economic.value === atFloor.economic.value,
);
ok("exatamente no piso → publica", atFloor.economic.value !== null, `(${N} itens)`);
ok("um abaixo do piso → null, nunca 0", belowFloor.economic.value === null, `(${N - 1} itens)`);

// Metade e metade → 0, mas COM leitura (é medida, não ausência). São coisas
// diferentes que o tipo não distingue sozinho, daí a checagem de `items`.
const half = Math.floor(N / 2);
const split = [...Array.from({ length: half }, (_, i) => mk(i, "YES", 1, 50, 50)),
               ...Array.from({ length: N - half }, (_, i) => mk(i + half, "NO", 1, 50, 50))];
const p2 = computePosition(split);
ok("dividido ≈ 0 COM leitura", p2.economic.value !== null && Math.abs(p2.economic.value) <= 100 / N && p2.economic.items === N,
   `(${p2.economic.value}, ${p2.economic.items} itens)`);

// Só votações unânimes → null, por mais que sejam.
const unanimous = Array.from({ length: N * 4 }, (_, i) => mk(i, "YES", 1, 490, 10));
ok("só unânimes → null", computePosition(unanimous).economic.value === null, `(${N * 4} itens unânimes)`);

// Abstenção não move nada, nem entra na cobertura.
const withAbs = [...allYes, { ...mk(N + 1, "YES", -1, 50, 50), value: "ABSTENTION" as const }];
const pAbs = computePosition(withAbs);
ok("abstenção não move", pAbs.economic.value === 100 && pAbs.economic.items === N);

// Influência é detectada: um item destoando de N−1 concordantes.
const oneOff = [...Array.from({ length: N - 1 }, (_, i) => mk(i, "YES", 1, 50, 50)), mk(N, "NO", 1, 50, 50)];
const p3 = computePosition(oneOff);
ok("item mais influente identificado", p3.economic.influence !== null,
   `(${p3.economic.influence?.themeKey}, ${p3.economic.influence?.delta})`);

console.log("\nFaixa");
ok("sem validação, sem faixa", bandGate({ value: 80, standardError: 3, items: 40, effectiveItems: 40, influence: null }, false).blocked === "unvalidated");
ok("margem larga atravessa corte", bandGate({ value: 48, standardError: 12, items: 40, effectiveItems: 40, influence: null }, true).blocked === "separation");
ok("margem estreita passa", bandGate({ value: 80, standardError: 3, items: 40, effectiveItems: 40, influence: null }, true).band?.key === "direita");

console.log("\nAgregação partidária");
const members = (n: number, value: number, se: number) => Array.from({ length: n }, () => ({ value, standardError: se }));
const tau2 = 625; // τ = 25
const big = pool(members(90, -12, 40), 0, tau2)!;
const solo = pool(members(1, -80, 40), 0, tau2)!;
ok("bancada grande quase não encolhe", Math.abs(big.value - big.observed) <= 2, `(${big.observed} → ${big.value}, B=${big.reliability})`);
ok("bancada de um encolhe muito", Math.abs(solo.value) < Math.abs(solo.observed), `(${solo.observed} → ${solo.value}, B=${solo.reliability})`);
ok("translação limitada a 1 EP", Math.abs(solo.value - solo.observed) <= solo.standardError + 1, `(desloc ${Math.abs(solo.value - solo.observed)}, EP ${solo.standardError})`);
ok("média observada preservada", solo.observed === -80);
const spreadOut = pool([...members(5, -60, 20), ...members(5, 60, 20)], 0, tau2)!;
ok("bancada dividida tem dispersão alta", spreadOut.dispersion > 40, `(ψ=${spreadOut.dispersion})`);
ok("bancada unida tem dispersão baixa", pool(members(10, -30, 20), 0, tau2)!.dispersion < 10);

console.log("\nCoesão");
ok("AI: 10/10/100 = 0,750 (Rice diria 0)", Math.abs(agreementIndex({ yes: 10, no: 10, abstention: 100 })! - 0.75) < 1e-9);
ok("AI: 10/10/10 = 0", Math.abs(agreementIndex({ yes: 10, no: 10, abstention: 10 })!) < 1e-9);
ok("AI: unânime = 1", agreementIndex({ yes: 40, no: 0, abstention: 0 }) === 1);
// A tabela publicada é de Rice; AI = 0,75·Rice + 0,25 sem abstenções.
const fromRice = (r: number) => 0.75 * r + 0.25;
ok("acaso n=2: bate com Rice 0,500", Math.abs(expectedRandomAgreement(2) - fromRice(0.5)) < 0.005, `(AI ${expectedRandomAgreement(2).toFixed(3)})`);
ok("acaso n=90: bate com Rice 0,084", Math.abs(expectedRandomAgreement(90) - fromRice(0.084)) < 0.005, `(AI ${expectedRandomAgreement(90).toFixed(3)})`);
ok("acaso decresce com o tamanho", expectedRandomAgreement(2) > expectedRandomAgreement(10) && expectedRandomAgreement(10) > expectedRandomAgreement(90));
ok("bancada de um não recebe coesão", excessCohesion(1, 1) === null);
ok("coesão em excesso desconta o tamanho", (excessCohesion(0.9, 2) ?? 0) < (excessCohesion(0.9, 90) ?? 0));

console.log("\nÂncoras");
ok("PL à direita", (anchorFor("PL") ?? 0) > 0.7, `(${anchorFor("PL")})`);
ok("PSOL à esquerda", (anchorFor("PSOL") ?? 0) < -0.7, `(${anchorFor("PSOL")})`);
ok("UNIÃO agora tem âncora", anchorFor("União Brasil") !== null || anchorFor("UNIÃO") !== null, `(${anchorFor("UNIÃO")})`);
ok("PCdoB normaliza", anchorFor("PCdoB") !== null);
ok("spearman perfeito = 1", Math.abs(spearman([{a:1,b:1},{a:2,b:2},{a:3,b:3},{a:4,b:4}])! - 1) < 1e-9);
ok("spearman invertido = −1", Math.abs(spearman([{a:1,b:4},{a:2,b:3},{a:3,b:2},{a:4,b:1}])! + 1) < 1e-9);
ok("pearson perfeito = 1", Math.abs(pearson([{a:1,b:2},{a:2,b:4},{a:3,b:6}])! - 1) < 1e-9);
// Controle degenerado. `pearson` devolve `null` quando um dos lados não varia, e
// a porta de falseamento tratava `null` como aprovação — um controle que não
// consegue discriminar contava como controle que discriminou a nosso favor.
// Fixado aqui porque o defeito é invisível: ele não produz número errado, produz
// publicação sem teste.
ok("pearson sem variância = null (controle degenerado)", pearson([{a:1,b:5},{a:2,b:5},{a:3,b:5}]) === null);
ok("pearson com n<3 = null", pearson([{a:1,b:2},{a:2,b:4}]) === null);
ok("betweenVariance ≥ 0", betweenVariance(members(5, 10, 5), 25) >= 0);

// Porta de dispersão. O caso medido na Câmara em 23/08/2026: as médias
// partidárias iam de −9 a +6 enquanto a âncora ia de −87 a +76 — ordenação
// aproveitável, escala inexistente. Spearman marcava 0,63 e não via nada disso,
// porque é de posto. Estes dois casos fixam a diferença.
const flatOurs = [-9, -1, 0, 1, 4, 6];
const realAnchor = [-87, -69, -82, 16, 49, 51];
const flatRatio = stdDev(flatOurs)! / stdDev(realAnchor)!;
ok("eixo esmagado reprova a dispersão", flatRatio < MIN_SPREAD_RATIO, `(${(flatRatio * 100).toFixed(0)}%)`);
const wideRatio = stdDev([-80, -60, -70, 15, 45, 50])! / stdDev(realAnchor)!;
ok("eixo com escala passa", wideRatio >= MIN_SPREAD_RATIO, `(${(wideRatio * 100).toFixed(0)}%)`);
ok("dispersão de um ponto só = null", stdDev([5]) === null);

console.log(fails === 0 ? "\n✓ tudo passou\n" : `\n✗ ${fails} falha(s)\n`);
process.exit(fails === 0 ? 0 : 1);
