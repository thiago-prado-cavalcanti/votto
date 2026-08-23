/**
 * Checagem da regra de concordância do índice de alinhamento (CLAUDE.md §3.1).
 *
 *   npm run check:alignment
 *
 * Sem banco e sem rede: só a função pura que decide quanto vale um par de votos
 * sobre o mesmo tema. É pouca coisa, e é o número de manchete da plataforma — o
 * que aparece na página de cada agente, em cada card, em cada embed e em cada
 * imagem compartilhada.
 *
 * A asserção que dá nome ao arquivo é a de que **duas abstenções não são
 * concordância**. A fórmula ingênua sobre `{-1, 0, 1}` dá 1,0 para elas, e o
 * defeito é silencioso das duas formas que importam: não quebra nada, e infla
 * justamente a leitura de quem menos se posicionou.
 */
import { pairAgreement } from "@/lib/indexes/alignment";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) {
    fails++;
    console.log(`  ✗ ${name} ${extra}`);
  } else console.log(`  ✓ ${name} ${extra}`);
};

console.log("\nPares que concordam");
ok("Sim × Sim = 1", pairAgreement("YES", "YES") === 1);
ok("Não × Não = 1", pairAgreement("NO", "NO") === 1);

console.log("\nPares que discordam");
ok("Sim × Não = 0", pairAgreement("YES", "NO") === 0);
ok("Não × Sim = 0", pairAgreement("NO", "YES") === 0);

console.log("\nUm dos dois se absteve — meia concordância, como em todo VAA");
ok("Sim × Neutro = ½", pairAgreement("YES", "ABSTENTION") === 0.5);
ok("Neutro × Não = ½", pairAgreement("ABSTENTION", "NO") === 0.5);

console.log("\nOs DOIS se abstiveram — o tema sai da conta");
ok(
  "Neutro × Neutro = null, e não 1",
  pairAgreement("ABSTENTION", "ABSTENTION") === null,
  "(a fórmula ingênua daria 1,0)",
);

console.log("\nSimetria — a ordem dos dois lados não pode importar");
const values = ["YES", "NO", "ABSTENTION"] as const;
let symmetric = true;
for (const a of values) {
  for (const b of values) {
    if (pairAgreement(a, b) !== pairAgreement(b, a)) symmetric = false;
  }
}
ok("f(a,b) === f(b,a) para os nove pares", symmetric);

console.log("\nFaixa — nenhum par pontua fora de 0..1");
let inRange = true;
for (const a of values) {
  for (const b of values) {
    const v = pairAgreement(a, b);
    if (v !== null && (v < 0 || v > 1)) inRange = false;
  }
}
ok("todo par vale null ou 0..1", inRange);

console.log(fails === 0 ? "\n✓ tudo passou\n" : `\n✗ ${fails} falha(s)\n`);
process.exit(fails === 0 ? 0 : 1);
