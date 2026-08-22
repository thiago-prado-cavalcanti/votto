import "../load-env";
const jar = new Map<string, string>();
// `cookies()` do Next, simulado.
(globalThis as Record<string, unknown>).__cookieJar = jar;

import { seal } from "@/lib/crypto/box";
import { encryptCpf } from "@/lib/crypto/cpf";

let fails = 0;
const check = (l: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${l}${extra ? ` — ${extra}` : ""}`);
  if (!ok) fails++;
};

const CPF = "07119185705";              // o CPF real já validado, 11 dígitos
const BIRTH = "1976-01-22";
const subject = {
  cpfEncrypted: encryptCpf(CPF),
  birthDateEncrypted: seal(BIRTH),
  birthYear: 1976,
};

async function main() {
  const m = await import("@/lib/auth/vote-challenge");

  console.log("\n[1] Desafio emitido");
  const c = await m.issueChallenge("usr_teste", true);
  check("3 posições distintas", new Set(c.positions).size === 3, c.positions.join(","));
  check("posições dentro de 1..11", c.positions.every((p) => p >= 1 && p <= 11), c.positions.join(","));
  check("posições em ordem crescente", c.positions[0] < c.positions[1] && c.positions[1] < c.positions[2]);
  check("campo é dia, mês ou ano", ["day","month","year"].includes(c.field), c.field);

  const answerFor = (ch: typeof c) => ({
    cpfDigits: ch.positions.map((p) => CPF[p - 1]).join(""),
    dateDigits: ch.field === "day" ? "22" : ch.field === "month" ? "01" : "76",
  });

  console.log("\n[2] Resposta certa");
  const good = await m.verifyChallenge("usr_teste", subject, answerFor(c));
  check("aceita", good.status === "ok", good.status);

  console.log("\n[3] Desafio de outro cidadão não serve");
  await m.issueChallenge("usr_teste", true);
  const alheio = await m.verifyChallenge("usr_outro", subject, { cpfDigits: "000", dateDigits: "00" });
  check("recusado como expirado", alheio.status === "expired", alheio.status);

  console.log("\n[4] Tentativas erradas");
  const c2 = await m.issueChallenge("usr_teste", true);
  const r1 = await m.verifyChallenge("usr_teste", subject, { cpfDigits: "999", dateDigits: "99" });
  check("1ª errada -> restam 2", r1.status === "wrong" && r1.remaining === 2, JSON.stringify(r1));
  const r2 = await m.verifyChallenge("usr_teste", subject, { cpfDigits: "999", dateDigits: "99" });
  check("2ª errada -> resta 1", r2.status === "wrong" && r2.remaining === 1, JSON.stringify(r2));
  const r3 = await m.verifyChallenge("usr_teste", subject, { cpfDigits: "999", dateDigits: "99" });
  check("3ª errada -> nova combinação", r3.status === "reissued", r3.status);
  if (r3.status === "reissued") {
    check("a nova combinação é diferente da anterior",
      r3.challenge.positions.join() !== c2.positions.join() || r3.challenge.field !== c2.field);
    console.log("\n[5] A resposta antiga não vale na combinação nova");
    const stale = await m.verifyChallenge("usr_teste", subject, answerFor(c2));
    check("recusa resposta do desafio anterior", stale.status !== "ok", stale.status);
  }

  console.log("\n[6] Esgotar a sessão");
  await m.issueChallenge("usr_teste", true, 2); // já é o 3º desta sessão
  let last: Awaited<ReturnType<typeof m.verifyChallenge>> | null = null;
  for (let i = 0; i < 3; i++) {
    last = await m.verifyChallenge("usr_teste", subject, { cpfDigits: "999", dateDigits: "99" });
  }
  check(
    "após o 3º desafio queimado -> exige novo login",
    last?.status === "exhausted",
    last?.status ?? "sem resultado",
  );

  console.log("\n[7] Conta antiga, sem data cifrada, só pode ser desafiada pelo ano");
  for (let i = 0; i < 6; i++) {
    const legado = await m.issueChallenge("usr_legado", false);
    if (legado.field !== "year") { check("campo sempre 'year'", false, legado.field); break; }
  }
  check("campo sempre 'year' em 6 sorteios", true);
  const legado = await m.issueChallenge("usr_legado", false);
  const okLegado = await m.verifyChallenge("usr_legado",
    { ...subject, birthDateEncrypted: null },
    { cpfDigits: legado.positions.map((p) => CPF[p - 1]).join(""), dateDigits: "76" });
  check("responde pelo ano em claro", okLegado.status === "ok", okLegado.status);

  process.exit(fails === 0 ? 0 : 1);
}
main();
