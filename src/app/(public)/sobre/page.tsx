/**
 * "Sobre" — the project stated in its own words.
 *
 * Everything Votto publishes is a number about somebody else; this is the one
 * page where the platform is the subject. It exists because the indexes are only
 * trustworthy if the reader can see what they measure and what they refuse to
 * measure — so the page carries the vision (CLAUDE.md §1–2), a non-technical
 * account of all three indexes (§3.1 alinhamento, §3.3 qualidade, §3.2
 * posicionamento) and the privacy and design choices with their reasons
 * (§5, §8).
 *
 * The indexes are ordered by how much of each one is actually published, not by
 * their numbering in CLAUDE.md: the two that print in full first, the one that
 * withholds its verdict last, so the section descends to the caveat instead of
 * stepping over it.
 *
 * Two editorial rules it holds itself to:
 *
 * - **Nothing here may over-promise the maths.** The five-band left↔right verdict
 *   is computed in the code and deliberately not published, so this page says so
 *   in the same breath as it explains the axes. A Sobre page that announced a
 *   verdict the product does not print would be the loudest possible way to
 *   contradict it.
 * - **The masthead figure is real.** It is a live cut of the theme base by
 *   source, not an illustration — on a page whose whole argument is "the data is
 *   official and checkable", an invented figure would be self-refuting. It is
 *   withheld entirely while the base is empty, rather than shown as zeroes.
 * - **This page is the platform as it stands, never a changelog.** It describes
 *   what the indexes do, not what they used to do and what was fixed. The
 *   temptation is real and specific: every hard-won correction feels like it
 *   deserves its paragraph, and "antes… agora…" is the easiest way to explain
 *   *why* a rule exists. But a reader arriving today has no prior version in
 *   their head, so the narration costs them the explanation and buys nothing —
 *   and a page that keeps score of its own repairs reads as a product arguing
 *   with itself rather than a document stating what is true. The reasoning that
 *   justifies a rule belongs here in the present tense ("zero is the coordinate
 *   of the centre, not of the unmeasured"); the history belongs in the code
 *   comments, in `docs/` and in the git log, where it is useful to whoever has
 *   to change the thing.
 */
import type { Metadata } from "next";
import * as React from "react";
import { Container, ButtonLink } from "@/components/ui";
import { PageIntro, SectionHead } from "@/components/public/Section";
import { IndexPlate } from "@/components/public/IndexPlate";
import { Reveal } from "@/components/public/motion";
import {
  AlignmentLedger,
  QualityPillars,
  PositioningAxes,
  PositioningWeights,
} from "@/components/public/AboutIndex";
import { Key, RuleList, RuleItem, DocLink } from "@/components/public/LegalDoc";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sobre o projeto",
  description:
    "O que o Votto propõe, no que ele não se mete, e como os três índices — alinhamento, qualidade do mandato e posicionamento — são calculados.",
};

/** Delay of a part inside a revealed block (see the motion block in globals.css). */
const beat = (ms: number) => ({ "--vt-d": `${ms}ms` }) as React.CSSProperties;

/** The reading column: prose at the width a paragraph is comfortable at. */
function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex max-w-2xl flex-col gap-4 text-[0.98rem] leading-[1.75] text-navy-700">
      {children}
    </div>
  );
}

/**
 * One decision and the reason for it, set as a printed glossary: the decision in
 * the serif on the left, the reason beside it. A choice with no reason attached
 * is a claim, and this page is precisely the place where claims are not enough.
 */
function Choice({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <Reveal
      variant="fade"
      className="grid gap-2 border-t border-line py-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10"
    >
      <h3 className="text-[1.15rem] leading-snug text-navy-900">{term}</h3>
      <div className="flex flex-col gap-3 text-[0.93rem] leading-[1.7] text-navy-700">
        {children}
      </div>
    </Reveal>
  );
}

/** The four movements of a theme, in the hero's steps grammar. */
const JOURNEY = [
  {
    n: "01",
    title: "A pauta entra",
    body: "A Câmara e o Senado publicam, em bases abertas, tudo o que apresentam, o que tramita e o que vai a voto. O Votto lê essas bases e transforma cada proposição em um tema — com o identificador oficial, a situação atual e o link de volta para a página da casa.",
  },
  {
    n: "02",
    title: "O tema é traduzido",
    body: "Texto legislativo é escrito para o processo legislativo, não para você. Ao lado dele publicamos um título e um resumo em português corrente. O texto oficial não é substituído nem reescrito: continua ali, e continua sendo a fonte.",
  },
  {
    n: "03",
    title: "Você se posiciona",
    body: "Sim, Não ou Neutro. Sem campo de comentário, sem justificativa, sem réplica. Um voto de um minuto pesa o mesmo que um voto de uma hora.",
  },
  {
    n: "04",
    title: "Os índices se movem",
    body: "A cada voto seu, o seu alinhamento com cada agente público e com cada partido é recalculado. Nada disso depende de você acertar quem procurar: o número existe para todos, o tempo todo.",
  },
];

export default async function AboutPage() {
  // Live cut of the theme base by origin. The plate is the page's own figure and
  // must be true — an empty base gets no plate at all rather than three zeroes.
  const [camara, senado, manual] = await Promise.all([
    db.theme.count({ where: { status: "ACTIVE", source: "CAMARA" } }),
    db.theme.count({ where: { status: "ACTIVE", source: "SENADO" } }),
    db.theme.count({ where: { status: "ACTIVE", source: "MANUAL" } }),
  ]);
  const totalThemes = camara + senado + manual;

  const originRows = [
    { label: "Câmara dos Deputados", value: camara, color: "var(--color-navy-800)" },
    { label: "Senado Federal", value: senado, color: "var(--color-colonial-600)" },
    { label: "Cadastro próprio", value: manual, color: "var(--color-navy-400)" },
  ].filter((row) => row.value > 0);

  return (
    <>
      <PageIntro
        eyebrow="O projeto"
        title="Sobre o Votto"
        lead={
          <>
            O Votto é um complemento à democracia representativa: um canal onde cada
            cidadão se posiciona sobre o que está em pauta — e onde essa posição pode
            ser comparada, tema a tema, com a de quem o representa.
          </>
        }
        figure={
          totalThemes > 0 ? (
            <IndexPlate
              caption="De onde vêm os temas"
              note={`${totalThemes.toLocaleString("pt-BR")} ${totalThemes === 1 ? "tema" : "temas"}`}
              rows={originRows}
            />
          ) : null
        }
      />

      <Container className="py-14">
        {/* ── A proposta ──────────────────────────────────────────────── */}
        <section>
          <SectionHead
            title="A proposta"
            lead="Por que somar um canal direto a uma estrutura que já funciona por representação."
          />
          <Prose>
            <p>
              A democracia representativa nasceu de uma limitação prática. Uma população
              inteira não podia se reunir para deliberar sobre cada lei, cada emenda e
              cada ato do Executivo — então elegeu quem deliberasse em seu nome. A
              limitação era <Key>técnica</Key>, e hoje, em boa medida, ela não existe
              mais.
            </p>
            <p>
              O Votto não propõe substituir essa estrutura, e não tem nenhum poder para
              isso. Propõe somar a ela um canal direto: você se posiciona sobre os temas
              nacionais, estaduais e municipais que estão em votação, e a plataforma mede
              a distância entre as suas escolhas e as escolhas registradas de cada agente
              público e de cada partido.
            </p>
            <p>
              Isso serve aos dois lados da relação. Ao <Key>cidadão</Key>, que passa a
              saber com número — e não com impressão — o quanto quem o representa de fato
              o representa. E ao <Key>representante</Key>, que passa a ter uma leitura
              contínua de quem o elegeu, em vez de uma leitura a cada quatro anos.
            </p>
          </Prose>
        </section>

        {/* ── O que o Votto não é ─────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHead
            title="O que o Votto não é"
            lead="Delimitar o que a plataforma não faz é o que torna legível o que ela faz."
          />
          <div className="mt-6 max-w-2xl text-[0.95rem] leading-[1.7] text-navy-700">
            <RuleList>
              <RuleItem>
                <Key>Não é uma rede social.</Key> Não há perfil público, linha do tempo,
                comentário nem resposta. Você vota; ninguém debate com você.
              </RuleItem>
              <RuleItem>
                <Key>Não é uma pesquisa de opinião.</Key> Não há amostra, recorte
                demográfico nem projeção para a população. São os votos de quem se
                cadastrou, somados como estão.
              </RuleItem>
              <RuleItem>
                <Key>Não é uma substituição da urna.</Key> Nada aqui elege, destitui ou
                obriga ninguém a nada.
              </RuleItem>
              <RuleItem>
                <Key>Não é um placar de torcida.</Key> O índice mede coincidência de voto
                tema a tema — não simpatia, não intenção declarada, não discurso.
              </RuleItem>
              <RuleItem>
                <Key>Não tem opinião própria.</Key> O Votto não defende posição sobre
                nenhum tema e não recomenda candidato. Ele publica contas sobre votos que
                já são públicos.
              </RuleItem>
            </RuleList>
          </div>
        </section>

        {/* ── Como funciona ───────────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHead
            title="Como funciona, do começo ao fim"
            lead="O percurso de um projeto de lei até virar um número na sua tela."
          />
          {/* The dividing rules belong to the four-across row only. At the
              two-column breakpoint the third step opens the left column, so a
              rule keyed on "not the first item" would draw a line down the
              middle of nothing. */}
          <Reveal
            as="ol"
            variant="fade"
            stagger
            step={120}
            className="mt-8 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-0"
          >
            {JOURNEY.map((step, i) => (
              <li
                key={step.n}
                className={
                  i === 0
                    ? "lg:pr-8"
                    : "lg:border-l lg:border-line lg:px-8 lg:last:pr-0"
                }
              >
                <span className="vt-num text-3xl text-accent-500">{step.n}</span>
                <h3 className="mt-3 text-xl leading-snug">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-600">{step.body}</p>
              </li>
            ))}
          </Reveal>
        </section>

        {/* ── Os índices ──────────────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHead
            title="Os índices, sem matemática"
            lead="São três, e respondem a perguntas diferentes: o primeiro compara você com alguém, o segundo pergunta se essa pessoa está fazendo o trabalho, e o terceiro descreve onde ela está."
          />

          {/* Alinhamento — the platform's headline reading, so it gets the
              worked example beside the prose rather than under it. */}
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
            <div>
              <h3 className="text-[1.55rem] leading-tight">
                Índice de Alinhamento
              </h3>
              <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                O quanto essa pessoa vota como você
              </p>

              <Prose>
                <p>
                  É a leitura principal da plataforma, e ela é deliberadamente simples.
                  Toma-se <Key>apenas os temas em que vocês dois votaram</Key> e conta-se
                  quantas vezes vocês escolheram a mesma coisa:
                </p>
                <ul className="flex list-none flex-col gap-2 pl-0">
                  <li className="border-l-2 border-line pl-4">
                    A mesma escolha vale <span className="vt-num">1</span> ponto.
                  </li>
                  <li className="border-l-2 border-line pl-4">
                    Escolhas opostas — um Sim contra um Não — valem{" "}
                    <span className="vt-num">0</span>.
                  </li>
                  <li className="border-l-2 border-line pl-4">
                    Um lado neutro e o outro não vale <span className="vt-num">½</span>:
                    não é acordo, mas também não é conflito.
                  </li>
                </ul>
                <p>
                  A média desses pontos, em porcentagem, é o índice.{" "}
                  <span className="vt-num">100%</span> é um histórico idêntico ao seu;{" "}
                  <span className="vt-num">0%</span> é o oposto exato, tema a tema. Não há
                  peso secreto, nota editorial nem correção por partido.
                </p>
              </Prose>
            </div>

            <Reveal variant="figure" delay={120}>
              <AlignmentLedger />
            </Reveal>
          </div>

          <div className="mt-10">
            <h4 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Três coisas que esse número não diz
            </h4>
            <div className="mt-4 max-w-2xl text-[0.95rem] leading-[1.7] text-navy-700">
              <RuleList>
                <RuleItem>
                  <Key>Ele só enxerga o que vocês têm em comum.</Key> Um deputado que
                  votou em quatrocentos temas, dos quais você votou em três, é medido
                  nesses três. Por isso a plataforma sempre imprime, ao lado do índice,{" "}
                  <Key>quantos temas ele está medindo</Key> — um alinhamento de 100% sobre
                  dois temas diz muito menos do que um de 71% sobre cento e quarenta.
                </RuleItem>
                <RuleItem>
                  <Key>Ele mede coincidência, não concordância de motivo.</Key> Duas
                  pessoas podem votar Não no mesmo projeto por razões opostas. O índice
                  conta o voto, que é o que fica registrado.
                </RuleItem>
                <RuleItem>
                  <Key>Ele não existe para quem ainda não votou.</Key> Sem votos seus não
                  há o que comparar — é por isso que o alinhamento pessoal só aparece
                  depois de entrar e votar nos primeiros temas.
                </RuleItem>
              </RuleList>
            </div>
          </div>

          <Prose>
            <p>
              <Key>O alinhamento de um partido</Key> é a média do alinhamento dos seus
              parlamentares em exercício. Um partido não vota; quem vota são as pessoas
              que o compõem, e é sobre elas que a conta é feita.
            </p>
            <p>
              <Key>Quando você ainda não entrou</Key>, as listas não ficam vazias — mas o
              número muda de pergunta. No lugar do seu alinhamento pessoal, cada agente
              mostra o alinhamento com a <Key>sua base</Key>: os cidadãos que declararam
              ali, na plataforma, que aquela pessoa os representa. É a pergunta honesta,
              porque ninguém é eleito por todo mundo. Enquanto um agente não tem base
              declarada — ou enquanto ela ainda não votou em nada que ele tenha votado —
              entra no lugar o alinhamento com o conjunto de todos os cidadãos que
              votaram. É um substituto, e a página sempre diz qual das duas leituras está
              imprimindo.
            </p>
          </Prose>

          {/* Qualidade — the reading that owes nothing to agreement, so it
              sits between the two that do. */}
          <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
            <div>
              <h3 className="text-[1.55rem] leading-tight">Performance política</h3>
              <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Se essa pessoa está fazendo o trabalho
              </p>

              <Prose>
                <p>
                  Os outros dois índices dependem de opinião — a sua, ou a de quem se
                  declara representado. Este não depende de nenhuma. Ele faz uma pergunta
                  que não tem lado: <Key>essa pessoa está fazendo o trabalho para o qual
                  foi eleita?</Key>
                </p>
                <p>
                  Um parlamentar que quase não comparece, não propõe nada e consome a cota
                  inteira pode estar 100% alinhado com quem pensa como ele. O alinhamento
                  não enxerga isso; era para isso que faltava um segundo número. Ele sai
                  de três medidas de peso igual, todas tiradas do registro que as próprias
                  casas publicam, combinadas pelo método que a OCDE e o Centro Comum de
                  Investigação da União Europeia publicam para índices compostos — o mesmo
                  que sustenta o Índice de Desenvolvimento Humano.
                </p>
              </Prose>
            </div>

            <Reveal variant="figure" delay={120}>
              <QualityPillars />
            </Reveal>
          </div>

          <div className="mt-10">
            <h4 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              O que faz esse número ser honesto
            </h4>
            <div className="mt-4 max-w-2xl text-[0.95rem] leading-[1.7] text-navy-700">
              <RuleList>
                <RuleItem>
                  <Key>A régua é fixa e publicada, não o melhor colega.</Key> Cada medida
                  é comparada com uma meta congelada: comparecer a todas as votações vale
                  100, usar metade da cota a que se tem direito vale 100. Isso tem uma
                  consequência que é o motivo inteiro da escolha —{" "}
                  <Key>a nota de um parlamentar só muda quando ele muda.</Key> Na versão
                  anterior, medida contra o melhor da turma, bastava um colega apresentar o
                  dobro de projetos para a nota de todos os outros cair, sem que ninguém
                  tivesse feito nada diferente.
                </RuleItem>
                <RuleItem>
                  <Key>O número bruto vem sempre junto.</Key> A barra nunca aparece
                  sozinha —{" "}<span className="vt-num">92%</span> · 312 de 340 votações.
                  A meta forma o índice; o número é o que você lê, e é o que permite
                  conferir a conta documento por documento.
                </RuleItem>
                <RuleItem>
                  <Key>Protocolar projetos não leva ao topo.</Key> Apresentar um projeto
                  custa uma assinatura; fazê-lo andar, não. Por isso a apresentação satura:
                  sozinha, ela chega a 80 de 100 nessa medida e para. Os últimos 20 pontos
                  exigem desfecho — projeto que avançou — ou relatoria. É a defesa contra
                  encher o gabinete de proposições que ninguém vai votar.
                </RuleItem>
                <RuleItem>
                  <Key>Falhar numa medida não se compra com as outras.</Key> As três notas
                  entram numa média geométrica. Numa média simples, quem nunca aparece,
                  quem nunca legisla e quem gasta a cota inteira terminavam todos com a
                  mesma nota confortável — é o mesmo motivo pelo qual o Índice de
                  Desenvolvimento Humano trocou de média em 2010.
                </RuleItem>
                <RuleItem>
                  <Key>O que não dá para medir não vira zero.</Key> Um pilar sem dados sai
                  da conta e o peso dele se redistribui entre os outros. Se sobrar menos
                  da metade do peso, o agente não recebe nota nenhuma — a página diz que
                  não há leitura. Um zero, aqui, seria uma acusação, e não um dado
                  faltando.
                </RuleItem>
                <RuleItem>
                  <Key>As faixas são comparativas, nunca avaliativas.</Key> &ldquo;Acima
                  da média&rdquo;, &ldquo;na média&rdquo; — e não &ldquo;excelente&rdquo;
                  ou &ldquo;ruim&rdquo;. O que o número mede é atividade registrada, não
                  virtude, e as palavras dizem exatamente isso. Um veredito sobre uma
                  pessoa com nome e sobrenome é a última coisa que este índice pode
                  enunciar de leve.
                </RuleItem>
                <RuleItem>
                  <Key>Toda mudança de regra é datada.</Key> Cada nota carrega a edição da
                  metodologia que a produziu, e a edição só muda quando um peso, uma meta
                  ou uma constante muda — o que é verificado automaticamente, não
                  lembrado. Assim dá para distinguir uma nota que se moveu porque o
                  parlamentar mudou de uma que se moveu porque nós mudamos.
                </RuleItem>
              </RuleList>
            </div>
          </div>

          {/* The scoping decision that most changes what the cost pillar means,
              so it gets the boxed treatment rather than a line in a list. */}
          <Reveal
            variant="fade"
            className="mt-10 max-w-2xl rounded-card border border-line bg-surface p-6 sm:p-7"
          >
            <h4 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              &ldquo;Custeio&rdquo; é a cota parlamentar, e só ela
            </h4>
            <div className="mt-3 flex flex-col gap-3 text-[0.95rem] leading-[1.7] text-navy-700">
              <p>
                O pilar mede o que o mandato consome para funcionar: escritório, viagem,
                combustível, alimentação, divulgação, segurança. E mede em{" "}
                <Key>fração da cota a que aquele parlamentar tem direito</Key>, não em
                reais: o teto vai de R$ 41,6 mil no Distrito Federal a R$ 58,5 mil em
                Roraima, porque paga as passagens de volta para casa. Ranquear por reais
                ranqueia a distância de Brasília.
              </p>
              <p>
                <Key>Emenda parlamentar fica de fora de propósito.</Key> Um deputado que
                destinou um bilhão de reais para escolas do seu estado não é um deputado
                caro — e um índice que somasse as duas coisas diria exatamente o contrário
                da verdade sobre ele. Por isso o pilar nunca é chamado de &ldquo;verba
                pública&rdquo; nem de &ldquo;economia&rdquo;: ele é o custo de operar o
                gabinete, e nada mais.
              </p>
            </div>
          </Reveal>

          {/* ── Posicionamento ──────────────────────────────────────────
              A seção mais longa das três, e é proporcional: é o índice com mais
              decisões de método por linha, e o único que pode errar sobre uma
              pessoa nomeada sem que nada quebre. A ordem é a da leitura — o que
              ele mede, como pesa, o que se recusa a dizer, e de onde vem a
              régua contra a qual é conferido. */}
          <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
            <div>
              <h3 className="text-[1.55rem] leading-tight">
                Índice de Posicionamento
              </h3>
              <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Onde essa pessoa está
              </p>

              <Prose>
                <p>
                  O terceiro índice não compara ninguém com ninguém: descreve uma
                  trajetória de votos em dois eixos de valor. Votar Sim empurra a pessoa
                  na direção em que a proposição foi classificada, votar Não empurra na
                  direção contrária, e o Neutro não move nada.
                </p>
                <p>
                  As definições dos dois eixos não são nossas. São as do{" "}
                  <Key>Chapel Hill Expert Survey</Key>, traduzidas e não adaptadas — a
                  régua com que a ciência política posiciona partidos há vinte e cinco
                  anos. Usar a definição de outra gente é o que permite conferir o nosso
                  resultado contra o dela, em vez de contra nós mesmos.
                </p>
                <p>
                  É o índice mais difícil dos três, e o que mais se recusa a falar. Ele
                  tem um piso de cobertura abaixo do qual não diz nada, um teste que
                  precisa passar contra si mesmo, e uma régua externa contra a qual é
                  conferido. <Key>Falhando qualquer um dos três, a leitura não
                  aparece</Key> — e o resto desta seção é o que cada um deles verifica.
                </p>
              </Prose>
            </div>

            <Reveal variant="figure" delay={120}>
              <PositioningAxes />
            </Reveal>
          </div>

          {/* Peso por votação — a correção mais importante e a mais invisível. */}
          <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
            <div>
              <h4 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Nem toda votação vale a mesma coisa
              </h4>
              <Prose>
                <p>
                  O peso de uma proposição é <Key>o quanto ela dividiu a casa</Key>. Um
                  projeto aprovado por 470 a 21 não separa ninguém de ninguém e vale zero;
                  um decidido por 260 a 231 vale quase tudo.
                </p>
                <p>
                  Isso é o que impede o índice de medir <Key>a composição da pauta</Key> em
                  vez das pessoas. A maior parte do que a Câmara aprova é aprovada por
                  quase todo mundo — um quarto das votações nominais de 2025 está na faixa
                  que vale zero. Sem esse peso, uma sequência de projetos consensuais
                  empurraria a casa inteira para o mesmo lado, e o número diria mais sobre
                  o que foi pautado do que sobre quem votou.
                </p>
              </Prose>
            </div>

            <Reveal variant="figure" delay={120}>
              <PositioningWeights />
            </Reveal>
          </div>

          {/* Governismo — o achado que reorganizou o índice inteiro. Caixa, não
              lista: é a coisa que um leitor não pode passar batido, e é também a
              que mais soa contraintuitiva antes de ser explicada. */}
          <Reveal
            variant="fade"
            className="mt-12 max-w-2xl rounded-card border border-line bg-surface p-6 sm:p-7"
          >
            <h4 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              No Brasil, votação nominal mede governo e oposição antes de medir
              esquerda e direita
            </h4>
            <div className="mt-3 flex flex-col gap-3 text-[0.95rem] leading-[1.7] text-navy-700">
              <p>
                Isto é um resultado consolidado da ciência política brasileira, não uma
                opinião nossa. Quando se extrai a principal linha de divisão das votações
                da Câmara, o que aparece não é esquerda contra direita: é{" "}
                <Key>quem está com o governo contra quem está contra</Key>.
              </p>
              <p>
                Nós medimos isso nas nossas próprias fontes, em 87 votações nominais entre
                2024 e 2025. A principal linha de divisão correlaciona{" "}
                <span className="vt-num">−0,96</span> com apoio ao governo e apenas{" "}
                <span className="vt-num">+0,49</span> com a escala de esquerda↔direita que
                a literatura usa. Ela coloca o PSOL em 14º de 18, à direita do PSDB —
                porque o PSOL se opõe ao governo Lula <em>pela esquerda</em>, e a conta lê
                oposição como direita.
              </p>
              <p>
                Classificar melhor as proposições não resolve: o sinal de coalizão está
                nos votos, não nas ementas. Então fazemos duas coisas. As votações em que
                a liderança do governo orientou a bancada{" "}
                <Key>têm o peso descontado</Key> — a Câmara publica essas orientações, e
                nós as importamos. E antes de qualquer coisa ser publicada, o índice{" "}
                <Key>é testado contra si mesmo</Key>: se a posição econômica que ele
                calcula ainda correlacionar demais com apoio ao governo, nada é publicado.
                Um índice de governismo com rótulo de ideologia é um erro silencioso por
                construção, e essa é a porta que o torna barulhento.
              </p>
            </div>
          </Reveal>

          <div className="mt-10">
            <h4 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              O que faz esse número ser honesto
            </h4>
            <div className="mt-4 max-w-2xl text-[0.95rem] leading-[1.7] text-navy-700">
              <RuleList>
                <RuleItem>
                  <Key>Sem dado, não há leitura — e não há centro.</Key> Zero, nesses
                  eixos, é a coordenada de quem está exatamente no meio; não é a de quem
                  não foi medido. Confundir as duas coisas colocaria no centro justamente
                  quem o índice não conseguiu ler, que é a pior leitura possível porque é a
                  mais plausível. Quem não tem proposições classificadas suficientes não
                  recebe figura nenhuma, e a página diz isso em vez de desenhar.
                </RuleItem>
                <RuleItem>
                  <Key>Proposição que não mede posição fica de fora, por regra
                  publicada.</Key> Homenagem, data comemorativa, denominação de rodovia,
                  requerimento de urgência, destaque, peça orçamentária. Quase 59% das
                  votações do Plenário da Câmara em 2025 são de rito, não de mérito. O
                  filtro é <em>mecânico</em> de propósito: no instante em que alguém aqui
                  escolhesse a dedo quais projetos contam, o Votto passaria a ter uma
                  ideologia — e a única defesa contra isso é não haver escolha para fazer.
                </RuleItem>
                <RuleItem>
                  <Key>A margem vem junto do número.</Key> Uma posição de −40 com margem de
                  ±25 e uma de −40 com margem de ±6 são afirmações diferentes. Ao lado de
                  cada eixo está quantas proposições o sustentam e, quando uma sozinha
                  desloca a leitura em mais de cinco pontos, o aviso de que ela existe.
                </RuleItem>
                <RuleItem>
                  <Key>O Senado não recebe posicionamento, e o motivo é aritmético.</Key>{" "}
                  Em dezoito meses ele publicou <span className="vt-num">14</span> votações
                  nominais com placar, a maioria quase unânime. O regimento é a causa: na
                  maior parte das decisões do Senado, o voto do líder vale pelo da bancada
                  e ninguém vota individualmente. Catorze votações não posicionam nem uma
                  pessoa.
                </RuleItem>
                <RuleItem>
                  <Key>Abstenção não move nada.</Key> No parlamento, abstenção e obstrução
                  são manobras de regimento sob orientação de bancada — não são opinião
                  sobre o mérito, e tratá-las como opinião seria inventar uma.
                </RuleItem>
              </RuleList>
            </div>
          </div>

          {/* Partidos — o que o usuário pediu explicitamente, e a parte com mais
              decisão de método por linha. */}
          <div className="mt-12">
            <h4 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              E os partidos
            </h4>
            <Prose>
              <p>
                Um partido não vota. Tudo o que se pode dizer dele vem dos seus
                parlamentares, e a pergunta é como somá-los. A resposta ingênua — a média
                — quebra nos dois extremos: uma bancada de noventa fica à mercê de quem
                mais votou dentro dela, e uma bancada de <em>um</em> publica a
                excentricidade de uma pessoa como se fosse a posição de um partido.
              </p>
              <p>
                O que usamos é o mesmo mecanismo por trás da nota do IMDb, e a frase é
                literal: <Key>todo partido é pontuado como se tivesse alguns membros a
                mais, parados na média da casa</Key>. Uma bancada de noventa mal os sente.
                Uma bancada de um é quase só eles. A diferença para o IMDb é que lá esse
                número de membros imaginários é escolhido, e aqui ele é calculado a partir
                do quanto os partidos de fato se espalham.
              </p>
              <p>
                Isso tem um custo conhecido, e ele é o partido genuinamente extremo, que é
                puxado para o meio junto com os demais. Por isso o deslocamento é{" "}
                <Key>limitado</Key>: nenhuma bancada é movida mais que uma margem de erro
                da sua própria média. E a média original aparece na página ao lado da
                ajustada — encolher é uma decisão de método, e uma decisão de método que
                muda o número de um partido tem de estar visível onde o número está.
              </p>
              <p>
                Ao lado da posição vem <Key>o quanto a bancada se espalha</Key>. Um partido
                em zero porque todos os seus membros estão em zero e um partido em zero
                porque metade está em cada extremo são fatos opostos com o mesmo número, e
                imprimir só a média afirma o primeiro. Na prática a diferença é enorme:
                há bancadas que votam juntas em quase toda votação e há bancadas em que
                isso acontece em dois terços delas.
              </p>
            </Prose>
          </div>

          {/* Por que ainda não há faixa — a promessa que a página não faz. */}
          <Reveal
            variant="fade"
            className="mt-12 max-w-2xl rounded-card border border-line bg-surface p-6 sm:p-7"
          >
            <h4 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Por que continuamos sem dizer &ldquo;esquerda&rdquo; ou
              &ldquo;direita&rdquo;
            </h4>
            <div className="mt-3 flex flex-col gap-3 text-[0.95rem] leading-[1.7] text-navy-700">
              <p>
                A conta que reduz os dois eixos a uma das cinco faixas do espectro existe e
                está pronta. Ela <Key>não está publicada</Key>, e isso é uma escolha, não
                um esquecimento.
              </p>
              <p>
                Para uma faixa aparecer, três portas têm de abrir: a pessoa precisa ter
                proposições classificadas suficientes; o índice inteiro precisa ter passado
                no teste contra governismo e na comparação com as réguas externas; e — a
                que mais barra — <Key>a margem de erro precisa caber dentro de uma única
                faixa</Key>. Com cinco faixas em duzentos pontos, cada uma tem quarenta; uma
                margem maior que isso significa que o rótulo seria decidido por ruído, e
                não pela pessoa.
              </p>
              <p>
                Há também um precedente que vale mais que qualquer argumento nosso. Em
                setembro de 2024 o Reino Unido aboliu a nota única das escolas — a palavra
                que resumia toda uma inspeção — por ser &ldquo;redutora&rdquo; e &ldquo;de
                baixa informação para as famílias e alto risco para as escolas&rdquo;,
                depois de um inquérito ligar o processo à morte de uma diretora. Quatro
                notas separadas substituíram a palavra única.
              </p>
              <p>
                Repare também em quem <em>dá</em> nota de faixa por aí. Os testes de
                posicionamento que atribuem um rótulo são, sem exceção, os que não
                publicam método — um deles responde, quando perguntado como calcula:
                &ldquo;temos política estrita contra divulgar essa informação&rdquo;. As
                ferramentas eleitorais levadas a sério na Alemanha, na Holanda, na Suíça e
                no Canadá publicam um número e uma ordem, e nenhuma delas batiza categoria.
              </p>
            </div>
          </Reveal>

          {/* De onde vem a régua — as fontes, linkadas. É a prática de confiança
              mais barata que existe, e a que quase nenhum produto do gênero faz. */}
          <div className="mt-10 max-w-2xl">
            <h4 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Contra o que isso é conferido
            </h4>
            <div className="mt-4 flex flex-col gap-3 text-[0.95rem] leading-[1.7] text-navy-700">
              <p>
                Um índice feito de votos e conferido contra os mesmos votos não está
                conferido — está andando em círculo. Por isso a ordenação que sai daqui é
                comparada com duas medidas construídas por outras pessoas, por outro
                método, antes de nós.
              </p>
              <p>
                A primeira é a classificação ideológica dos partidos brasileiros feita por{" "}
                <span className="vt-num">515</span> cientistas políticos em 2022 —{" "}
                <DocLink href="https://doi.org/10.7910/DVN/MFIXKW" external>
                  microdados abertos
                </DocLink>
                . A segunda é o{" "}
                <DocLink href="https://doi.org/10.7910/DVN/6KVTUV" external>
                  Brazilian Legislative Survey
                </DocLink>
                , que pergunta a parlamentares federais, sob anonimato, onde cada partido
                está. As medidas desse tipo concordam entre si acima de{" "}
                <span className="vt-num">0,94</span>; se a nossa não chegar perto disso,
                nada é publicado.
              </p>
              <p>
                Há um caso que serve de prova dos nove, e ele é público: o PL é o partido
                mais à direita do Brasil em todas as réguas disponíveis. Qualquer versão
                deste índice que o coloque no centro está errada, e é assim que a gente
                descobre.
              </p>
            </div>
          </div>
        </section>

        {/* ── Princípios ──────────────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHead
            title="Os princípios"
            lead="Quatro regras que não são negociadas por funcionalidade nenhuma."
          />
          <div className="mt-6 max-w-2xl text-[0.95rem] leading-[1.7] text-navy-700">
            <RuleList>
              <RuleItem>
                <Key>Segurança primeiro.</Key> A plataforma é construída para que um
                vazamento não exponha nada além do seu primeiro e do seu último nome.
              </RuleItem>
              <RuleItem>
                <Key>Coleta mínima.</Key> Se um dado não é indispensável para votar ou
                para calcular um índice, ele não é pedido — mesmo quando é oferecido de
                graça.
              </RuleItem>
              <RuleItem>
                <Key>Seu voto é anônimo.</Key> Nenhuma tela, API, widget ou exportação
                mostra como uma pessoa votou. O que é público são somas.
              </RuleItem>
              <RuleItem>
                <Key>Um voto por pessoa por tema.</Key> Sem isso, todo o resto —
                estatística, alinhamento, ranking — vira ficção.
              </RuleItem>
            </RuleList>
          </div>
        </section>

        {/* ── As escolhas ─────────────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHead
            title="As escolhas, e por quê"
            lead="Cada uma delas tem um custo. Estão aqui com o motivo que fez o custo valer a pena."
          />
          <div className="mt-8">
            <Choice term="Por que pedimos CPF">
              <p>
                Porque a regra da plataforma é um voto por pessoa por tema, e não existe
                no Brasil outro identificador que sirva a isso.
              </p>
              <p>
                O número não fica guardado como você o digita: ele é{" "}
                <Key>criptografado</Key>, e o que garante a unicidade é um código derivado
                dele do qual não se volta ao CPF original. Em claro ficam apenas os seis
                primeiros dígitos, que sozinhos não identificam ninguém.
              </p>
            </Choice>

            <Choice term="Por que a entrada é pelo Google, Apple ou Meta">
              <p>
                Porque assim <Key>você não cria senha no Votto</Key> — e o que não existe
                não vaza.
              </p>
              <p>
                São duas provas diferentes, e nenhuma basta sozinha: o provedor mostra que
                você controla aquela conta, mas não diz quem você é no Brasil; o CPF,
                conferido com nome e data de nascimento no registro da Receita Federal,
                diz.
              </p>
              <p>
                E vale dizer até onde isso vai. A conferência garante que o CPF{" "}
                <Key>existe, é regular e que você sabe o nome e a data de nascimento por
                trás dele</Key> — não que ele é seu. Quem sabe o CPF e o aniversário de um
                parente passa. É o ponto de partida assumido, e o próximo passo provável é
                uma confirmação bancária.
              </p>
            </Choice>

            <Choice term="Por que não guardamos seu e-mail">
              <p>
                Todos os provedores oferecem, e é tentador aceitar. Guardar seria colocar
                um segundo identificador seu dentro de um eventual vazamento, sem nenhum
                ganho para o que a plataforma faz. Também não guardamos telefone,
                endereço, foto de perfil nem lista de contatos.
              </p>
            </Choice>

            <Choice term="Por que não há comentários">
              <p>
                Porque um campo de texto muda o que está sendo medido. Passa a medir quem
                escreve melhor, quem tem mais tempo livre e quem grita mais alto.
              </p>
              <p>
                Sem ele, a única coisa que a plataforma sabe sobre a sua opinião é a mesma
                que sabe sobre a de qualquer outra pessoa: Sim, Não ou Neutro.
              </p>
            </Choice>

            <Choice term="Por que só dados oficiais">
              <p>
                Todo tema e todo voto de agente público vem da Câmara dos Deputados ou do
                Senado Federal, com o identificador oficial e o link de volta para a
                página da casa. Nada é editorializado no caminho.
              </p>
              <p>
                É o que permite a única verificação que importa:{" "}
                <Key>se um número aqui estiver errado, dá para conferir na fonte</Key>.
              </p>
            </Choice>

            <Choice term="Por que perguntamos quem representa você">
              <p>
                O voto é secreto, então a plataforma não pode perguntar em quem você
                votou. Declarar quem o representa é o análogo possível: uma afirmação do
                presente, revogável a qualquer momento.
              </p>
              <p>
                É ela que forma a <Key>base</Key> de cada agente — o grupo contra o qual o
                alinhamento publicado dele é medido. Ninguém vê o seu nome ligado a essa
                declaração, e ela vale um agente por cargo.
              </p>
            </Choice>

            <Choice term="Por que um mandato que acaba não some">
              <p>
                Um parlamentar que deixa o cargo deixa de aparecer como quem está em
                exercício, mas o registro e os votos dele permanecem. O alinhamento é
                construído sobre histórico de votação: apagar o histórico apagaria o
                índice junto.
              </p>
            </Choice>
          </div>
        </section>

        {/* ── Fontes ──────────────────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHead
            title="De onde vêm os dados"
            lead="Bases públicas, abertas e sem autenticação — as mesmas que qualquer pessoa pode consultar."
          />
          <Prose>
            <p>
              A importação é semanal e sempre pelo mesmo caminho: as proposições e as
              votações nominais de cada casa, os parlamentares e os partidos. Cada tema
              guarda o identificador oficial, a casa de origem, a situação em que se
              encontra e o endereço da sua página na fonte.
            </p>
            <p>
              As duas bases em uso hoje são a da{" "}
              <DocLink href="https://dadosabertos.camara.leg.br" external>
                Câmara dos Deputados
              </DocLink>{" "}
              e a do{" "}
              <DocLink href="https://legis.senado.leg.br/dadosabertos" external>
                Senado Federal
              </DocLink>
              . A arquitetura foi feita para receber outras — assembleias estaduais,
              câmaras municipais — assim que elas publicarem dados no mesmo formato.
            </p>
          </Prose>
        </section>

        {/* ── Fecho ───────────────────────────────────────────────────── */}
        <Reveal variant="fade" className="mt-16 border-t border-line pt-10">
          <hr className="vt-rule-ink vt-grow w-14" />
          <h2 className="vt-lift mt-4 text-[1.9rem] leading-tight" style={beat(140)}>
            Comece pelo mais simples: vote.
          </h2>
          <p
            className="vt-lift mt-3 max-w-xl text-[0.98rem] leading-relaxed text-navy-700"
            style={beat(240)}
          >
            O índice pessoal aparece já nos primeiros temas, e fica mais firme a cada
            voto. Ele não custa nada além do tempo de ler o que está em pauta.
          </p>
          <div
            className="vt-lift mt-7 flex flex-col gap-3 sm:flex-row sm:items-center"
            style={beat(340)}
          >
            <ButtonLink href="/temas" size="lg">
              Votar nos temas
            </ButtonLink>
            <ButtonLink href="/agentes" variant="ghost" size="lg">
              Ver agentes →
            </ButtonLink>
          </div>
          <p className="mt-7 text-sm text-[var(--color-muted)]">
            O detalhamento jurídico do que é guardado e do que você pode exigir de volta
            está na <DocLink href="/privacidade">Política de Privacidade</DocLink> e nos{" "}
            <DocLink href="/termos">Termos de Serviço</DocLink>.
          </p>
        </Reveal>
      </Container>
    </>
  );
}
