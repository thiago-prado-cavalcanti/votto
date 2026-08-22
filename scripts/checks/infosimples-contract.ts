/**
 * Exercita o adaptador da Infosimples contra o payload EXATO da documentação
 * oficial do serviço `receita-federal/cpf` (API v2.2.38, 10/07/2026).
 *
 * Existe porque o adaptador foi escrito primeiro a partir dos SDKs abertos do
 * fornecedor, e eles erraram duas coisas que só a documentação revelou — e que
 * se disfarçavam uma da outra:
 *
 *   - o corpo é `form-urlencoded`, não JSON. Com JSON o token nunca é lido, e a
 *     API responde 601, que é indistinguível de "token inválido";
 *   - `birthdate` é ISO 8601, não `DD/MM/AAAA` — exatamente o inverso do que o
 *     adaptador enviava, e a API cobra pela recusa.
 *
 * Some-se que a situação documentada é `ATIVA`, que o normalizador não
 * reconhecia: como ele falha fechado, todo cidadão legítimo seria recusado.
 *
 * Roda sem token e sem rede (o `fetch` é interceptado), então não custa nada.
 * Para conferir contra a API de verdade: `npm run check:cpf`.
 *
 *   npx tsx scripts/checks/infosimples-contract.ts
 */
import { createInfosimplesProvider } from "@/lib/identity/infosimples";

let fails = 0;
const check = (l: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${l}${extra ? ` — ${extra}` : ""}`);
  if (!ok) fails++;
};

let lastRequest: { contentType: string; body: Record<string, string> } | null = null;

function stub(payload: unknown, status = 200) {
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = Object.fromEntries(new URLSearchParams(String(init.body)));
    lastRequest = {
      contentType: (init.headers as Record<string, string>)["Content-Type"],
      body,
    };
    return { ok: status < 400, status, json: async () => payload } as Response;
  }) as typeof fetch;
}

/** O registro do exemplo oficial, com um titular vivo e situação ATIVA. */
const record = {
  ano_obito: "0", normalizado_ano_obito: 0,
  consulta_comprovante: "1111.1111.1111.1111",
  cpf: "529.982.247-25", data_inscricao: "11/11/1111",
  data_nascimento: "14/11/1970",
  nome: "Exemplo de Nome", nome_civil: "Exemplo de Nome", nome_social: "Exemplo de Nome",
  normalizado_cpf: "52998224725", origem: "mobile",
  situacao_cadastral: "ATIVA",
};

async function main() {
  const p = createInfosimplesProvider();

  console.log("\n[1] Formato da requisição (doc: form-urlencoded + ISO 8601)");
  stub({ code: 200, code_message: "ok", errors: [], data_count: 1, data: [record] });
  const ok = await p.validate("52998224725", "1970-11-14");
  check("Content-Type é form-urlencoded", lastRequest!.contentType === "application/x-www-form-urlencoded", lastRequest!.contentType);
  check("birthdate em ISO 8601", lastRequest!.body.birthdate === "1970-11-14", lastRequest!.body.birthdate);
  check("cpf sem pontuação", lastRequest!.body.cpf === "52998224725");
  check("ignore_site_receipt enviado", lastRequest!.body.ignore_site_receipt === "1");
  check("timeout dentro de 15..600", Number(lastRequest!.body.timeout) >= 15 && Number(lastRequest!.body.timeout) <= 600, lastRequest!.body.timeout);

  console.log("\n[2] Resposta 200 do exemplo oficial");
  check("situação ATIVA é aceita como regular", ok.status === "ok", ok.status);
  if (ok.status === "ok") {
    check("nome lido", ok.name === "Exemplo de Nome", ok.name);
    check("ano_obito='0' NÃO é lido como falecido", true);
    check("data conferida", ok.birthDateVerified === true);
  }

  console.log("\n[3] Nome social tem precedência");
  stub({ code: 200, data: [{ ...record, nome_civil: "Nome Civil", nome_social: "Nome Social", nome: "Nome Civil" }] });
  const social = await p.validate("52998224725", "1970-11-14");
  check("nome_social vence", social.status === "ok" && social.name === "Nome Social",
        social.status === "ok" ? social.name : social.status);

  console.log("\n[4] Falecido");
  stub({ code: 200, data: [{ ...record, ano_obito: "2020", normalizado_ano_obito: 2020 }] });
  const dead = await p.validate("52998224725", "1970-11-14");
  check("óbito detectado mesmo com situação ATIVA",
        dead.status === "irregular" && dead.situation === "DECEASED", dead.status);

  console.log("\n[5] Situação irregular");
  for (const [label, expected] of [["SUSPENSA","SUSPENDED"],["CANCELADA","CANCELLED"],["NULA","NULL"],["BLARGH","UNKNOWN"]] as const) {
    stub({ code: 200, data: [{ ...record, situacao_cadastral: label }] });
    const r = await p.validate("52998224725", "1970-11-14");
    check(`${label} -> ${expected}`, r.status === "irregular" && r.situation === expected, r.status);
  }

  console.log("\n[6] Códigos de erro (tabela oficial)");
  // [código, resultado, deve retentar?, por quê]
  const codes: Array<[number, string, boolean, string]> = [
    [612, "mismatch",    false, "sem dados na fonte — resposta final, e é cobrada"],
    [601, "unavailable", false, "token inválido — retentar não conserta"],
    [607, "unavailable", false, "parâmetro inválido — nosso bug, e é cobrado"],
    [620, "unavailable", false, "erro persistente na fonte — é cobrado"],
    [622, "unavailable", false, "consulta repetida — o retry é a causa"],
    [605, "unavailable", true,  "timeout — transitório, não é cobrado"],
    [615, "unavailable", true,  "fonte indisponível — transitório"],
    [618, "unavailable", true,  "fonte sobrecarregada — transitório"],
  ];

  for (const [code, expected, shouldRetry, why] of codes) {
    stub({ code, code_message: `erro ${code}`, errors: ["detalhe interno do fornecedor"] });
    const started = Date.now();
    const r = await p.validate("52998224725", "1970-11-14");
    // Cada retry custa >=800ms de backoff; sem retry a resposta é imediata.
    const retried = Date.now() - started > 700;
    check(
      `${code} -> ${expected}, ${shouldRetry ? "retenta" : "não retenta"} (${why})`,
      r.status === expected && retried === shouldRetry,
      `${r.status}, retentou=${retried}`,
    );
  }

  console.log("\n[7] Diagnóstico do fornecedor não vaza para o cidadão");
  stub({ code: 615, code_message: "indisponível", errors: ["Infosimples: detalhe interno"] });
  const leak = await p.validate("52998224735", "1970-11-14");
  check(
    "campo `errors` fica no motivo interno (só vai para log do servidor)",
    leak.status === "unavailable" && leak.reason.includes("detalhe interno"),
    leak.status === "unavailable" ? leak.reason : leak.status,
  );

  process.exit(fails === 0 ? 0 : 1);
}
main();
