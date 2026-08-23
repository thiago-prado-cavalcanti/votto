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

function parseArgs(argv: string[]): { dryRun: boolean; since: Date | null; raw: string | null } {
  let since: Date | null = null;
  let raw: string | null = null;
  const i = argv.indexOf("--since");
  if (i >= 0) {
    raw = argv[i + 1] ?? "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      console.error(`Data inválida para --since: "${raw}".`);
      process.exit(2);
    }
    since = d;
  }
  return { dryRun: argv.includes("--dry"), since, raw };
}

/**
 * Mostra o instante que `--since` de fato virou, nos dois fusos.
 *
 * `new Date("2026-08-23T12:00")` — sem sufixo de fuso — é lido como hora LOCAL,
 * e o container `migrate` roda em UTC porque, ao contrário do `worker`, ele não
 * define `TZ`. Então "12:00" digitado pensando em Brasília vira 09:00 de
 * Brasília, e a janela pega três horas a mais de tentativas do que se queria.
 * Aconteceu: uma janela para isolar um incidente das 12:23 devolveu 497 temas em
 * vez de 300, misturando recusas legítimas da manhã.
 *
 * O conserto não é adivinhar a intenção — é imprimir o que foi entendido, antes
 * de tocar em qualquer linha, para o operador conferir contra o que quis dizer.
 */
function describeWindow(since: Date, raw: string): string {
  const brasilia = since.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const semFuso = !/[Zz]|[+-]\d{2}:?\d{2}$/.test(raw.trim());
  return (
    `  --since "${raw}" → ${since.toISOString()} (UTC) = ${brasilia} (Brasília)` +
    (semFuso
      ? `\n  ⚠ sem fuso no argumento: lido como hora local do container (TZ=${process.env.TZ ?? "UTC"}).` +
        `\n    Use o sufixo Z para não depender disso, ex.: 2026-08-23T15:20:00Z`
      : "")
  );
}

async function main(): Promise<void> {
  const { dryRun, since, raw } = parseArgs(process.argv.slice(2));
  if (since && raw !== null) console.log(`\n${describeWindow(since, raw)}`);

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
