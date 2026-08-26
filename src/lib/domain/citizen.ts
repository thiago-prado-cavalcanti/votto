/**
 * O retrato político do cidadão — as leituras que a página `/voce` publica.
 *
 * Três leituras, e as três são **contagem sobre o que a pessoa fez**, nunca
 * estimativa de uma disposição latente. É a mesma disciplina do §3.4 para a
 * autoria de um parlamentar, aplicada do outro lado da mesa: *"dos 22 temas em
 * que você votou, 7 são de Ambiente"* é um censo e se defende tema a tema;
 * *"você se interessa por ambiente"* estima um traço, e com poucos votos essa
 * estimativa tem dezenas de pontos de erro.
 *
 * ── Por que o perfil de área do CIDADÃO vale, e o do parlamentar não ────────
 *
 * §3.4 mede que a distribuição de votos por área de um deputado varia ±5 pontos
 * em torno de um perfil comum aos 623 — porque ele reage à pauta que a Mesa
 * montou, e a pauta é a mesma para todos. O cidadão **escolhe em que votar**, e
 * é justamente por isso que a distribuição dele diz algo sobre ele.
 *
 * Isso impõe uma condição ao produto, e ela é load-bearing: a lista que a
 * plataforma oferece não pode decidir o perfil. Se o onboarding entregasse dez
 * temas e nove fossem de economia, todo mundo sairia "interessado em economia" —
 * o problema de composição de pauta, transplantado para dentro de casa. Daí
 * `onboardingThemes()` ser balanceada entre as nove áreas por construção.
 *
 * ── Não existe espectro aqui, e a razão não é falta de vontade ──────────────
 *
 * A página não desenha os dois eixos (Estado↔Mercado, Ordem↔Liberdades) porque
 * **os parlamentares não podem ser colocados neles** — §11, três testes
 * independentes. Colocar só o cidadão num plano vazio seria uma bússola com uma
 * agulha e nenhum norte: o valor de um posicionamento está inteiro na
 * comparação. O que substitui é `citizenGovernismo`, abaixo, que é comparável
 * com o agente porque é a mesma pergunta contada da mesma maneira.
 */
import { db } from "@/lib/db";
import { pairAgreement, MIN_ALIGNMENT_BASIS } from "@/lib/indexes/agreement";
import {
  citizenAgentAlignments,
  citizenPartyAlignments,
} from "@/lib/indexes/alignment";
import {
  POLICY_AREAS,
  themeAreas,
  type PolicyArea,
} from "@/lib/domain/policy-areas";
import { AgentType } from "@/generated/prisma";

// ─── Perfil por área ─────────────────────────────────────────────────────────

/**
 * Abaixo disto não se desenha o perfil. Não é teste estatístico — não há
 * inferência a proteger —, é o ponto em que a figura deixa de ser mais legível
 * que a frase. Com cinco temas cada fatia só pode assumir seis valores.
 */
export const MIN_PROFILE_VOTES = 5;

export interface CitizenAreaProfile {
  /** Temas votados que caem em ao menos uma área. É o denominador impresso. */
  total: number;
  /** As nove áreas sempre, na ordem de `POLICY_AREAS`. */
  slices: Array<{
    area: PolicyArea;
    label: string;
    count: number;
    share: number;
  }>;
  /** Falso quando o total não alcança o piso: há contagem, não há figura. */
  publishable: boolean;
}

/**
 * Em que áreas o cidadão escolheu votar.
 *
 * As fatias **não somam 100%**: as taxonomias das casas são multi-etiqueta e um
 * projeto de saneamento é saúde *e* infraestrutura, contando nas duas. Correto
 * aqui e erro numa pizza — a mesma nota que a placa de autoria carrega.
 */
export async function citizenAreaProfile(
  userId: string,
): Promise<CitizenAreaProfile> {
  const votes = await db.vote.findMany({
    where: { userId, voterType: "USER" },
    select: { theme: { select: { house: true, classifications: true } } },
  });

  const counts = new Map<PolicyArea, number>();
  let total = 0;
  for (const v of votes) {
    const areas = themeAreas(v.theme?.classifications, v.theme?.house);
    // Tema sem classificação não entra em eixo nenhum e também não entra no
    // denominador: ele não é um voto "sem área", é um voto que a casa não
    // classificou, e inflar o total com ele encolheria todas as fatias.
    if (areas.size === 0) continue;
    total++;
    for (const a of areas) counts.set(a, (counts.get(a) ?? 0) + 1);
  }

  return {
    total,
    slices: POLICY_AREAS.map(({ key, label }) => {
      const count = counts.get(key) ?? 0;
      return {
        area: key,
        label,
        count,
        share: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    }),
    publishable: total >= MIN_PROFILE_VOTES,
  };
}

// ─── Governismo do cidadão ───────────────────────────────────────────────────

/** Abaixo disto não há leitura, como no agente (`MIN_GOVERNISMO_OPPORTUNITIES`). */
export const MIN_CITIZEN_GOVERNISMO = 5;

export interface CitizenGovernismo {
  /** 0–100. */
  value: number;
  /** Temas que informaram a leitura — viaja sempre junto (§3.2). */
  base: number;
}

/**
 * Com que frequência o cidadão votou como o bloco `Governo` foi orientado.
 *
 * É a leitura que substitui o espectro nesta página, e ela funciona pelo motivo
 * que o espectro não funciona: **é contagem, não inferência**. A orientação é
 * publicada pela própria casa, votação por votação.
 *
 * ── Uma assimetria que precisa ser dita, não escondida ──────────────────────
 *
 * O `governismo` do parlamentar tem por denominador **votações**; este tem
 * **temas**. Não é descuido: o cidadão tem uma posição por tema (é o que a
 * cédula da plataforma pergunta), enquanto o parlamentar vota em cada votação
 * nominal. Contar votações do lado do cidadão pesaria um tema pelo número de
 * vezes que a Mesa o levou ao plenário — a agenda da casa entrando na leitura de
 * uma pessoa que não participou dela. Então: um tema, um voto, uma oportunidade.
 *
 * A consequência é que os dois números **não têm a mesma base** e a página tem
 * de imprimir as duas. Comparar 64% de 22 temas com 82% de 182 votações como se
 * fossem a mesma medida é o erro que `governismoBase` existe para evitar.
 *
 * ── Qual orientação, quando há várias ───────────────────────────────────────
 *
 * Um tema pode ter várias votações nominais. Vale a **mais recente com
 * orientação**: é a posição do governo mais próxima do estado atual do projeto,
 * e é a mesma escolha que `Vote` faz para o parlamentar ao guardar a posição
 * corrente em vez do histórico.
 */
export async function citizenGovernismo(
  userId: string,
): Promise<CitizenGovernismo | null> {
  const votes = await db.vote.findMany({
    where: { userId, voterType: "USER" },
    select: { themeId: true, value: true },
  });
  if (votes.length === 0) return null;

  const rollCalls = await db.rollCall.findMany({
    where: {
      themeId: { in: votes.map((v) => v.themeId) },
      NOT: { governmentPosition: null },
    },
    select: { themeId: true, governmentPosition: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });

  // `asc` mais sobrescrita deixa a MAIS RECENTE no mapa — ver o docblock.
  const orientation = new Map<
    string,
    NonNullable<(typeof rollCalls)[number]["governmentPosition"]>
  >();
  for (const rc of rollCalls) {
    if (rc.themeId && rc.governmentPosition)
      orientation.set(rc.themeId, rc.governmentPosition);
  }

  let sum = 0;
  let n = 0;
  for (const v of votes) {
    const gov = orientation.get(v.themeId);
    if (!gov) continue;
    // Mesma regra do alinhamento: dupla abstenção sai da conta inteira. Um
    // cidadão que se absteve e um governo que liberou a bancada não concordaram
    // sobre nada — e `mapOrientation` já devolve `null` para "Liberado", então
    // o que chega aqui como ABSTENTION é uma abstenção instruída.
    const agreement = pairAgreement(v.value, gov);
    if (agreement === null) continue;
    sum += agreement;
    n += 1;
  }

  if (n < MIN_CITIZEN_GOVERNISMO) return null;
  return { value: Math.round((sum / n) * 100), base: n };
}

// ─── Quem mais se parece com o cidadão ───────────────────────────────────────

export interface CitizenRankRow {
  kid: string;
  name: string;
  /**
   * A qualificação — "PSD · SP" para uma pessoa, **`null`** para um partido.
   *
   * `null` e não a sigla: o §9 é explícito em que a marca curada já traz a sigla
   * no lettering do próprio partido, e por isso a sigla nunca é impressa ao lado
   * da marca. Uma coluna "Sigla" ao lado do logo é a mesma palavra duas vezes,
   * uma delas na tipografia errada.
   *
   * A coluna inteira some quando isto é `null` — não vira um traço, porque não
   * há informação faltando: a natureza não tem qualificação a imprimir.
   */
  qualifier: string | null;
  /**
   * O denominador, já composto — "5" para uma pessoa, "24 de 47" para um partido.
   *
   * Composto aqui e não na tela porque ele difere por natureza: uma pessoa se
   * sustenta em temas votados em comum, um partido em quantos dos seus membros
   * entraram na média. Montar isso no componente exigia um `if` por tipo, e a
   * primeira versão saiu dizendo "1 parlamentar · 1 parlamentar medido".
   *
   * Vive numa COLUNA e não numa linha de apoio, que é a gramática da home: a
   * tabela imprime cada número sob um cabeçalho que o nomeia. Enfiado no
   * subtítulo, o denominador era um detalhe entre outros; numa coluna própria
   * ele é uma medida, que é o que ele é.
   */
  basis: string;
  /** Retrato publicado pela casa, ou a marca curada do partido. */
  imageUrl: string | null;
  initials: string;
  href: string;
  /** 0–100. */
  alignment: number;
  /** Temas em comum — o denominador, impresso ao lado. */
  sharedThemes: number;
}

export interface CitizenRanking {
  deputies: CitizenRankRow[];
  senators: CitizenRankRow[];
  parties: CitizenRankRow[];
}

/** Quantas linhas cada aba mostra. */
export const CITIZEN_RANK_SIZE = 5;

/**
 * Os mais alinhados com o cidadão, por natureza, do maior para o menor.
 *
 * ── Por que ranking e não "o mais alinhado" ─────────────────────────────────
 *
 * Um vencedor só é frágil justamente onde a leitura é nova: com poucos temas em
 * comum, `MIN_ALIGNMENT_BASIS` é alcançado no limite e **dezenas de
 * parlamentares empatam no topo** — eleger um deles é publicar ruído com nome e
 * sobrenome. Cinco linhas com o denominador ao lado mostram o empate em vez de
 * escondê-lo, e é o leitor quem vê que os cinco primeiros têm o mesmo número.
 *
 * ── O desempate é por temas em comum ────────────────────────────────────────
 *
 * Entre dois 100%, vence quem compartilha mais temas. Não é "mais alinhado" — é
 * **menos incerto**, que é a única coisa que se pode afirmar ali.
 */
export async function citizenRanking(
  userId: string,
  voteVersion: number,
  limit = CITIZEN_RANK_SIZE,
): Promise<CitizenRanking> {
  const [byAgent, byParty] = await Promise.all([
    citizenAgentAlignments(userId, voteVersion),
    citizenPartyAlignments(userId, voteVersion),
  ]);

  const scored = [...byAgent.values()].filter(
    (a): a is typeof a & { alignment: number } => a.alignment !== null,
  );
  const empty: CitizenRanking = { deputies: [], senators: [], parties: [] };
  if (scored.length === 0) return empty;

  const agents = await db.publicAgent.findMany({
    where: {
      kid: { in: scored.map((a) => a.agentKid) },
      status: "ACTIVE",
      inOffice: true,
    },
    select: {
      kid: true,
      firstName: true,
      lastName: true,
      type: true,
      state: true,
      imageUrl: true,
      party: { select: { acronym: true } },
    },
  });
  const byKid = new Map(agents.map((a) => [a.kid, a]));

  const rank = (types: AgentType[]): CitizenRankRow[] =>
    scored
      .filter((a) => {
        const agent = byKid.get(a.agentKid);
        return agent && types.includes(agent.type);
      })
      .sort(
        (a, b) => b.alignment - a.alignment || b.sharedThemes - a.sharedThemes,
      )
      .slice(0, limit)
      .map((a) => {
        const agent = byKid.get(a.agentKid)!;
        return {
          kid: a.agentKid,
          name: `${agent.firstName} ${agent.lastName}`.trim(),
          qualifier:
            [agent.party?.acronym, agent.state].filter(Boolean).join(" · ") ||
            "—",
          basis: String(a.sharedThemes),
          imageUrl: agent.imageUrl,
          initials:
            `${agent.firstName[0] ?? ""}${agent.lastName[0] ?? ""}`.toUpperCase(),
          href: `/agentes/${a.agentKid}`,
          alignment: a.alignment,
          sharedThemes: a.sharedThemes,
        };
      });

  const partyScores = [...byParty.values()]
    .filter((p): p is typeof p & { alignment: number } => p.alignment !== null)
    .sort((a, b) => b.alignment - a.alignment || b.agents - a.agents)
    .slice(0, limit);

  const partyRows = partyScores.length
    ? await db.party.findMany({
        where: { kid: { in: partyScores.map((p) => p.partyKid) } },
        select: {
          kid: true,
          acronym: true,
          name: true,
          logoUrl: true,
          agentCount: true,
        },
      })
    : [];
  const partyByKid = new Map(partyRows.map((p) => [p.kid, p]));

  return {
    deputies: rank([AgentType.FEDERAL_DEPUTY]),
    senators: rank([AgentType.SENATOR]),
    parties: partyScores.flatMap((p) => {
      const row = partyByKid.get(p.partyKid);
      if (!row) return [];
      return [
        {
          kid: row.kid,
          // Nome por extenso. A sigla não vem junto: ela já está na marca.
          name: row.name,
          qualifier: null,
          // O denominador do partido é quantos membros dele têm leitura — e ele
          // importa: uma bancada de um publica a excentricidade de uma pessoa
          // como posição do partido (§3.2, o problema que `pooling.ts` resolve
          // para os eixos e que esta média simples ainda não resolve).
          basis: `${p.agents} de ${row.agentCount}`,
          imageUrl: row.logoUrl,
          initials: (row.acronym ?? row.name).slice(0, 2).toUpperCase(),
          href: `/partidos/${row.kid}`,
          alignment: p.alignment,
          // A média não tem denominador de temas próprio: ela é feita das
          // leituras dos membros, e o que a sustenta é quantos deles entraram.
          sharedThemes: p.agents,
        },
      ];
    }),
  };
}

/** Quantos temas o cidadão já votou — o número que governa todo o resto. */
export async function citizenVoteCount(userId: string): Promise<number> {
  return db.vote.count({ where: { userId, voterType: "USER" } });
}

export { MIN_ALIGNMENT_BASIS };
