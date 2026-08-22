/**
 * Exercises the configured CPF registry against the **live** API.
 *
 * Why this exists as its own script: the adapters were written from the
 * providers' open SDKs and exercised with a stubbed `fetch`, which proves the
 * parsing and nothing about the contract. Neither Serpro nor Infosimples
 * versions its API, and a silent shape change here does not break a page — it
 * turns real citizens into `unavailable` or, far worse, lets a rejection read as
 * an approval. `npm run check:sources` does this job for the Câmara and the
 * Senado; this does it for the registry.
 *
 * Costs money. Every run is one paid query (~R$0,24 on Infosimples), so it takes
 * the CPF as an argument instead of looping over fixtures.
 *
 * Usage:
 *   npm run check:cpf -- --cpf 529.982.247-25 --nascimento 14/11/1970
 *   npm run check:cpf -- --cpf 52998224725 --nascimento 1970-11-14
 *
 * The CPF is never printed, never logged and never written anywhere — the same
 * rule the adapters follow (src/lib/identity/validation.ts).
 */
// Must precede every import that reads `env` at module load.
import "./load-env";
import { env } from "@/lib/env";
import { cpfProvider, isCpfValidationConfigured, validateCpf } from "@/lib/identity/validation";
import { isValidCpf, normalizeCpf } from "@/lib/crypto/cpf";

/** Read `--flag value` from argv. */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Accept a birth date the way a Brazilian types it, like the sign-up form. */
function toIso(value: string): string | null {
  const br = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(value.trim());
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

/** Show a CPF as `529.***.**7-25` — enough to confirm you typed the right one. */
function masked(cpf: string): string {
  const c = normalizeCpf(cpf);
  return `${c.slice(0, 3)}.***.**${c.slice(8, 9)}-${c.slice(9)}`;
}

async function main(): Promise<void> {
  const rawCpf = arg("cpf");
  const rawDate = arg("nascimento") ?? arg("birthdate");

  console.log("\n── Verificação do registro de CPF ────────────────────────────");
  console.log(`  CPF_VALIDATION_PROVIDER : ${env.cpfValidation.provider}`);
  console.log(`  provedor efetivo        : ${cpfProvider().name}`);

  if (!isCpfValidationConfigured()) {
    // The most expensive misconfiguration in the project, so it gets said plainly.
    console.log("\n  ⚠  Nenhum registro real está configurado.");
    console.log("     O provedor `mock` aceita QUALQUER CPF estruturalmente válido,");
    console.log("     o que significa que a garantia de um voto por cidadão não");
    console.log("     existe. Em produção isso é silencioso — nada quebra.");
    console.log("\n     Para configurar (Infosimples, sem contrato e sem e-CNPJ):");
    console.log("       1. Pegue um token em");
    console.log("          https://api.infosimples.com/administracao/tokens");
    console.log("       2. No .env:");
    console.log('            CPF_VALIDATION_PROVIDER="infosimples"');
    console.log('            INFOSIMPLES_TOKEN="..."');
    console.log("       3. Rode este comando de novo.\n");
    process.exit(1);
  }

  if (!rawCpf || !rawDate) {
    console.log("\n  Informe um CPF e a data de nascimento correspondente:");
    console.log("    npm run check:cpf -- --cpf 000.000.000-00 --nascimento DD/MM/AAAA");
    console.log("\n  Use um CPF de verdade cuja data você conheça — é o único jeito");
    console.log("  de saber se o adaptador lê a resposta real corretamente.");
    console.log("  ⚠  Cada execução é uma consulta paga (~R$ 0,24).\n");
    process.exit(1);
  }

  if (!isValidCpf(rawCpf)) {
    // Caught locally, exactly as the sign-up flow does — no paid request made.
    console.log("\n  ✗ CPF inválido (dígito verificador). Nenhuma consulta foi feita.\n");
    process.exit(1);
  }

  const birthDate = toIso(rawDate);
  if (!birthDate) {
    console.log("\n  ✗ Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD.\n");
    process.exit(1);
  }

  console.log(`  CPF consultado          : ${masked(rawCpf)}`);
  console.log(`  Data enviada            : ${birthDate}`);
  console.log("\n  Consultando o registro oficial… (consulta paga)\n");

  const started = Date.now();
  const result = await validateCpf({ cpf: rawCpf, birthDate });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`  Resposta em ${elapsed}s → status "${result.status}"\n`);

  switch (result.status) {
    case "ok":
      console.log(`  ✓ CPF regular no registro oficial.`);
      console.log(`      nome devolvido      : ${result.name}`);
      console.log(`      nascimento          : ${result.birthDate.toISOString().slice(0, 10)}`);
      console.log(`      ano armazenado      : ${result.birthDate.getUTCFullYear()}`);
      console.log(`      data foi conferida  : ${result.birthDateVerified ? "sim" : "NÃO (modo consulta)"}`);
      console.log("\n  Confira se o nome bate com o titular. Se vier o nome de outra");
      console.log("  pessoa, o adaptador está lendo o campo errado da resposta.\n");
      break;

    case "mismatch":
      console.log("  ✗ O registro não confirmou este par CPF + data de nascimento.");
      console.log("    Se a data está certa, é sinal de que o adaptador está");
      console.log("    interpretando mal a resposta — investigue antes de subir.\n");
      break;

    case "irregular":
      console.log(`  ✗ CPF encontrado, mas em situação "${result.situation}".`);
      console.log(`    ${result.description}`);
      console.log("    O cadastro seria recusado.\n");
      break;

    case "underage":
      console.log(`  ✗ O registro recusou por idade (mínimo ${result.minimumAge} anos).\n`);
      break;

    case "malformed":
      console.log("  ✗ Recusado localmente antes da chamada.\n");
      break;

    case "unavailable":
      console.log("  ⚠ Registro indisponível — NÃO é rejeição do cidadão.");
      console.log(`    motivo: ${result.reason}`);
      console.log("\n    Causas comuns: token inválido ou sem saldo, portal da");
      console.log("    Receita fora do ar, ou mudança no formato da resposta.\n");
      break;
  }

  // `unavailable` is the one outcome that must not read as a pass in CI.
  process.exit(result.status === "unavailable" ? 1 : 0);
}

main().catch((err) => {
  console.error("\n  ✗ Falha inesperada:", err instanceof Error ? err.message : err);
  process.exit(1);
});
