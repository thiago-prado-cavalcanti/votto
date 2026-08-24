"use server";

/**
 * Reordenar o ranking da home — sobre a base inteira, não sobre o que está na tela.
 *
 * Server action e não rota pública, pelo mesmo motivo de `loadMoreThemes`: as
 * linhas voltam já mapeadas, sem nenhum id interno junto (CLAUDE.md §5), e não
 * há um segundo contrato para manter em passo com a página.
 *
 * O que torna isto necessário, e não uma preferência de arquitetura: as três
 * leituras não são subconjunto uma da outra. Reordenar no cliente os dez que a
 * página escolheu por performance devolve os dez melhores em performance
 * dispostos por alinhamento — que não são os dez melhores em alinhamento.
 *
 * Só leitura.
 */
import { getCitizenSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rankBenches } from "@/lib/domain/agent-ranking";
import { rankingDirection, rankingSort, type Ranking } from "@/lib/domain/ranking";

/**
 * Devolver o ranking das três bancadas sob um novo critério.
 *
 * @param sort      Critério pedido; um valor desconhecido cai em "quality".
 * @param direction "asc" ou "desc"; qualquer outra coisa vira "desc".
 */
export async function rerankBenches(sort: string, direction: string): Promise<Ranking> {
  const session = await getCitizenSession();
  // A sessão é lida do cookie assinado, nunca recebida como parâmetro — senão a
  // action aceitaria calcular o alinhamento "pessoal" de outra pessoa.
  const citizen = session
    ? await db.user.findUnique({
        where: { kid: session.userKid },
        select: { id: true, voteVersion: true },
      })
    : null;

  return rankBenches(rankingSort(sort), rankingDirection(direction), citizen);
}
