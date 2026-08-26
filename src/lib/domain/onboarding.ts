/**
 * A lista de temas que a plataforma oferece no primeiro acesso.
 *
 * ── A lista não pode decidir o perfil ───────────────────────────────────────
 *
 * O passo seguinte do onboarding mostra ao cidadão em que áreas ele votou. Se a
 * lista fosse "os cinco de maior prioridade", ela viria dominada por uma ou duas
 * áreas e **todo mundo sairia com o mesmo perfil** — o problema de composição de
 * pauta que o §3.2 combate no `discrimination` e o §3.4 mede nos deputados
 * (a distribuição de votos por área varia só ±5 pontos entre os 623, porque
 * descreve a pauta e não a pessoa).
 *
 * Daí a regra: **uma vaga por área**, o tema de maior prioridade em cada. Isso
 * não torna o perfil uma leitura sobre a pessoa — com cinco temas e cinco votos
 * exigidos não há escolha nenhuma (ver `ONBOARDING_SIZE`) —, mas garante que a
 * plataforma não empurre todo mundo para a mesma área.
 *
 * ── O tema PRECISA já ter sido votado pelos parlamentares ───────────────────
 *
 * Não é preferência: é a condição de existência do passo 3. O alinhamento do
 * §3.1 é calculado sobre o conjunto de temas que **os dois** votaram, e um
 * parlamentar só vota em votação nominal. Um projeto "Pronta para Pauta" ainda
 * não foi a plenário, então ninguém votou nele — e uma turma inteira feita
 * desses produz denominador zero contra os 594 parlamentares. Foi exatamente o
 * que aconteceu: treze votos do cidadão, "ainda não há temas em comum
 * suficientes" nas duas casas.
 *
 * A consequência é que a lista sai da pauta futura e vai para o **registro**:
 * 591 temas do acervo têm voto de agente e título em linguagem simples, com
 * mediana de 417 parlamentares por tema. A maioria já está concluída, e isso é
 * correto — a pergunta que se faz ao cidadão é a mesma que a casa já respondeu,
 * que é o que torna as duas respostas comparáveis. É como o Wahl-O-Mat funciona.
 *
 * ── E precisa ter DIVIDIDO a casa ───────────────────────────────────────────
 *
 * Um projeto aprovado por 470 a 3 não separa ninguém: o cidadão concorda com
 * quase todo mundo ou discorda de quase todo mundo, e as fichas empatam. É a
 * `discrimination` do §3.2 chegando na porta da frente do produto — o peso de um
 * item é a divisão que ele produziu, e um item unânime pesa zero.
 *
 * Medido no acervo: dos 591 com voto e título, **317 têm minoria ≥ 20%**, e as
 * nove áreas continuam cobertas (de 10 em saúde a 62 em segurança). Então exigir
 * divisão não custa cobertura.
 *
 * ── As outorgas de radiodifusão saem sozinhas agora ─────────────────────────
 *
 * Elas exigiam um filtro por ementa enquanto a lista vinha da pauta futura (§11:
 * 49 das 67 em "Pronta para Pauta", prioridade média 58). Com a exigência de
 * voto nominal o filtro virou desnecessário e foi removido: medido, **zero das
 * 67 carrega voto nominal** — são decididas conclusivamente na CCTCI, por
 * processo simbólico. Um requisito que já é verdade não precisa de regra.
 */
import { db } from "@/lib/db";
import {
  POLICY_AREAS,
  camaraArea,
  senadoArea,
  type PolicyArea,
} from "@/lib/domain/policy-areas";

/**
 * Quantos temas a lista oferece.
 *
 * Cinco, e **cinco áreas distintas** — não os cinco mais prioritários, que
 * viriam concentrados. A regra continua a mesma de quando eram dez: a lista não
 * pode decidir o perfil de ninguém.
 *
 * O que muda com cinco, e é preciso dizer: como `ONBOARDING_MIN_VOTES` também é
 * cinco (e não pode ser menos — ver abaixo), **não sobra escolha**. Todo mundo
 * vota nos mesmos cinco temas, então a divisão por área logo depois do percurso
 * é a desta lista, não uma leitura sobre a pessoa. Ela só passa a dizer algo
 * quando o cidadão volta a votar por conta própria, em `/temas`. A tela do passo
 * 2 é redigida em cima disso: mostra o que ele acabou de responder, e não um
 * diagnóstico.
 */
export const ONBOARDING_SIZE = 5;

/**
 * Quantos votos encerram o primeiro passo.
 *
 * É o mesmo piso de `MIN_ALIGNMENT_BASIS` e de `MIN_PROFILE_VOTES`, e não por
 * simetria: abaixo dele **nenhum dos passos seguintes tem o que mostrar** — nem
 * o perfil de área, nem o parlamentar mais alinhado. Um parlamentar precisa de
 * cinco temas em comum para receber leitura; com quatro votos, ninguém alcança
 * o piso e o passo 3 fica vazio para todo mundo. É por isso que este número não
 * pode ser reduzido junto com `ONBOARDING_SIZE`.
 */
export const ONBOARDING_MIN_VOTES = 5;

/** Mínimo de deputados que votaram, para o tema ter denominador. */
const MIN_AGENT_VOTES = 50;

/**
 * O mesmo, no Senado, e é mais baixo por motivo regimental e não por descuido.
 *
 * O RISF art. 293, II faz o voto do líder valer pela bancada no processo
 * simbólico, então a casa publica muito menos votação nominal (§3.2). Exigir
 * dela os 50 votantes da Câmara zeraria a lista: são 81 senadores no total.
 */
const MIN_AGENT_VOTES_SENADO = 20;

/**
 * Quantas rodadas o percurso oferece, e por que elas alternam de casa.
 *
 * Um senador só recebe leitura com `MIN_ALIGNMENT_BASIS` (5) temas do SENADO em
 * comum — e um tema da Câmara não serve, porque senador nenhum votou nele. Com
 * cinco vagas por tela, uma turma só nunca alcança as duas casas: ou dá para o
 * deputado, ou dá para o senador.
 *
 * Daí a alternância. Rodada 1 pergunta cinco projetos da Câmara e destrava o
 * deputado; a 2 pergunta cinco do Senado e destrava o senador; a 3 volta à
 * Câmara com temas novos. "Votar em mais temas" é o que avança a rodada, então
 * o convite do passo 3 deixa de ser genérico e passa a ter uma consequência
 * nomeável.
 */
export const ONBOARDING_ROUNDS = 6;

/**
 * Fatia mínima do lado perdedor, entre sim e não.
 *
 * Vinte por cento: abaixo disso o tema é quase consenso e não distingue
 * parlamentares entre si — ver o topo. Não é um teste estatístico, é o ponto em
 * que a pergunta deixa de informar quem pensa como quem.
 */
const MIN_MINORITY = 0.2;

export interface OnboardingTheme {
  kid: string;
  title: string;
  /** A ementa oficial — a descrição curta que o cartão mostra e a folha abre. */
  summary: string;
  identifier: string | null;
  house: string | null;
  situation: string | null;
  /** A área pela qual o tema entrou na lista — a etiqueta que a tela mostra. */
  area: PolicyArea;
  areaLabel: string;
}

/**
 * Cinco temas, de cinco áreas distintas: a **turma** do primeiro acesso.
 *
 * Determinística dentro de um mesmo estado do acervo, e é isso que a torna uma
 * turma e não uma amostra: quem entra hoje responde às mesmas cinco perguntas,
 * o que é o mínimo para duas pessoas poderem comparar o que responderam.
 *
 * **Não filtra o que o cidadão já votou, de propósito.** Quem filtra é a tela,
 * comparando com os votos dele — e a diferença importa. Se a seleção excluísse
 * os já votados, cada voto traria um tema novo do acervo para o lugar do que
 * saiu, e a lista nunca esvaziaria: cinco perguntas viraria um rolo infinito. A
 * turma é fixa, os votados somem dela, e quando ela zera o passo acabou.
 */
export async function onboardingThemes(round = 1): Promise<OnboardingTheme[]> {
  // Rodada ímpar pede à Câmara, par ao Senado. Ver `ONBOARDING_ROUNDS`.
  const house = round % 2 === 1 ? "CAMARA" : "SENADO";
  const depth = Math.floor((round - 1) / 2);

  const candidates = await db.theme.findMany({
    where: {
      status: "ACTIVE",
      house,
      // Sem o título em linguagem simples a pergunta chega em juridiquês, e a
      // primeira tela do produto não é lugar para "Altera o art. 3º da Lei…".
      NOT: { plainTitle: null },
      // A condição que faz o passo 3 existir. Ver o topo.
      votes: { some: { voterType: "AGENT" } },
    },
    select: {
      id: true, kid: true, name: true, plainTitle: true, summary: true,
      identifier: true, house: true, situation: true, classifications: true,
      lastActionAt: true,
    },
  });
  if (candidates.length === 0) return [];

  const tally = await db.vote.groupBy({
    by: ["themeId", "value"],
    where: { voterType: "AGENT", themeId: { in: candidates.map((c) => c.id) } },
    _count: { _all: true },
  });
  const counts = new Map<string, { yes: number; no: number }>();
  for (const row of tally) {
    const cur = counts.get(row.themeId) ?? { yes: 0, no: 0 };
    if (row.value === "YES") cur.yes = row._count._all;
    if (row.value === "NO") cur.no = row._count._all;
    counts.set(row.themeId, cur);
  }

  // O piso de participação é por casa. O Senado publica muito menos votação
  // nominal — regimental, não falha de importação (§8) —, então exigir dele os
  // mesmos 50 votantes da Câmara esvaziaria a lista inteira.
  const floor = house === "SENADO" ? MIN_AGENT_VOTES_SENADO : MIN_AGENT_VOTES;

  const divisive = candidates
    .filter((c) => {
      const v = counts.get(c.id);
      if (!v) return false;
      const total = v.yes + v.no;
      return total >= floor && Math.min(v.yes, v.no) / total >= MIN_MINORITY;
    })
    // Entre os divisivos, os mais recentes: a pergunta é sobre o país de agora,
    // e uma votação de 2019 exige do cidadão um contexto que ele não tem.
    .sort((a, b) => (b.lastActionAt?.getTime() ?? 0) - (a.lastActionAt?.getTime() ?? 0));

  // Uma pilha por área, na ordem acima. A rodada tira uma camada de cada pilha,
  // o que é o que faz a rodada 3 trazer temas novos em vez de repetir os da 1.
  const stacks = new Map<PolicyArea, OnboardingTheme[]>();
  for (const t of divisive) {
    const primary = primaryArea(t.classifications, t.house);
    if (!primary) continue;
    const entry: OnboardingTheme = {
      kid: t.kid,
      title: t.plainTitle ?? t.name,
      // A ementa oficial. Vazia — nem toda casa publica — o título oficial
      // serve de descrição: é prolixo, mas é o registro.
      summary: t.summary || t.name,
      identifier: t.identifier,
      house: t.house,
      situation: t.situation,
      area: primary,
      areaLabel: POLICY_AREAS.find((a) => a.key === primary)!.label,
    };
    const stack = stacks.get(primary);
    if (stack) stack.push(entry);
    else stacks.set(primary, [entry]);
  }

  // Gira a ordem das áreas a cada camada, para que as nove sejam cobertas ao
  // longo das rodadas em vez de as quatro últimas nunca aparecerem.
  const rotated = [...POLICY_AREAS.slice(depth % POLICY_AREAS.length), ...POLICY_AREAS.slice(0, depth % POLICY_AREAS.length)];
  const cohort: OnboardingTheme[] = [];
  for (const area of rotated) {
    const pick = stacks.get(area.key)?.[depth];
    if (pick) cohort.push(pick);
    if (cohort.length === ONBOARDING_SIZE) break;
  }
  return cohort;
}

/**
 * A área do assunto PRINCIPAL do projeto — a que a tela imprime.
 *
 * A Câmara marca uma das classificações com `relevancia: 1`; quando ela existe,
 * é essa que manda. Sem ela, vale a primeira que o mapa reconhece, na ordem em
 * que a própria casa publicou — que é a ordem em que um leitor do registro
 * oficial encontraria o assunto.
 *
 * Devolve `null` quando nenhuma classificação cai numa das nove áreas, e o tema
 * fica de fora: sem assunto reconhecido não há etiqueta honesta para pôr nele.
 */
function primaryArea(classifications: unknown, house: string | null): PolicyArea | null {
  if (!Array.isArray(classifications)) return null;
  const rows = classifications as Array<{
    code?: string | number | null;
    label?: string | null;
    hierarchy?: string | null;
    relevance?: number | null;
  }>;

  const resolve = (row: (typeof rows)[number]): PolicyArea | null | undefined =>
    house === "SENADO"
      ? senadoArea(row.hierarchy ?? null, row.label ?? undefined)
      : camaraArea(row.code == null ? null : Number(row.code));

  const ordered = [...rows.filter((r) => r.relevance === 1), ...rows];
  for (const row of ordered) {
    const area = resolve(row);
    if (area) return area;
  }
  return null;
}

/**
 * A primeira rodada que ainda tem pergunta para este cidadão.
 *
 * Resolvida no servidor a cada visita a `/comecar` sem rodada na URL, e então
 * **fixada na URL**. As duas coisas são necessárias: sem resolver, "votar em
 * mais temas" repetiria a turma já respondida; sem fixar, responder o quinto
 * traria a rodada seguinte no lugar de avançar para o resultado, e o percurso
 * nunca sairia do passo 1.
 *
 * Devolve `null` quando o acervo acabou — seis rodadas, 30 perguntas.
 */
export async function nextOnboardingRound(votedThemeKids: Set<string>): Promise<number | null> {
  for (let round = 1; round <= ONBOARDING_ROUNDS; round++) {
    const cohort = await onboardingThemes(round);
    if (cohort.length === 0) continue;
    if (cohort.some((t) => !votedThemeKids.has(t.kid))) return round;
  }
  return null;
}
