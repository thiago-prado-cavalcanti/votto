/**
 * Preencher `RollCall.description` no histórico já importado.
 *
 *   npm run redescribe                 # últimos 30 dias
 *   npm run redescribe -- --days 2600  # desde 2019, junto com o backfill de votos
 *   npm run redescribe -- --dry        # só conta, não grava
 *
 * Em produção, como todo script que toca o banco:
 *
 *   docker compose --env-file .env.production -f docker-compose.prod.yml \
 *     run --rm migrate npm run redescribe -- --days 2600
 *
 * Por que existe: a descrição é o único campo que separa MÉRITO de RITO, e a
 * distinção decide se a votação entra no índice de posicionamento. Ela sempre
 * veio na resposta de lista da Câmara; nós é que não a gravávamos. Como a coluna
 * é nova e as votações já estão importadas, o histórico precisa ser pedido de
 * volta — mas só as chamadas de LISTA, o que torna isto barato: dezenas de
 * requisições onde `syncVotes` custaria milhares.
 *
 * Gêmeo de `reauthor`: idempotente, interrompível, e só toca linha cuja descrição
 * ainda é NULL.
 */
import "./load-env";
import { db } from "@/lib/db";
import { repairDescriptions } from "@/lib/integration/camara";

function parseDays(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--days"));
  if (!arg) return 30;
  const raw = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[argv.indexOf(arg) + 1];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Valor inválido para --days: "${raw ?? ""}".`);
    process.exit(1);
  }
  return Math.floor(n);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry");
  const days = parseDays(process.argv);

  console.log(
    `▶ Descrições das votações da Câmara — janela ${days} dias` +
      (dryRun ? " (--dry: nada será gravado)" : ""),
  );

  const result = await repairDescriptions({
    days,
    dryRun,
    onProgress: ({ seen, upserted }) => {
      process.stdout.write(`\r   ${seen} votações vistas · ${upserted} descrições gravadas   `);
    },
  });

  console.log(
    `\n\n  ${result.itemsSeen} votações com descrição na fonte` +
      `\n  ${result.itemsUpserted} linhas preenchidas` +
      (dryRun ? "\n\n  (--dry: nada foi gravado)" : "\n\n✓ Pronto."),
  );
  console.log(
    "\n  Em seguida: `npm run reposition -- --dry --estimator=pca --items=substantive`",
  );

  await db.$disconnect();
}

void main().catch(async (err) => {
  console.error("Falha:", err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
