/**
 * Checagem do mapa de áreas de política e da concordância por área.
 *
 *   npm run check:areas
 *
 * Sem banco e sem rede. Fixa três coisas que **já falharam uma vez** durante a
 * construção do mapa, e uma que falharia em silêncio no futuro:
 *
 *  1. **O Senado casa por caminho, nunca por rótulo.** As folhas ambientais dele
 *     se chamam `Proteção aos Animais`, `Mudanças Climáticas`, `Vegetação
 *     Nativa` — nenhuma contém a palavra "ambiente". Um casamento por nome
 *     perdeu 90 dos 125 projetos ambientais sem erro nenhum.
 *  2. **A ordem das regras do Senado é a especificação.** As fugas vêm antes dos
 *     padrões de macro-área; inverter é mandar `Agropecuária` para Economia em
 *     vez de Ambiente, e nada quebra.
 *  3. **Cobertura total dos 32 `codTema`.** Um código novo publicado pela Câmara
 *     tem de aparecer como `undefined` — "não conheço" — e não cair numa área
 *     por acidente. É a diferença entre uma lacuna visível e uma leitura errada.
 *  4. **A dupla abstenção sai da conta por área** exatamente como sai do total.
 */
import {
  CAMARA_AREA_BY_CODE,
  POLICY_AREAS,
  camaraArea,
  senadoArea,
  themeAreas,
  type PolicyArea,
} from "@/lib/domain/policy-areas";
import { areaAgreements } from "@/lib/indexes/area-alignment";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) {
    fails++;
    console.log(`  ✗ ${name} ${extra}`);
  } else console.log(`  ✓ ${name} ${extra}`);
};

console.log("\nAs áreas");
ok("são nove", POLICY_AREAS.length === 9);
ok(
  "as chaves são únicas",
  new Set(POLICY_AREAS.map((a) => a.key)).size === POLICY_AREAS.length,
);

console.log("\nCâmara — cobertura dos codTema");
// Os 32 códigos que a referência oficial publica em 24/08/2026. Se a Câmara
// acrescentar um, a asserção seguinte falha e alguém decide onde ele cai — que
// é o comportamento desejado.
const CODIGOS_OFICIAIS = [
  34, 35, 37, 39, 40, 41, 42, 43, 44, 46, 48, 51, 52, 53, 54, 55, 56, 57, 58, 60, 61, 62, 64, 66,
  67, 68, 70, 72, 74, 76, 85, 86,
];
ok(
  "os 32 códigos oficiais estão todos mapeados",
  CODIGOS_OFICIAIS.every((c) => camaraArea(c) !== undefined),
  `(${CODIGOS_OFICIAIS.filter((c) => camaraArea(c) === undefined).join(", ") || "nenhum faltando"})`,
);
ok(
  "o mapa não tem código a mais que a referência",
  Object.keys(CAMARA_AREA_BY_CODE).every((c) => CODIGOS_OFICIAIS.includes(Number(c))),
);
ok("código desconhecido devolve undefined, não uma área", camaraArea(999) === undefined);
ok("código nulo devolve undefined", camaraArea(null) === undefined);

console.log("\nCâmara — exclusões e desempate pela redação do rótulo");
ok("72 Homenagens é excluído (null, não undefined)", camaraArea(72) === null);
ok("53 Processo Legislativo é excluído", camaraArea(53) === null);
// O par que torna o mapa auditável: dois códigos de assunto vizinho e decisões
// contrárias, separadas por uma regra escrita — o que o rótulo oficial diz.
ok('67 "DIREITO e Defesa do Consumidor" → segurança', camaraArea(67) === "seguranca");
ok('74 "POLÍTICA, Partidos e Eleições" → gestão', camaraArea(74) === "gestao");

console.log("\nSenado — casa pelo caminho, nunca pelo rótulo");
// Estas três folhas são o caso que quebrou de verdade: não contêm a palavra
// "ambiente" em lugar nenhum e são ambientais.
for (const folha of ["Proteção aos Animais", "Mudanças Climáticas", "Vegetação Nativa"]) {
  ok(
    `"${folha}" pelo caminho → ambiente`,
    senadoArea(`Meio Ambiente / ${folha}`, folha) === "ambiente",
  );
  ok(`"${folha}" SEM caminho não vira ambiente por engano`, senadoArea(null, folha) === undefined);
}

console.log("\nSenado — a ordem das regras é a especificação");
// Cada uma destas foge da macro-área que a contém. Se as fugas passarem para
// depois dos padrões, todas caem no default e nada acusa.
const FUGAS: Array<[string, PolicyArea | null]> = [
  ["Economia e Desenvolvimento / Agropecuária e Abastecimento", "ambiente"],
  ["Economia e Desenvolvimento / Política Fundiária e Reforma Agrária", "ambiente"],
  ["Infraestrutura / Minas e Energia / Mineração", "ambiente"],
  ["Política Social / Saúde / Saneamento Básico", "infraestrutura"],
  ["Jurídico / Direito Eleitoral / Partidos Políticos", "gestao"],
  ["Jurídico / Direitos e Garantias / Direitos Individuais e Coletivos", "direitos"],
  ["Jurídico / Direito de Trânsito", "infraestrutura"],
  ["Jurídico / Processo / Processo Legislativo", null],
  ["Organização do Estado / Poder Judiciário", "seguranca"],
];
for (const [caminho, esperado] of FUGAS) {
  ok(`${caminho.split(" / ").pop()} → ${esperado ?? "excluído"}`, senadoArea(caminho) === esperado);
}

console.log("\nSenado — Política Social não tem padrão de macro");
// É 28% do acervo e atravessa cinco áreas: qualquer default despejaria saúde,
// escola e aposentadoria no mesmo balde.
const SOCIAL: Array<[string, PolicyArea]> = [
  ["Política Social / Saúde / Saúde Suplementar", "saude"],
  ["Política Social / Trabalho e Emprego / Jornada", "trabalho"],
  ["Política Social / Previdência Social / RGPS", "trabalho"],
  ["Política Social / Proteção Social / Assistência Social", "trabalho"],
  ["Política Social / Proteção Social / Mulheres", "direitos"],
  ["Política Social / Educação / Educação Básica", "educacao"],
  ["Política Social / Habitação", "infraestrutura"],
];
for (const [caminho, esperado] of SOCIAL) {
  ok(`${caminho.split(" / ").slice(1).join(" / ")} → ${esperado}`, senadoArea(caminho) === esperado);
}

console.log("\nMacro-áreas que descem inteiras");
ok("Infraestrutura → infraestrutura", senadoArea("Infraestrutura / Comunicações / Rádio e TV") === "infraestrutura");
ok("Administração Pública → gestão", senadoArea("Administração Pública / Servidores Públicos") === "gestao");
ok("Orçamento Público → economia", senadoArea("Orçamento Público / LOA") === "economia");
ok("Honorífico → excluído", senadoArea("Honorífico / Data Comemorativa") === null);
ok("caminho desconhecido → undefined", senadoArea("Alguma Coisa Nova / Folha") === undefined);

console.log("\nUm tema toca N áreas, não uma");
ok(
  "saneamento cai em saúde? não — a fuga o manda para infraestrutura",
  [...themeAreas([{ hierarchy: "Política Social / Saúde / Saneamento Básico", label: "x" }], "SENADO")].join() ===
    "infraestrutura",
);
ok(
  "dois rótulos, duas áreas",
  themeAreas(
    [
      { code: "56", label: "Saúde" },
      { code: "48", label: "Meio Ambiente" },
    ],
    "CAMARA",
  ).size === 2,
);
ok(
  "rótulo excluído não vira área",
  themeAreas([{ code: "72", label: "Homenagens" }], "CAMARA").size === 0,
);

console.log("\nConcordância por área");
const A = (n: number, a: "YES" | "NO" | "ABSTENTION", b: "YES" | "NO" | "ABSTENTION") =>
  Array.from({ length: n }, () => ({ areas: ["saude"] as PolicyArea[], a, b }));

const todas = areaAgreements([]);
ok("devolve as nove áreas mesmo sem dado", todas.length === 9);
ok("e todas com null, não zero", todas.every((r) => r.agreement === null && r.sharedThemes === 0));

const iguais = areaAgreements(A(6, "YES", "YES"));
ok("seis acordos = 100%", iguais.find((r) => r.area === "saude")?.agreement === 100);
ok("as outras oito continuam null", iguais.filter((r) => r.agreement === null).length === 8);

ok(
  "abaixo do piso é null, não uma leitura",
  areaAgreements(A(4, "YES", "YES")).find((r) => r.area === "saude")?.agreement === null,
);
// A regra do §3.1, agora por área: a dupla abstenção sai do numerador E do
// denominador. Se ela contasse 1,0 teríamos 100% sobre dois silêncios.
const comAbstencao = areaAgreements([...A(5, "YES", "YES"), ...A(5, "ABSTENTION", "ABSTENTION")]);
const saude = comAbstencao.find((r) => r.area === "saude");
ok("dupla abstenção não entra no denominador", saude?.sharedThemes === 5);
ok("e não inventa concordância", saude?.agreement === 100);
// Par misto mantém o 0,5 — um lado se posicionou e o outro não foi contra.
ok(
  "par misto vale meio",
  areaAgreements(A(6, "YES", "ABSTENTION")).find((r) => r.area === "saude")?.agreement === 50,
);
ok(
  "um tema em duas áreas conta nas duas",
  areaAgreements([{ areas: ["saude", "ambiente"], a: "YES", b: "NO" }]).filter(
    (r) => r.sharedThemes === 1,
  ).length === 2,
);

console.log(fails === 0 ? "\n✓ tudo passou\n" : `\n✗ ${fails} falha(s)\n`);
process.exit(fails === 0 ? 0 : 1);
