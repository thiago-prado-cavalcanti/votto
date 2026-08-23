/**
 * Devolve à fila da IA os temas que uma falha sistêmica marcou como tentados.
 *
 *   npx tsx scripts/unbench-summaries.ts --dry
 *   npx tsx scripts/unbench-summaries.ts --since 2026-08-23T12:00
 *
 * `syncSummaries` carimba `aiUpdatedAt` a cada tentativa sem resultado, e o
 * filtro de seleção afasta esses temas por trinta dias. A intenção é boa: um
 * tema que o modelo se recusa a resumir não deve consumir uma vaga toda semana.
 *
 * Mas o carimbo não distinguia "este projeto é difícil" de "a API recusou tudo".
 * Em 23/08/2026 a conta ficou sem crédito e 300 temas — justamente os já votados,
 * que o índice de posicionamento acabara de passar a priorizar — foram afastados
 * até o fim de setembro em dois minutos, com o painel registrando "0 registros
 * atualizados · OK".
 *
 * O conserto está no código (`summarize.ts` relança erro sistêmico,
 * `summaries.ts` interrompe o lote), mas ele não desfaz o que já foi carimbado.
 * Este script é o desfazer, e é deliberadamente estreito: só toca temas que
 * **continuam sem resumo**, então nunca reescreve um resultado real.
 *
 * Não é migration porque não é mudança de schema: é reparo de dado, pontual,
 * e o operador escolhe a janela.
 */
import "./load-env";
import { db } from "@/lib/db";

function parseArgs(argv: string[]): { dryRun: boolean; since: Date | null } {
  let since: Date | null = null;
  const i = argv.indexOf("--since");
  if (i >= 0) {
    const d = new Date(argv[i + 1]);
    if (Number.isNaN(d.getTime())) {
      console.error(`Data inválida para --since: "${argv[i + 1]}".`);
      process.exit(2);
    }
    since = d;
  }
  return { dryRun: argv.includes("--dry"), since };
}

async function main(): Promise<void> {
  const { dryRun, since } = parseArgs(process.argv.slice(2));

  const where = {
    status: "ACTIVE" as const,
    plainSummary: null,
    aiUpdatedAt: since ? { gte: since } : { not: null },
  };

  const total = await db.theme.count({ where });
  console.log(
    `\n${total.toLocaleString("pt-BR")} tema(s) sem resumo com tentativa registrada` +
      `${since ? ` desde ${since.toISOString()}` : ""}.`,
  );

  if (total === 0 || dryRun) {
    console.log(dryRun ? "\n  (--dry: nada foi gravado)\n" : "\n  Nada a fazer.\n");
    await db.$disconnect();
    return;
  }

  const { count } = await db.theme.updateMany({ where, data: { aiUpdatedAt: null } });
  console.log(`\n✓ ${count.toLocaleString("pt-BR")} tema(s) devolvidos à fila da IA.\n`);
  await db.$disconnect();
}

void main().catch(async (err) => {
  console.error("Falha:", err instanceof Error ? err.message : err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
