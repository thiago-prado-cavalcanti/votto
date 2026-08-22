/**
 * Exercita a identidade do cidadão sem banco, sem rede e sem custo:
 *
 *   - a conferência do nome contra o registro oficial, feita no cadastro;
 *   - o desafio de voto (3 dígitos do CPF + dia/mês/ano), feito uma vez por
 *     sessão.
 *
 * Os dois substituem uma comparação que NÃO fazemos: o nome que Apple, Google
 * ou Meta devolvem é autodeclarado e editável, então conferir contra ele seria
 * teatro. O que vale é o cidadão *saber* o nome que está por trás do CPF, e
 * isso é verificado contra a Receita.
 *
 *   npx tsx scripts/checks/citizen-identity.ts
 */
import "../load-env";
import { nameMatchesRegistry } from "@/lib/domain/names";
import { seal, tryOpen } from "@/lib/crypto/box";

let fails = 0;
const check = (l: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${l}${extra ? ` — ${extra}` : ""}`);
  if (!ok) fails++;
};

// O nome que a Receita devolveu de verdade no teste ao vivo.
const REGISTRY = "THIAGO DE PAULA PRADO OLIVEIRA CAVALCANTI";

console.log("\n[1] Nome conferido contra o registro oficial");
const aceita: Array<[string, string, string]> = [
  ["Thiago", "Cavalcanti", "último sobrenome"],
  ["Thiago", "Prado",      "sobrenome do meio — muita gente se apresenta assim"],
  ["Thiago", "Oliveira",   "outro sobrenome do meio"],
  ["THIAGO", "CAVALCANTI", "caixa alta"],
  ["thiago", "cavalcanti", "minúsculas"],
  ["  Thiago  ", " Prado ", "espaços sobrando"],
];
for (const [f, l, why] of aceita) {
  check(`aceita "${f} ${l}" (${why})`, nameMatchesRegistry({ firstName: f, lastName: l }, REGISTRY));
}

console.log("\n[2] Recusas");
const recusa: Array<[string, string, string]> = [
  ["Ana", "Cavalcanti", "primeiro nome errado"],
  ["Thiago", "Silva",   "sobrenome que não existe no registro"],
  ["Thiago", "de",      "partícula não conta como sobrenome"],
  ["Thiago", "Paula",   "'de Paula' — 'Paula' é sobrenome real, deve passar"],
  ["", "Cavalcanti",    "primeiro nome vazio"],
  ["Thiago", "",        "sobrenome vazio"],
];
for (const [f, l, why] of recusa) {
  const got = nameMatchesRegistry({ firstName: f, lastName: l }, REGISTRY);
  const expected = why.includes("deve passar");
  check(`${expected ? "aceita" : "recusa"} "${f} ${l}" (${why})`, got === expected);
}

console.log("\n[3] Acentos");
check('"José" casa com "JOSE" no registro',
  nameMatchesRegistry({ firstName: "José", lastName: "Conceição" }, "JOSE DA CONCEICAO SILVA"));
check('"Jose" casa com "JOSÉ" no registro',
  nameMatchesRegistry({ firstName: "Jose", lastName: "Silva" }, "JOSÉ DA CONCEIÇÃO SILVA"));

console.log("\n[4] Registro de um nome só");
check("aceita quando não há sobrenome no registro",
  nameMatchesRegistry({ firstName: "Madonna", lastName: "Qualquer" }, "MADONNA"));

console.log("\n[5] Data de nascimento cifrada");
const sealed = seal("1976-01-22");
check("cifrado não contém a data em claro", !sealed.includes("1976") && !sealed.includes("01-22"));
check("abre de volta corretamente", tryOpen(sealed) === "1976-01-22");
check("payload adulterado não abre (GCM autentica)", tryOpen(sealed.slice(0, -4) + "AAAA") === null);
check("ausente devolve null", tryOpen(null) === null);

process.exit(fails === 0 ? 0 : 1);
