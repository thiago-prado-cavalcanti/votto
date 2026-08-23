/**
 * "Metodologia" — the arithmetic behind every published number, in full.
 *
 * `/sobre` explains the three indexes to a citizen and says, in its own section
 * heading, "os índices, sem matemática". This is the other half of that promise:
 * the formulas, the constants in force, the standard errors and the conditions
 * under which the platform refuses to publish at all. A reader who wants to
 * argue with a number about a named person needs the expression that produced
 * it, not a description of it.
 *
 * Three rules this page holds itself to:
 *
 * - **Every constant is READ from the source, never typed here.** `GOALPOSTS`,
 *   the floors, the gate thresholds and the methodology stamps are imported.
 *   A methodology page carrying its own copy of the numbers is the one document
 *   guaranteed to be wrong after the next recalibration, and wrong in the most
 *   damaging way: it would be quoted.
 * - **It states what the code does, including where two readings differ.** The
 *   double-abstention rule applies to the personal index and not to the base
 *   one, because the base's stance is a continuous mean; that asymmetry is
 *   printed rather than smoothed over. A methodology page exists to be checked,
 *   and a check that the page anticipated is worth more than one it hid.
 * - **It never promises a reading the product does not print.** The five-band
 *   left↔right verdict is computed and withheld (CLAUDE.md §3.2); the page shows
 *   the gate that withholds it instead of the bands.
 *
 * Reachable only from the footer, by design — it is the appendix of the site,
 * not a destination. Nothing in the header nav, and no other page links here.
 */
import type { Metadata } from "next";
import * as React from "react";
import { Container, ButtonLink } from "@/components/ui";
import { PageIntro, SectionHead } from "@/components/public/Section";
import { Reveal } from "@/components/public/motion";
import { Key, RuleList, RuleItem, DocLink } from "@/components/public/LegalDoc";
import {
  Formula,
  Line,
  Cases,
  Var,
  Num,
  Const,
  Op,
  Txt,
  Sub,
  Sup,
  Frac,
  Fn,
  Sum,
  Sqrt,
  Paren,
  Abs,
} from "@/components/public/Formula";
import {
  GOALPOSTS,
  QUALITY_PILLARS,
  QUALITY_METHODOLOGY,
  QUALITY_BAND_RANGES,
  qualityBandLabel,
  methodologyFingerprint,
  filingCapRate,
  MIN_COVERAGE,
  MIN_ROLL_CALLS,
  MAX_LEAVE_SHARE,
  MIN_MONTHS,
  FILING_ONLY_MAX,
  PILLAR_FLOOR,
} from "@/lib/indexes/quality";
import {
  POSITIONING_AXES,
  POSITIONING_METHODOLOGY,
  MIN_DISCRIMINATION,
  MIN_EFFECTIVE_ITEMS,
  MIN_HOUSE_ITEMS,
  MIN_HOUSE_AGENTS,
  SPECTRUM_BANDS,
} from "@/lib/indexes/positioning";
import {
  MIN_ANCHOR_CORRELATION,
  MIN_ANCHOR_COVERAGE,
  MAX_GOVERNMENT_CORRELATION,
  MAX_AXIS_CORRELATION,
} from "@/lib/domain/anchors";
import { PRIORITY_BAND_RANGES, priorityBandLabel } from "@/lib/domain/priority";

export const metadata: Metadata = {
  title: "Metodologia",
  description:
    "As fórmulas dos índices do Votto: alinhamento, performance política, posicionamento, agregação partidária e prioridade — com as constantes em vigor e as condições em que nada é publicado.",
};

/** Delay of a part inside a revealed block (see the motion block in globals.css). */
const beat = (ms: number) => ({ "--vt-d": `${ms}ms` }) as React.CSSProperties;

/** PT-BR decimal, so a goalpost reads as "0,50" and not as "0.5". */
const dec = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A stored `YYYY-MM-DD` as a printed date. Noon UTC so no timezone moves the day. */
const stamp = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

/** The reading column: prose at the width a paragraph is comfortable at. */
function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex max-w-2xl flex-col gap-4 text-[0.98rem] leading-[1.75] text-navy-700">
      {children}
    </div>
  );
}

/** A named sub-part of a section — one pillar, one gate, one variant. */
function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-12">
      <h3 className="text-[1.2rem] leading-snug text-navy-900">{title}</h3>
      <div className="mt-3 flex max-w-2xl flex-col gap-3.5 text-[0.95rem] leading-[1.7] text-navy-700">
        {children}
      </div>
    </div>
  );
}

/**
 * A table of figures — constants, bands, gates.
 *
 * Same grammar as the rankings: an index column, hairline rules, no box, and the
 * numbers in the serif tabular numerals. Scrolls inside itself so a wide row
 * never pushes the document sideways.
 */
function Figures({
  caption,
  head,
  rows,
}: {
  caption?: string;
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <Reveal variant="fade" className="my-8">
      {caption ? (
        <div className="border-t-2 border-navy-900 pb-3 pt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          {caption}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-line">
              {head.map((h, i) => (
                <th
                  key={h}
                  className={`py-2 pr-4 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-navy-500 ${
                    i === 0 ? "" : "whitespace-nowrap"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-line align-top">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`py-2.5 pr-4 text-[0.86rem] leading-snug ${
                      j === 0 ? "text-navy-800" : "text-navy-700"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Reveal>
  );
}

/**
 * The masthead figure: which editions are in force.
 *
 * The page's own figures, and they have to be true (the rule `/sobre` set for
 * its plate). These are read from the two methodology stamps; alignment carries
 * none because its rule has one form and has not been retuned — which is itself
 * the honest thing to print, rather than inventing a version for it.
 */
function EditionsPlate() {
  const rows = [
    { index: "Alinhamento", edition: "sem edição", note: "média simples, sem constantes" },
    {
      index: "Performance política",
      edition: QUALITY_METHODOLOGY.version,
      note: `impressão ${methodologyFingerprint()}`,
    },
    {
      index: "Posicionamento",
      edition: POSITIONING_METHODOLOGY.version,
      note: stamp(POSITIONING_METHODOLOGY.changedAt),
    },
  ];

  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="flex items-baseline justify-between gap-4 pb-3 pt-2.5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          Edições em vigor
        </span>
        <span className="text-xs text-[var(--color-muted)]">Carimbadas em cada leitura</span>
      </figcaption>
      <ul>
        {rows.map((row) => (
          <li key={row.index} className="border-t border-line py-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[0.86rem] text-navy-800">{row.index}</span>
              <span className="vt-num text-[1.05rem] leading-none text-navy-900">
                {row.edition}
              </span>
            </div>
            <p className="mt-1 text-[0.74rem] text-[var(--color-muted)]">{row.note}</p>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The sections, in order — the summary at the top is generated from this. */
const SECTIONS = [
  { id: "notacao", title: "Notação", blurb: "O que cada símbolo quer dizer." },
  { id: "alinhamento", title: "Alinhamento", blurb: "Coincidência de voto, tema a tema." },
  {
    id: "performance",
    title: "Performance política",
    blurb: "Três pilares contra metas fixas, em média geométrica.",
  },
  {
    id: "posicionamento",
    title: "Posicionamento",
    blurb: "Dois eixos, itens pesados pela divisão que produziram.",
  },
  {
    id: "partidos",
    title: "Do parlamentar ao partido",
    blurb: "Encolhimento parcial e coesão corrigida por tamanho.",
  },
  { id: "prioridade", title: "Prioridade dos temas", blurb: "A ordenação da pauta." },
  {
    id: "recusas",
    title: "Quando nada é publicado",
    blurb: "Todos os pisos e portas, em uma tabela.",
  },
  { id: "edicoes", title: "Edições", blurb: "Como uma mudança de método fica visível." },
];

export default function MethodologyPage() {
  const camaraCap = filingCapRate("CAMARA");
  const senadoCap = filingCapRate("SENADO");

  return (
    <>
      <PageIntro
        eyebrow="Documento técnico"
        title="A matemática dos índices"
        lead={
          <>
            Todo número que o Votto publica sobre uma pessoa sai de uma conta. Esta
            página imprime as contas — as fórmulas, o que entra em cada uma, as
            constantes em vigor e as condições sob as quais a plataforma se recusa a
            publicar qualquer coisa.
          </>
        }
        figure={<EditionsPlate />}
      />

      <Container className="py-14">
        {/* ── Sumário ─────────────────────────────────────────────────── */}
        <Reveal variant="fade" className="rounded-card border border-line bg-surface p-6">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
            Nesta página
          </h2>
          <ol className="mt-4 grid list-none gap-x-8 gap-y-2.5 pl-0 sm:grid-cols-2">
            {SECTIONS.map((section, i) => (
              <li key={section.id} className="flex gap-3">
                <span className="vt-num pt-[0.15em] text-[0.72rem] text-navy-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[0.92rem] leading-snug">
                  <a
                    href={`#${section.id}`}
                    className="border-b border-navy-300 text-navy-900 transition-colors hover:border-accent-500 hover:text-accent-500"
                  >
                    {section.title}
                  </a>
                  <span className="block text-[0.8rem] text-[var(--color-muted)]">
                    {section.blurb}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Reveal>

        <Prose>
          <p>
            A versão sem matemática desta página é a{" "}
            <DocLink href="/sobre">Sobre o projeto</DocLink>, e ela é suficiente para
            entender o que cada índice mede. Aqui está o resto: o que um leitor precisa
            para <Key>refazer a conta</Key> ou para discordar dela com precisão.
          </p>
          <p>
            Nada nesta página é ilustrativo. Todas as constantes impressas aqui são lidas
            do código que calcula os índices — se uma meta for recalibrada, o número muda
            aqui no mesmo instante em que muda no cálculo. É a única forma de uma página
            de metodologia continuar verdadeira depois da primeira recalibragem.
          </p>
        </Prose>

        {/* ── 1. Notação ──────────────────────────────────────────────── */}
        <section id="notacao" className="mt-16 scroll-mt-24">
          <SectionHead
            title="Notação"
            lead="Três convenções valem para tudo o que vem depois."
          />

          <Formula
            label="Voto, em número"
            note="a única codificação usada em todos os índices"
            plain="s de Sim igual a mais um; s de Neutro igual a zero; s de Não igual a menos um."
            where={[
              {
                sym: (
                  <>
                    <Var>s</Var>
                    <Paren scale={1}>
                      <Var>v</Var>
                    </Paren>
                  </>
                ),
                def: "O voto v na reta −1…+1. Vale igualmente para o voto de um cidadão e para o voto registrado de um parlamentar.",
              },
            ]}
          >
            <Line>
              <Fn name="s">
                <Txt>Sim</Txt>
              </Fn>
              <Op>=</Op>
              <Num>+1</Num>
              <Op>;</Op>
              <Fn name="s">
                <Txt>Neutro</Txt>
              </Fn>
              <Op>=</Op>
              <Num>0</Num>
              <Op>;</Op>
              <Fn name="s">
                <Txt>Não</Txt>
              </Fn>
              <Op>=</Op>
              <Num>−1</Num>
            </Line>
          </Formula>

          <div className="mt-6 max-w-2xl text-[0.95rem] leading-[1.7] text-navy-700">
            <RuleList>
              <RuleItem>
                <Key>Números em ocre são constantes publicadas.</Key> Elas não saem da
                aritmética: são decisões de calibragem, e cada uma delas está listada na
                tabela da seção <DocLink href="#recusas">Quando nada é publicado</DocLink>.
              </RuleItem>
              <RuleItem>
                <Key>&ldquo;—&rdquo; não é zero.</Key> Quando uma medida não alcança o
                piso de cobertura, o resultado é ausência de leitura, e não uma leitura de
                valor zero. A distinção é a mais importante da página: no eixo econômico,
                zero é a coordenada de um centrista perfeito, e imprimir dado faltando
                naquela posição seria afirmar que a pessoa é moderada.
              </RuleItem>
              <RuleItem>
                <Key>Toda escala é fechada e publicada.</Key> Alinhamento e performance vão
                de 0 a 100; os eixos de posicionamento vão de −100 a +100; a prioridade de
                um tema vai de 0 a 100.
              </RuleItem>
            </RuleList>
          </div>
        </section>

        {/* ── 2. Alinhamento ──────────────────────────────────────────── */}
        <section id="alinhamento" className="mt-20 scroll-mt-24">
          <SectionHead
            title="Índice de alinhamento"
            lead="Quanto duas trajetórias de voto coincidem, sobre os temas em que as duas se manifestaram."
          />

          <Prose>
            <p>
              É a leitura principal da plataforma e a mais simples de todas: uma média de
              concordância par a par. Não há peso por tema, nota editorial nem correção
              por partido — a única decisão de método está em <Key>quais temas entram na
              conta</Key>.
            </p>
          </Prose>

          <Formula
            label="Concordância de um par"
            note="0, ½ ou 1 — ou fora da conta"
            plain="a de i igual a um menos o módulo de s de u i menos s de p i, dividido por dois; quando os dois se abstêm, o tema sai do conjunto."
            where={[
              { sym: <><Var>u</Var><Sub>i</Sub></>, def: "O seu voto no tema i." },
              { sym: <><Var>p</Var><Sub>i</Sub></>, def: "O voto do parlamentar no mesmo tema." },
              {
                sym: <Var>S</Var>,
                def: "O conjunto dos temas em que os dois votaram, já sem as duplas abstenções.",
              },
            ]}
            cite="A regra de descarte é a de euandi e smartvote para “sem opinião”. A distância ingênua sobre {−1, 0, 1} daria 1,0 — acordo perfeito — a duas abstenções, que é o comportamento mais criticado do Wahl-O-Mat."
          >
            <Cases
              rows={[
                {
                  value: (
                    <>
                      <Var>a</Var>
                      <Sub>i</Sub>
                      <Op>=</Op>
                      <Num>1</Num>
                      <Op>−</Op>
                      <Frac
                        over={
                          <Abs>
                            <Fn name="s">
                              <>
                                <Var>u</Var>
                                <Sub>i</Sub>
                              </>
                            </Fn>
                            <Op>−</Op>
                            <Fn name="s">
                              <>
                                <Var>p</Var>
                                <Sub>i</Sub>
                              </>
                            </Fn>
                          </Abs>
                        }
                        under={<Num>2</Num>}
                      />
                    </>
                  ),
                  when: "quando ao menos um dos dois se posicionou",
                },
                {
                  value: (
                    <>
                      <Var>i</Var>
                      <Op>∉</Op>
                      <Var>S</Var>
                    </>
                  ),
                  when: "quando os dois se abstiveram — o tema sai do numerador e do denominador",
                },
              ]}
            />
          </Formula>

          <Figures
            caption="Os três valores possíveis"
            head={["Situação", "Distância", "Vale"]}
            rows={[
              ["Mesma escolha", "0", <span key="a" className="vt-num">1</span>],
              [
                "Um lado neutro, o outro não",
                "1",
                <span key="b" className="vt-num">½</span>,
              ],
              ["Sim contra Não", "2", <span key="c" className="vt-num">0</span>],
              [
                "Os dois neutros",
                "0",
                <span key="d" className="text-[var(--color-muted)]">fora da conta</span>,
              ],
            ]}
          />

          <Prose>
            <p>
              A última linha é a que ninguém adivinha, porque a aritmética óbvia diz o
              contrário: a distância entre duas abstenções é zero, e uma fórmula de
              distância pura marcaria <Key>100% de acordo</Key>. Duas pessoas que se
              recusaram a tomar posição não concordaram sobre nada — e o efeito não seria
              ruído aleatório, seria inflar exatamente a leitura de quem mais se abstém.
            </p>
          </Prose>

          <Formula
            label="O índice"
            note="0–100, arredondado ao inteiro"
            plain="A igual a cem vezes a soma dos a de i dividida pelo tamanho de S."
            where={[
              {
                sym: <Abs><Var>S</Var></Abs>,
                def: "Quantos temas informaram a leitura — o número impresso ao lado do índice em toda a plataforma.",
              },
            ]}
          >
            <Line note="4,5 pontos em 6 temas = 75%">
              <Var>A</Var>
              <Op>=</Op>
              <Num>100</Num>
              <Op>×</Op>
              <Frac
                over={
                  <Sum from={<>i ∈ S</>}>
                    <>
                      <Var>a</Var>
                      <Sub>i</Sub>
                    </>
                  </Sum>
                }
                under={
                  <Abs>
                    <Var>S</Var>
                  </Abs>
                }
              />
            </Line>
          </Formula>

          <Part title="A leitura publicada: o agente contra a própria base">
            <p>
              O índice acima exige que você tenha votado. Sem sessão iniciada, a
              plataforma não pode compará-lo com ninguém — mas ainda pode fazer a pergunta
              que interessa a qualquer leitor: <Key>este parlamentar vota como votam as
              pessoas que declararam ser representadas por ele?</Key>
            </p>
            <p>
              A base de um agente é o conjunto de cidadãos que o declararam representante.
              A posição da base em um tema é a média dos votos dela, e é um número
              contínuo: não é uma escolha entre três valores, é a posição média de um
              grupo.
            </p>
          </Part>

          <Formula
            label="Alinhamento com a base"
            note="0–100 · a leitura padrão de todo agente"
            plain="A base igual a cem vezes a média, sobre os temas T, de um menos o módulo de s do voto do parlamentar menos a posição média da base, dividido por dois."
            where={[
              { sym: <Var>B</Var>, def: "A base: quem declarou aquele agente como representante." },
              {
                sym: <><Var>T</Var></>,
                def: "Os temas em que o agente votou e ao menos um membro da base votou.",
              },
              {
                sym: <><Var>b̄</Var><Sub>i</Sub></>,
                def: "A posição média da base no tema i, entre −1 e +1.",
              },
            ]}
          >
            <Line>
              <Var>b̄</Var>
              <Sub>i</Sub>
              <Op>=</Op>
              <Frac
                over={
                  <Sum from={<>c ∈ B</>}>
                    <Fn name="s">
                      <>
                        <Var>v</Var>
                        <Sub>i,c</Sub>
                      </>
                    </Fn>
                  </Sum>
                }
                under={
                  <>
                    <Var>n</Var>
                    <Sub>i</Sub>
                  </>
                }
              />
            </Line>
            <Line>
              <Var>A</Var>
              <Sub>base</Sub>
              <Op>=</Op>
              <Num>100</Num>
              <Op>×</Op>
              <Frac
                over={
                  <Sum from={<>i ∈ T</>}>
                    <Paren scale={1.5}>
                      <Num>1</Num>
                      <Op>−</Op>
                      <Frac
                        over={
                          <Abs>
                            <Fn name="s">
                              <>
                                <Var>p</Var>
                                <Sub>i</Sub>
                              </>
                            </Fn>
                            <Op>−</Op>
                            <>
                              <Var>b̄</Var>
                              <Sub>i</Sub>
                            </>
                          </Abs>
                        }
                        under={<Num>2</Num>}
                      />
                    </Paren>
                  </Sum>
                }
                under={
                  <Abs>
                    <Var>T</Var>
                  </Abs>
                }
              />
            </Line>
          </Formula>

          <div className="max-w-2xl text-[0.95rem] leading-[1.7] text-navy-700">
            <RuleList>
              <RuleItem>
                <Key>A regra da dupla abstenção não se aplica aqui</Key>, e a diferença é
                consequência da forma: a posição de uma base é uma média contínua, e só
                vale exatamente zero quando a base inteira se absteve naquele tema — caso
                em que a abstenção do parlamentar de fato acompanha a base. No índice
                pessoal, onde os dois lados são um voto só, o descarte é obrigatório.
              </RuleItem>
              <RuleItem>
                <Key>Sem base declarada, entra o eleitorado.</Key> A mesma fórmula, com{" "}
                <Var>B</Var> igual a todos os cidadãos que votaram. É um substituto, não
                uma leitura equivalente — ninguém é eleito por todo mundo — e a página
                sempre diz qual das duas está imprimindo. As duas nunca aparecem juntas.
              </RuleItem>
              <RuleItem>
                <Key>Nomes de seguidores nunca são publicados</Key>, para ninguém, em
                nenhuma circunstância. Só o total.
              </RuleItem>
            </RuleList>
          </div>

          <Formula
            label="Alinhamento de um partido"
            note="um partido não vota; quem vota são seus membros"
            plain="Para a leitura pessoal e a de eleitorado, a média simples dos agentes; para a base, a média ponderada pelo número de seguidores de cada agente."
            where={[
              { sym: <><Var>A</Var><Sub>j</Sub></>, def: "O alinhamento do agente j da bancada." },
              { sym: <><Var>f</Var><Sub>j</Sub></>, def: "Quantos cidadãos declaram o agente j como representante." },
            ]}
          >
            <Line note="leitura pessoal e de eleitorado">
              <Var>A</Var>
              <Sub>partido</Sub>
              <Op>=</Op>
              <Frac
                over={
                  <Sum>
                    <>
                      <Var>A</Var>
                      <Sub>j</Sub>
                    </>
                  </Sum>
                }
                under={<Var>m</Var>}
              />
            </Line>
            <Line note="leitura de base">
              <Var>A</Var>
              <Sub>partido</Sub>
              <Op>=</Op>
              <Frac
                over={
                  <Sum>
                    <>
                      <Var>f</Var>
                      <Sub>j</Sub>
                      <Var>A</Var>
                      <Sub>j</Sub>
                    </>
                  </Sum>
                }
                under={
                  <Sum>
                    <>
                      <Var>f</Var>
                      <Sub>j</Sub>
                    </>
                  </Sum>
                }
              />
            </Line>
          </Formula>

          <Prose>
            <p>
              A ponderação existe só na leitura de base, e por um motivo estrutural: todo
              agente enfrenta o mesmo eleitorado, então ali não há peso natural — mas as
              bases têm tamanhos diferentes, e a base de um partido é a união das bases dos
              seus membros. Um senador que fala por quatro mil cidadãos não pode contar o
              mesmo que um deputado que fala por quarenta.
            </p>
          </Prose>
        </section>

        {/* ── 3. Performance política ─────────────────────────────────── */}
        <section id="performance" className="mt-20 scroll-mt-24">
          <SectionHead
            title="Performance política"
            lead="Um indicador composto sobre três pilares, construído segundo o manual da OCDE e do Centro Comum de Investigação da União Europeia."
          />

          <Prose>
            <p>
              Este índice não depende de concordância nenhuma. Ele pergunta se a pessoa
              está fazendo o trabalho, e todas as três medidas saem do registro que as
              próprias casas publicam. A janela é a legislatura corrente — os quatro anos
              civis em curso.
            </p>
            <p>
              A decisão central é a normalização: cada pilar é medido contra uma{" "}
              <Key>meta fixa e publicada</Key>, nunca contra o melhor colega. A
              consequência é a razão inteira da escolha — a nota de um parlamentar muda
              quando a conduta dele muda, e em nenhum outro momento. É o que fazem o IDH, o
              EPI e o Índice ODS.
            </p>
          </Prose>

          <Formula
            label="Normalização por metas"
            note="a “distância a uma referência” do manual"
            plain="g de x igual ao valor cem vezes x menos pior, dividido por meta menos pior, limitado entre o piso do pilar e cem."
            where={[
              { sym: <Var>x</Var>, def: "A medida bruta do parlamentar." },
              { sym: <Txt>pior</Txt>, def: "O valor que vale a nota mínima. Congelado e publicado." },
              { sym: <Txt>meta</Txt>, def: "O valor que vale 100. Congelado e publicado." },
            ]}
            cite="OECD/JRC, Handbook on Constructing Composite Indicators, p. 28 — normalizar pelo líder do grupo “baseia-se em valores extremos que podem ser outliers não confiáveis”."
          >
            <Line>
              <Fn name="g">
                <Var>x</Var>
              </Fn>
              <Op>=</Op>
              <Txt>limita</Txt>
              <Paren scale={1.7}>
                <Num>100</Num>
                <Op>×</Op>
                <Frac
                  over={
                    <>
                      <Var>x</Var>
                      <Op>−</Op>
                      <Txt>pior</Txt>
                    </>
                  }
                  under={
                    <>
                      <Txt>meta</Txt>
                      <Op>−</Op>
                      <Txt>pior</Txt>
                    </>
                  }
                />
                <Op>,</Op>
                <Const>{PILLAR_FLOOR}</Const>
                <Op>,</Op>
                <Num>100</Num>
              </Paren>
            </Line>
          </Formula>

          <Part title={`Pilar 1 — ${QUALITY_PILLARS[0].label}`}>
            <p>
              A razão entre votações a que compareceu e votações a que{" "}
              <Key>poderia ter comparecido</Key>. O denominador desconta três coisas: as
              sessões fora do período de exercício do mandato, as cobertas por licença
              oficial, e as que o parlamentar <Key>presidiu</Key> — os dois regimentos
              barram quem está na cadeira da presidência de votar em processo aberto, então
              ler aquele voto ausente como falta é ler o oposto do que aconteceu.
            </p>
          </Part>

          <Formula
            label="Assiduidade"
            note={`metas ${dec(GOALPOSTS.attendance.floor)} → ${dec(GOALPOSTS.attendance.target)}`}
            plain="A assiduidade é g da razão entre presenças e votações elegíveis, com pior meio e meta um."
            where={[
              { sym: <Txt>elegíveis</Txt>, def: "Votações nominais da casa ocorridas com o parlamentar em exercício, fora de licença e fora da presidência da sessão." },
            ]}
          >
            <Line>
              <Var>x</Var>
              <Op>=</Op>
              <Frac over={<Txt>presenças</Txt>} under={<Txt>elegíveis</Txt>} />
              <Op>,</Op>
              <Txt>com</Txt>
              <Txt>pior</Txt>
              <Op>=</Op>
              <Const>{dec(GOALPOSTS.attendance.floor)}</Const>
              <Op>e</Op>
              <Txt>meta</Txt>
              <Op>=</Op>
              <Const>{dec(GOALPOSTS.attendance.target)}</Const>
            </Line>
          </Formula>

          <Part title={`Pilar 2 — ${QUALITY_PILLARS[1].label}`}>
            <p>
              Relatorias e proposições são <Key>um</Key> pilar, não dois: são a mesma
              coisa — o que o parlamentar fez passar pela casa — e separá-las punia a
              Câmara duas vezes, já que ela publica apenas o último relator de cada
              proposição.
            </p>
            <p>
              A medida é lida em <Key>escala logarítmica</Key>, e isso não é uma
              preferência estética. A regra de triagem do manual dispara quando a
              assimetria passa de 2 e a curtose de 3,5; a taxa de produção da Câmara mediu{" "}
              <span className="vt-num">7,20</span> e <span className="vt-num">70,81</span>.
              Winsorizar não resolve: aparar os cinco casos mais extremos ainda deixa a
              assimetria em 3,6. A consequência é deliberada e está dita aqui — o
              quadringentésimo projeto conta menos que o primeiro.
            </p>
          </Part>

          <Formula
            label="Relatorias e proposições"
            note="por mês de mandato"
            plain="A taxa r é a soma das apresentações limitadas pelo teto, mais os projetos que avançaram, mais as relatorias, dividida pelos meses de mandato; a nota é cem vezes o logaritmo de um mais r sobre alfa, dividido pelo logaritmo de um mais meta sobre alfa."
            where={[
              { sym: <Var>m</Var>, def: "Meses de mandato dentro da janela." },
              { sym: <Var>α</Var>, def: "A mediana da casa — onde a curvatura do logaritmo começa a morder. É uma taxa com unidade, não uma constante arbitrária." },
              { sym: <Var>c</Var>, def: "Teto de apresentações, derivado das metas da própria casa (abaixo)." },
            ]}
            cite="log1p(x/α) e não log(x+1): vale exatamente 0 em x = 0, então quem não apresentou nada recebe o piso sem nenhum caso especial."
          >
            <Line>
              <Var>r</Var>
              <Op>=</Op>
              <Frac
                over={
                  <>
                    <Txt>mín</Txt>
                    <Paren scale={1}>
                      <Txt>apresentados</Txt>
                      <Op>,</Op>
                      <Var>c</Var>
                      <Op>·</Op>
                      <Var>m</Var>
                    </Paren>
                    <Op>+</Op>
                    <Txt>avançados</Txt>
                    <Op>+</Op>
                    <Txt>relatorias</Txt>
                  </>
                }
                under={<Var>m</Var>}
              />
            </Line>
            <Line>
              <Var>P</Var>
              <Op>=</Op>
              <Num>100</Num>
              <Op>×</Op>
              <Frac
                over={
                  <Fn name="ln" scale={1.5}>
                    <>
                      <Num>1</Num>
                      <Op>+</Op>
                      <Frac over={<Var>r</Var>} under={<Var>α</Var>} />
                    </>
                  </Fn>
                }
                under={
                  <Fn name="ln" scale={1.5}>
                    <>
                      <Num>1</Num>
                      <Op>+</Op>
                      <Frac over={<Txt>meta</Txt>} under={<Var>α</Var>} />
                    </>
                  </Fn>
                }
              />
            </Line>
          </Formula>

          <Figures
            caption="As metas de produção, por casa — a mediana é o α da fórmula"
            head={["Casa", "Mediana", "Meta (p95)", "Teto de apresentações"]}
            rows={[
              [
                "Câmara dos Deputados",
                <Const key="a">{dec(GOALPOSTS.production.CAMARA.alpha)}</Const>,
                <Const key="b">{dec(GOALPOSTS.production.CAMARA.target, 1)}</Const>,
                <span key="c" className="vt-num">{dec(camaraCap)} /mês</span>,
              ],
              [
                "Senado Federal",
                <Const key="d">{dec(GOALPOSTS.production.SENADO.alpha)}</Const>,
                <Const key="e">{dec(GOALPOSTS.production.SENADO.target, 0)}</Const>,
                <span key="f" className="vt-num">{dec(senadoCap)} /mês</span>,
              ],
            ]}
          />

          <Prose>
            <p>
              As duas casas têm metas diferentes porque a diferença é estrutural e não
              mérito: 81 senadores dividem aproximadamente o mesmo volume de relatorias que
              513 deputados, então a taxa do senador mediano é cerca de quatro vezes a do
              deputado mediano. Uma meta única classificaria a casa, não a pessoa.
            </p>
            <p>
              O <Key>teto de apresentações</Key> existe porque protocolar um projeto custa
              uma assinatura, e fazê-lo andar não. Ele é derivado, não escolhido: é a taxa
              em que só as apresentações alcançam{" "}
              <Const>{FILING_ONLY_MAX}</Const>{" "}de 100 — o topo da faixa
              &ldquo;{qualityBandLabel.GOOD}&rdquo; — invertendo a própria fórmula do
              pilar. Desfecho e relatoria não têm teto e somam por cima.
            </p>
          </Prose>

          <Formula
            label="O teto, em forma fechada"
            note="derivado das metas, nunca fixado à parte"
            plain="c igual a alfa vezes a exponencial de oitenta centésimos vezes o logaritmo de um mais meta sobre alfa, menos um."
            cite="Derivar em vez de fixar é o que garante que recalibrar uma meta move o teto junto — as duas não podem sair de sincronia."
          >
            <Line>
              <Var>c</Var>
              <Op>=</Op>
              <Var>α</Var>
              <Op>·</Op>
              <Paren scale={1.5}>
                <Fn name="exp" scale={1.6}>
                  <>
                    <Frac over={<Const>{FILING_ONLY_MAX}</Const>} under={<Num>100</Num>} />
                    <Op>·</Op>
                    <Fn name="ln" scale={1.5}>
                      <>
                        <Num>1</Num>
                        <Op>+</Op>
                        <Frac over={<Txt>meta</Txt>} under={<Var>α</Var>} />
                      </>
                    </Fn>
                  </>
                </Fn>
                <Op>−</Op>
                <Num>1</Num>
              </Paren>
            </Line>
          </Formula>

          <Part title={`Pilar 3 — ${QUALITY_PILLARS[2].label}`}>
            <p>
              Não é uma quantia em reais: é a <Key>fatia da cota a que o parlamentar tem
              direito</Key> que ele usou. O teto da cota é publicado por estado e por casa
              e varia por um fator de 2,4, porque ele paga as passagens para casa —
              ordenar por reais ordena geografia. A razão é limitada, comparável entre
              estados e entre casas, e não precisa de nenhum grupo de comparação.
            </p>
            <p>
              O pilar é a cota parlamentar e nada mais: manutenção de escritório, viagens,
              combustível, alimentação, divulgação, segurança. <Key>Emendas
              parlamentares estão fora por decisão de método</Key> — um deputado que
              garantiu um bilhão de reais para escolas do seu estado não é um deputado
              caro, e um índice que confundisse as duas coisas diria o oposto da verdade.
            </p>
          </Part>

          <Formula
            label="Custo político"
            note={`metas ${dec(GOALPOSTS.cost.floor)} → ${dec(GOALPOSTS.cost.target)}, invertidas`}
            plain="A utilização é o gasto dividido pelos meses e pelo teto do estado; a nota é g da utilização com pior um vírgula dez e meta zero vírgula cinquenta."
            where={[
              { sym: <Txt>teto</Txt>, def: "O limite mensal publicado para aquele estado e aquela casa." },
            ]}
            cite="O piso está acima de 1,00 porque a cota acumula ao longo do ano (Ato da Mesa 43/2009, art. 13): é legítimo gastar mais que um teto mensal em um mês."
          >
            <Line>
              <Var>u</Var>
              <Op>=</Op>
              <Frac
                over={<Txt>gasto</Txt>}
                under={
                  <>
                    <Var>m</Var>
                    <Op>·</Op>
                    <Txt>teto</Txt>
                  </>
                }
              />
              <Op>,</Op>
              <Txt>com</Txt>
              <Txt>pior</Txt>
              <Op>=</Op>
              <Const>{dec(GOALPOSTS.cost.floor)}</Const>
              <Op>e</Op>
              <Txt>meta</Txt>
              <Op>=</Op>
              <Const>{dec(GOALPOSTS.cost.target)}</Const>
            </Line>
          </Formula>

          <Part title="A composição dos três">
            <p>
              Média <Key>geométrica</Key> ponderada, e não aritmética. Uma média
              aritmética é plenamente compensatória: ela dava nota idêntica e respeitável —
              63 — a quem nunca comparece, a quem nunca legisla e a quem consome a cota
              inteira. O manual mostra que agregação aditiva exige independência de
              preferências, que estes pilares não têm: o valor de mais um projeto não
              independe de o parlamentar comparecer. O IDH mudou por exatamente esse motivo
              em 2010.
            </p>
          </Part>

          <Formula
            label="O índice composto"
            note="0–100 · pesos iguais, um terço cada"
            plain="Q igual à exponencial da soma dos pesos vezes o logaritmo natural de cada pilar, dividida pela soma dos pesos medidos."
            where={[
              { sym: <><Var>x</Var><Sub>i</Sub></>, def: "A nota 0–100 do pilar i, com piso 1." },
              { sym: <><Var>w</Var><Sub>i</Sub></>, def: "O peso do pilar — um terço para cada um dos três." },
              { sym: <Var>M</Var>, def: "Os pilares que puderam ser medidos para aquele parlamentar." },
            ]}
            cite="OECD/JRC, Handbook §6.10. O piso de 1 existe porque uma média geométrica morre em zero, o que colapsaria todas as formas distintas de fracassar em um mesmo “0”."
          >
            <Line>
              <Var>Q</Var>
              <Op>=</Op>
              <Fn name="exp" scale={2}>
                <Frac
                  over={
                    <Sum from={<>i ∈ M</>}>
                      <>
                        <Var>w</Var>
                        <Sub>i</Sub>
                        <Op>·</Op>
                        <Fn name="ln">
                          <>
                            <Var>x</Var>
                            <Sub>i</Sub>
                          </>
                        </Fn>
                      </>
                    </Sum>
                  }
                  under={
                    <Sum from={<>i ∈ M</>}>
                      <>
                        <Var>w</Var>
                        <Sub>i</Sub>
                      </>
                    </Sum>
                  }
                />
              </Fn>
            </Line>
            <Line note="senão, nada é publicado">
              <Txt>cobertura</Txt>
              <Op>=</Op>
              <Frac
                over={
                  <Sum from={<>i ∈ M</>}>
                    <>
                      <Var>w</Var>
                      <Sub>i</Sub>
                    </>
                  </Sum>
                }
                under={
                  <Sum>
                    <>
                      <Var>w</Var>
                      <Sub>i</Sub>
                    </>
                  </Sum>
                }
              />
              <Op>≥</Op>
              <Const>{dec(MIN_COVERAGE)}</Const>
            </Line>
          </Formula>

          <Prose>
            <p>
              Um pilar que não pode ser medido é <Key>ausência</Key>, e o peso dele é
              redistribuído entre os outros — o que é aritmeticamente equivalente a imputar
              o pilar faltante na média geométrica dos observados. Vale saber, porque
              significa que um parlamentar cujo pilar faltante seria ruim é favorecido pela
              lacuna. Abaixo de <Const>{dec(MIN_COVERAGE)}</Const> do peso total, nada é
              publicado: meia figura afirmada como número é pior que número nenhum.
            </p>
          </Prose>

          <Figures
            caption="As faixas"
            head={["Faixa", "Intervalo", "Leitura"]}
            rows={QUALITY_BAND_RANGES.map((range) => [
              qualityBandLabel[range.band],
              <span key={range.band} className="vt-num">
                {range.max === undefined
                  ? `${range.min} – 100`
                  : `${range.min} – ${range.max - 1}`}
              </span>,
              range.band === "AVERAGE" ? "comparativa, nunca avaliativa" : "",
            ])}
          />

          <Prose>
            <p>
              Os cortes das faixas são <Key>provisórios</Key> e estão declarados como tal:
              eles antecedem as metas fixas e a média geométrica, e precisam ser
              recalibrados contra o histograma real. Os rótulos, esses, permanecem
              comparativos — &ldquo;muito acima da média&rdquo; é uma afirmação que a
              aritmética sustenta; &ldquo;excelente&rdquo; seria um veredito sobre uma
              pessoa nomeada que ela não sustenta.
            </p>
          </Prose>
        </section>

        {/* ── 4. Posicionamento ───────────────────────────────────────── */}
        <section id="posicionamento" className="mt-20 scroll-mt-24">
          <SectionHead
            title="Posicionamento"
            lead="Onde uma trajetória de votos cai em dois eixos de valor — e as três portas que decidem se isso pode ser publicado."
          />

          <Prose>
            <p>
              Os eixos são os do <Key>Chapel Hill Expert Survey</Key>, traduzidos, e a
              escolha é o que torna o resultado conferível contra uma medida externa:{" "}
              <Key>{POSITIONING_AXES.economic.negative} ↔ {POSITIONING_AXES.economic.positive}</Key>{" "}
              (LRECON) e{" "}
              <Key>{POSITIONING_AXES.social.negative} ↔ {POSITIONING_AXES.social.positive}</Key>{" "}
              (GALTAN). Não há um número único: o RILE pesa seus dois lados igualmente e o
              CHES se recusa a colapsar os dele. Um índice de uma dimensão só teria de ser{" "}
              <Key>ajustado</Key> contra uma referência externa, nunca afirmado.
            </p>
            <p>
              Este é um cálculo em lote, e a matemática obriga: pesar um tema pela divisão
              que ele produziu exige a votação da casa inteira, e encolher um partido em
              direção à média exige a distribuição de todos os partidos.
            </p>
          </Prose>

          <Part title="O peso de um item">
            <p>
              A correção mais importante do índice é invisível em uma frase: uma votação em
              que a casa votou 470 a 21 não separa ninguém. O peso de um item é a{" "}
              <Key>discriminação</Key> dele, e ela é mensurável, não adivinhável. É também
              o que neutraliza a composição da pauta — uma sequência de projetos aprovados
              por aclamação e marcados no mesmo polo deixa de empurrar a casa inteira para
              lá.
            </p>
          </Part>

          <Formula
            label="Discriminação"
            note="0 numa votação unânime, 1 numa dividida ao meio"
            plain="d igual a dois vezes o mínimo entre sim e não, dividido pela soma de sim e não."
            cite="É o parâmetro de discriminação da Teoria de Resposta ao Item, reduzido ao que se pode medir sem ajustar um modelo."
          >
            <Line>
              <Var>d</Var>
              <Op>=</Op>
              <Frac
                over={
                  <>
                    <Num>2</Num>
                    <Op>·</Op>
                    <Txt>mín</Txt>
                    <Paren scale={1}>
                      <Txt>sim</Txt>
                      <Op>,</Op>
                      <Txt>não</Txt>
                    </Paren>
                  </>
                }
                under={
                  <>
                    <Txt>sim</Txt>
                    <Op>+</Op>
                    <Txt>não</Txt>
                  </>
                }
              />
              <Op>,</Op>
              <Txt>descartado se</Txt>
              <Var>d</Var>
              <Op>&lt;</Op>
              <Const>{dec(MIN_DISCRIMINATION)}</Const>
            </Line>
          </Formula>

          <Part title="O desconto da pauta do Executivo">
            <p>
              A primeira dimensão recuperada das votações nominais brasileiras{" "}
              <Key>não é ideologia</Key>: é governo ↔ oposição. Medido em dados reais, o
              primeiro componente principal correlaciona −0,96 com governismo e +0,49 com a
              escala de especialistas, e põe o PSOL à direita do PSDB — porque o PSOL se
              opõe ao governo pela esquerda. Isso não se corrige classificando melhor os
              temas: o sinal de coalizão está nos votos, não nas ementas.
            </p>
          </Part>

          <Formula
            label="Governismo e contaminação"
            note="por parlamentar e por item"
            plain="O governismo de um parlamentar é a fração das votações em que ele votou com a orientação do bloco Governo; a contaminação de um item é o módulo da correlação de Pearson entre o lado escolhido e o governismo de quem votou."
            where={[
              { sym: <><Var>g</Var><Sub>j</Sub></>, def: "Governismo do parlamentar j, 0–100. Exige ao menos 10 oportunidades." },
              { sym: <Var>c</Var>, def: "Contaminação do item, 0–1. Exige ao menos 10 pares; sem eles é “não medido”, que não é o mesmo que “não contaminado”." },
            ]}
          >
            <Line>
              <Var>g</Var>
              <Sub>j</Sub>
              <Op>=</Op>
              <Num>100</Num>
              <Op>×</Op>
              <Frac
                over={<Txt>votos com a orientação do bloco Governo</Txt>}
                under={<Txt>votações com orientação publicada em que votou</Txt>}
              />
            </Line>
            <Line>
              <Var>c</Var>
              <Op>=</Op>
              <Abs>
                <Fn name="r">
                  <>
                    <Fn name="s">
                      <Var>v</Var>
                    </Fn>
                    <Op>,</Op>
                    <Var>g</Var>
                  </>
                </Fn>
              </Abs>
              <Txt>Pearson, entre quem votou naquele item</Txt>
            </Line>
          </Formula>

          <Formula
            label="Peso de um item para um eixo"
            note="quatro coisas distintas, multiplicadas"
            plain="w igual a d vezes um menos c, vezes a confiança da classificação, vezes a magnitude da marcação."
            where={[
              { sym: <Txt>confiança</Txt>, def: "0–1, quanto o classificador confia naquela marcação de eixo." },
              { sym: <Txt>magnitude</Txt>, def: "0–1, quanto o tema toca o eixo. A direção é o que se afirma; a magnitude é campo separado justamente por ser menos confiável." },
            ]}
            cite="Multiplicadas porque qualquer uma delas em zero torna o item inútil: uma votação unânime, uma decidida pela coalizão, uma marcação em que ninguém confia, um tema que não toca o eixo."
          >
            <Line>
              <Var>w</Var>
              <Op>=</Op>
              <Var>d</Var>
              <Op>·</Op>
              <Paren scale={1}>
                <Num>1</Num>
                <Op>−</Op>
                <Var>c</Var>
              </Paren>
              <Op>·</Op>
              <Txt>confiança</Txt>
              <Op>·</Op>
              <Txt>magnitude</Txt>
            </Line>
          </Formula>

          <Formula
            label="A leitura de um eixo"
            note="−100 a +100, ou ausência de leitura"
            plain="x igual a cem vezes a soma dos pesos vezes o sinal, dividida pela soma dos pesos, publicada apenas quando a soma dos pesos alcança o piso."
            where={[
              {
                sym: <><Var>s</Var><Sub>i</Sub></>,
                def: "O sinal do voto multiplicado pela direção da marcação do tema: +1 quando o voto empurra para o polo positivo do eixo, −1 quando empurra para o negativo. Abstenção não move nada.",
              },
              {
                sym: <Txt>itens efetivos</Txt>,
                def: "A soma dos pesos — a cobertura, medida em peso e não em contagem: oito votações unânimes somam quase nada.",
              },
            ]}
          >
            <Line>
              <Var>x</Var>
              <Op>=</Op>
              <Num>100</Num>
              <Op>×</Op>
              <Frac
                over={
                  <Sum>
                    <>
                      <Var>w</Var>
                      <Sub>i</Sub>
                      <Var>s</Var>
                      <Sub>i</Sub>
                    </>
                  </Sum>
                }
                under={
                  <Sum>
                    <>
                      <Var>w</Var>
                      <Sub>i</Sub>
                    </>
                  </Sum>
                }
              />
            </Line>
            <Line note="senão o eixo é ausência de leitura">
              <Sum>
                <>
                  <Var>w</Var>
                  <Sub>i</Sub>
                </>
              </Sum>
              <Op>≥</Op>
              <Const>{MIN_EFFECTIVE_ITEMS}</Const>
            </Line>
          </Formula>

          <Prose>
            <p>
              O piso de <Const>{MIN_EFFECTIVE_ITEMS}</Const> é medido em peso efetivo, e
              na prática pede da ordem de <Key>vinte proposições classificadas e
              disputadas</Key> por eixo. Ele vem de uma analogia com escalas de
              <em> scorecard</em>: as da ADA usam vinte votações escolhidas a dedo, e vinte
              votações reais, descontadas pela divisão média do plenário e pela confiança
              das marcações, somam algo em torno de oito unidades de peso.
            </p>
            <p>
              Os pesos vêm sempre <Key>da casa</Key>, nunca de quem está sendo medido, e
              isso não é detalhe de implementação. Estimar cidadãos e parlamentares num
              modelo conjunto faria a posição publicada de cada parlamentar depender da
              razão entre cidadãos e parlamentares na base — quer dizer, da taxa de
              cadastro da plataforma. A posição de um deputado mudaria porque o Votto ganhou
              usuários.
            </p>
          </Prose>

          <Formula
            label="Erro padrão e sensibilidade"
            note="contagem efetiva de Kish"
            plain="O número efetivo de itens é o quadrado da soma dos pesos dividido pela soma dos quadrados dos pesos; a variância é a soma ponderada dos desvios ao quadrado sobre a soma dos pesos, dividida por efetivo menos um; o erro padrão é a raiz da variância."
            where={[
              { sym: <><Var>n</Var><Sub>ef</Sub></>, def: "Com pesos iguais reduz ao familiar n; com pesos desiguais reconhece que um item que pesa dez vezes mais não são dez observações." },
              { sym: <Txt>influência</Txt>, def: "O maior deslocamento causado por deixar uma única proposição de fora, e qual foi ela. Impresso ao lado da leitura." },
            ]}
            cite="A análise de sensibilidade é obrigatória no manual OECD/JRC. Este é o recorte que interessa a um cidadão: se um projeto sozinho move o número em quinze pontos, o número é um relatório sobre aquele projeto."
          >
            <Line>
              <Var>n</Var>
              <Sub>ef</Sub>
              <Op>=</Op>
              <Frac
                over={
                  <>
                    <Paren scale={1}>
                      <Sum>
                        <>
                          <Var>w</Var>
                          <Sub>i</Sub>
                        </>
                      </Sum>
                    </Paren>
                    <Sup>2</Sup>
                  </>
                }
                under={
                  <Sum>
                    <>
                      <Var>w</Var>
                      <Sub>i</Sub>
                      <Sup>2</Sup>
                    </>
                  </Sum>
                }
              />
            </Line>
            <Line>
              <Txt>EP</Txt>
              <Op>=</Op>
              <Sqrt>
                <Frac
                  over={
                    <Sum>
                      <>
                        <Var>w</Var>
                        <Sub>i</Sub>
                        <Paren scale={1}>
                          <Var>s</Var>
                          <Sub>i</Sub>
                          <Op>−</Op>
                          <Var>x̄</Var>
                        </Paren>
                        <Sup>2</Sup>
                      </>
                    </Sum>
                  }
                  under={
                    <>
                      <Sum>
                        <>
                          <Var>w</Var>
                          <Sub>i</Sub>
                        </>
                      </Sum>
                      <Op>·</Op>
                      <Paren scale={1}>
                        <Var>n</Var>
                        <Sub>ef</Sub>
                        <Op>−</Op>
                        <Num>1</Num>
                      </Paren>
                    </>
                  }
                />
              </Sqrt>
            </Line>
            <Line note="deixa-um-projeto-de-fora">
              <Txt>influência</Txt>
              <Op>=</Op>
              <Num>100</Num>
              <Op>×</Op>
              <Txt>máx</Txt>
              <Sub>i</Sub>
              <Abs>
                <Var>x̄</Var>
                <Sub>−i</Sub>
                <Op>−</Op>
                <Var>x̄</Var>
              </Abs>
            </Line>
          </Formula>

          <Part title="As portas de publicação">
            <p>
              <Key>Nada é publicado para uma casa que não passe nas três primeiras.</Key>{" "}
              A segunda é o teste que a literatura diz que um índice como este falha em
              silêncio; a terceira é a que impede o raciocínio circular — um índice
              construído a partir de votos e validado contra os mesmos votos não está
              validado.
            </p>
            <p>
              A quarta não bloqueia nada: ela decide apenas se o <Key>segundo</Key> eixo
              sai como número próprio ou se continua alimentando só a figura.
            </p>
          </Part>

          <Figures
            caption="Portas de publicação, por casa"
            head={["Porta", "Critério", "Limiar", "Se falhar"]}
            rows={[
              [
                "1 · Cobertura",
                "Votações classificadas e divididas; agentes com leitura",
                <span key="a" className="whitespace-nowrap">
                  <Const>{MIN_HOUSE_ITEMS}</Const> itens · <Const>{MIN_HOUSE_AGENTS}</Const> agentes
                </span>,
                "a casa inteira fica sem posicionamento",
              ],
              [
                "2 · Falseamento",
                "Correlação entre o eixo econômico dos agentes e o governismo deles",
                <span key="b" className="whitespace-nowrap">
                  ≤ <Const>{dec(MAX_GOVERNMENT_CORRELATION)}</Const>
                </span>,
                "o índice está medindo apoio ao Executivo e chamando de ideologia",
              ],
              [
                "3 · Âncora externa",
                "Spearman entre a ordenação partidária e as pesquisas de especialistas",
                <span key="c" className="whitespace-nowrap">
                  ≥ <Const>{dec(MIN_ANCHOR_CORRELATION)}</Const> sobre{" "}
                  <Const>{Math.round(MIN_ANCHOR_COVERAGE * 100)}%</Const> das cadeiras
                </span>,
                "a ordenação não corresponde a nenhuma medida externa",
              ],
              [
                "4 · Colinearidade",
                "Correlação entre os dois eixos",
                <span key="d" className="whitespace-nowrap">
                  ≤ <Const>{dec(MAX_AXIS_CORRELATION)}</Const>
                </span>,
                "o eixo social alimenta a figura, mas não é publicado como número próprio",
              ],
            ]}
          />

          <Prose>
            <p>
              O piso de <Const>{dec(MIN_ANCHOR_CORRELATION)}</Const> na âncora não é
              arbitrário: as medidas brasileiras de especialistas concordam entre si a
              0,947–0,988, enquanto a análise de manifestos — a única família que a
              literatura já trata como medindo outra coisa — fica em 0,575 contra o CHES.
              O corte é o que separa a primeira família da segunda. Um partido sem âncora
              publicada simplesmente fica de fora da correlação: interpolar um valor dentro
              da régua que valida o índice faria o índice validar a interpolação.
            </p>
            <p>
              A quarta porta descreve o resultado <Key>esperado</Key> no Brasil, não uma
              anomalia: nos onze partidos brasileiros do CHES-LA, a correlação entre os dois
              eixos mede 0,94. O resíduo é real — separa a direita economicamente liberal da
              direita moral-autoritária — mas é um décimo da variância, carregado por dois
              partidos. É uma forma, não um segundo veredito.
            </p>
          </Prose>

          <Part title="Por que a faixa não é impressa">
            <p>
              As cinco faixas ({SPECTRUM_BANDS.map((b) => b.label).join(", ")}) existem no
              código e <Key>não são publicadas</Key>. Cada uma tem 40 pontos de largura
              sobre a reta de −100 a +100, então um intervalo de 95% que não caiba dentro
              de uma delas significa que o rótulo seria decidido por ruído.
            </p>
          </Part>

          <Formula
            label="A porta da faixa"
            note="além das três portas da casa"
            plain="O intervalo de x menos um vírgula noventa e seis erros padrão a x mais um vírgula noventa e seis erros padrão tem de caber inteiro dentro de uma única faixa."
            cite="Mesma ideia do “não separa” de Goldstein & Spiegelhalter sobre tabelas de liga: cerca de dois terços de todas as comparações possíveis não permitem separação."
          >
            <Line>
              <Paren scale={1.2}>
                <Var>x</Var>
                <Op>−</Op>
                <Num>1,96</Num>
                <Op>·</Op>
                <Txt>EP</Txt>
                <Op>,</Op>
                <Var>x</Var>
                <Op>+</Op>
                <Num>1,96</Num>
                <Op>·</Op>
                <Txt>EP</Txt>
              </Paren>
              <Op>⊂</Op>
              <Txt>uma única faixa</Txt>
            </Line>
          </Formula>

          <Prose>
            <p>
              O que as páginas de registro mostram no lugar do veredito são as duas leituras
              de eixo com a contagem bruta de projetos classificados, a margem e a
              proposição mais influente quando uma sozinha move o número — a convenção do
              Voteview, em que a estatística de ajuste viaja junto com a estimativa.
            </p>
          </Prose>
        </section>

        {/* ── 5. Partidos ─────────────────────────────────────────────── */}
        <section id="partidos" className="mt-20 scroll-mt-24">
          <SectionHead
            title="Do parlamentar ao partido"
            lead="Bancadas vão de 1 a 90 membros. A média simples de uma bancada de um publica a excentricidade de uma pessoa como a posição de um partido."
          />

          <Prose>
            <p>
              O Votto publica &ldquo;o quanto este partido está alinhado com você&rdquo;,
              que é uma afirmação sobre o partido <Key>como ator</Key> — existe uma posição
              latente e os membros são leituras ruidosas dela. É só isso que licencia o
              encolhimento abaixo; se a afirmação fosse a tendência central de quem hoje
              ocupa as cadeiras, a média simples seria a resposta certa.
            </p>
          </Prose>

          <Formula
            label="O modelo de dois níveis"
            note="meta-análise embaixo, encolhimento em cima"
            plain="y de i segue normal de mu de i e v de i; mu de i segue normal de teta e psi ao quadrado; teta segue normal de mu e tau ao quadrado."
            where={[
              { sym: <><Var>v</Var><Sub>i</Sub></>, def: "Variância amostral do próprio membro — o quadrado do erro padrão da leitura dele." },
              { sym: <Var>ψ</Var>, def: "Dispersão real dentro do partido, já com o ruído de medição descontado." },
              { sym: <Var>τ</Var>, def: "Espalhamento entre partidos." },
              { sym: <Var>μ</Var>, def: "A média da casa — o alvo do encolhimento." },
            ]}
          >
            <Line>
              <Var>y</Var>
              <Sub>i</Sub>
              <Op>~</Op>
              <Fn name="N">
                <>
                  <Var>μ</Var>
                  <Sub>i</Sub>
                  <Op>,</Op>
                  <Var>v</Var>
                  <Sub>i</Sub>
                </>
              </Fn>
            </Line>
            <Line>
              <Var>μ</Var>
              <Sub>i</Sub>
              <Op>~</Op>
              <Fn name="N">
                <>
                  <Var>θ</Var>
                  <Op>,</Op>
                  <Var>ψ</Var>
                  <Sup>2</Sup>
                </>
              </Fn>
            </Line>
            <Line>
              <Var>θ</Var>
              <Op>~</Op>
              <Fn name="N">
                <>
                  <Var>μ</Var>
                  <Op>,</Op>
                  <Var>τ</Var>
                  <Sup>2</Sup>
                </>
              </Fn>
            </Line>
          </Formula>

          <Formula
            label="Média observada e encolhimento"
            note="a média bayesiana conhecida do IMDb"
            plain="Os pesos são o inverso de psi ao quadrado mais v de i; a confiabilidade B é tau ao quadrado sobre tau ao quadrado mais a variância da média; a estimativa é a média da casa mais B vezes o desvio da bancada."
            where={[
              { sym: <Var>B</Var>, def: "Confiabilidade, 0–1: a fração do desvio da bancada em relação à casa que é sinal e não ruído." },
              { sym: <Var>m</Var>, def: "σ²/τ² — quantos membros fictícios, parados na média da casa, todo partido carrega." },
            ]}
            cite="A diferença para o IMDb é que ali m é escolhido e aqui é estimado dos dados, por DerSimonian–Laird: τ̂² = máx(0, (Q − (k−1)) / C)."
          >
            <Line>
              <Var>w</Var>
              <Sub>i</Sub>
              <Op>=</Op>
              <Frac
                over={<Num>1</Num>}
                under={
                  <>
                    <Var>ψ</Var>
                    <Sup>2</Sup>
                    <Op>+</Op>
                    <Var>v</Var>
                    <Sub>i</Sub>
                  </>
                }
              />
              <Op>,</Op>
              <Var>ȳ</Var>
              <Op>=</Op>
              <Frac
                over={
                  <Sum>
                    <>
                      <Var>w</Var>
                      <Sub>i</Sub>
                      <Var>y</Var>
                      <Sub>i</Sub>
                    </>
                  </Sum>
                }
                under={
                  <Sum>
                    <>
                      <Var>w</Var>
                      <Sub>i</Sub>
                    </>
                  </Sum>
                }
              />
            </Line>
            <Line>
              <Var>B</Var>
              <Op>=</Op>
              <Frac
                over={
                  <>
                    <Var>τ</Var>
                    <Sup>2</Sup>
                  </>
                }
                under={
                  <>
                    <Var>τ</Var>
                    <Sup>2</Sup>
                    <Op>+</Op>
                    <Fn name="Var">
                      <Var>ȳ</Var>
                    </Fn>
                  </>
                }
              />
              <Op>,</Op>
              <Var>θ̂</Var>
              <Op>=</Op>
              <Var>μ</Var>
              <Op>+</Op>
              <Var>B</Var>
              <Paren scale={1}>
                <Var>ȳ</Var>
                <Op>−</Op>
                <Var>μ</Var>
              </Paren>
            </Line>
            <Line note="a mesma coisa, na forma do IMDb">
              <Var>θ̂</Var>
              <Op>=</Op>
              <Frac
                over={
                  <>
                    <Var>n</Var>
                    <Var>ȳ</Var>
                    <Op>+</Op>
                    <Var>m</Var>
                    <Var>μ</Var>
                  </>
                }
                under={
                  <>
                    <Var>n</Var>
                    <Op>+</Op>
                    <Var>m</Var>
                  </>
                }
              />
            </Line>
          </Formula>

          <Part title="O limitador, e o problema Clemente">
            <p>
              Encolher minimiza o erro <em>total</em> maltratando sistematicamente o
              indivíduo genuinamente extremo. Efron mostra isso na própria série que
              popularizou o método: James–Stein ganha no agregado e{" "}
              <Key>perde para a média simples em 4 dos 18 jogadores</Key>, perdendo feio
              no caso de Roberto Clemente — o melhor rebatedor do grupo, puxado para a
              média porque a média é onde quase todo mundo está.
            </p>
            <p>
              Aqui os extremos genuínos são exatamente os partidos cuja posição é notícia.
              Por isso o encolhimento vem com o limitador de <Key>translação limitada</Key>{" "}
              de Efron &amp; Morris: o deslocamento nunca passa de um erro padrão da média
              observada. Isso limita a injustiça máxima cometida contra um partido nomeado
              a uma grandeza que dá para escrever na página — e a média observada é
              publicada ao lado da encolhida, sempre.
            </p>
          </Part>

          <Formula
            label="Translação limitada"
            note="Efron & Morris"
            plain="O módulo da diferença entre a estimativa encolhida e a média observada é no máximo um erro padrão da média observada."
          >
            <Line>
              <Abs>
                <Var>θ̂</Var>
                <Op>−</Op>
                <Var>ȳ</Var>
              </Abs>
              <Op>≤</Op>
              <Num>1</Num>
              <Op>·</Op>
              <Txt>EP</Txt>
              <Paren scale={1}>
                <Var>ȳ</Var>
              </Paren>
            </Line>
          </Formula>

          <Part title="Coesão">
            <p>
              A coesão de uma bancada é o <Key>Índice de Concordância</Key> de Hix, Noury
              &amp; Roland — e não o índice de Rice, que ignora a abstenção. Uma bancada que
              se abstém em bloco (10 sim, 10 não, 100 abstenções) marca 0,000 em Rice,
              &ldquo;completamente dividida&rdquo;, contra 0,750 aqui. Abstenção em bloco é
              disciplina partidária exibida, não colapso.
            </p>
            <p>
              E a coesão crua é <Key>enviesada pelo tamanho</Key> da bancada, muito: sob
              voto puramente aleatório, uma bancada de 2 marca 0,625 e uma de 90 marca
              0,313. Publicar sem corrigir produziria um ranking de partidos mais coesos do
              Brasil cuja ordenação é, na prática, o inverso do tamanho.
            </p>
          </Part>

          <Formula
            label="Coesão, corrigida pelo acaso"
            note="0–1, comparável entre bancadas de tamanhos diferentes"
            plain="O índice de concordância é o maior grupo menos metade do resto, sobre o total; a coesão publicada é o excesso desse índice sobre o valor esperado sob voto aleatório, normalizado."
            where={[
              { sym: <><Var>S</Var>, <Var>N</Var>, <Var>A</Var></>, def: "Votos sim, não e abstenções da bancada naquela votação." },
              { sym: <Fn name="E">{<Var>n</Var>}</Fn>, def: "O valor esperado do índice sob voto aleatório para uma bancada de n — somatório binomial exato." },
            ]}
            cite="Cuidado ao conferir contra a literatura: os valores tabelados por aí são do índice de Rice. Sem abstenções as duas escalas são a mesma reta, AI = 0,75·Rice + 0,25."
          >
            <Line>
              <Txt>AI</Txt>
              <Op>=</Op>
              <Frac
                over={
                  <>
                    <Txt>máx</Txt>
                    <Op>&#123;</Op>
                    <Var>S</Var>
                    <Op>,</Op>
                    <Var>N</Var>
                    <Op>,</Op>
                    <Var>A</Var>
                    <Op>&#125;</Op>
                    <Op>−</Op>
                    <Frac over={<Num>1</Num>} under={<Num>2</Num>} />
                    <Paren scale={1}>
                      <Txt>total</Txt>
                      <Op>−</Op>
                      <Txt>máx</Txt>
                    </Paren>
                  </>
                }
                under={<Txt>total</Txt>}
              />
            </Line>
            <Line>
              <Txt>coesão</Txt>
              <Op>=</Op>
              <Frac
                over={
                  <>
                    <Txt>AI</Txt>
                    <Op>−</Op>
                    <Fn name="E">
                      <Var>n</Var>
                    </Fn>
                  </>
                }
                under={
                  <>
                    <Num>1</Num>
                    <Op>−</Op>
                    <Fn name="E">
                      <Var>n</Var>
                    </Fn>
                  </>
                }
              />
            </Line>
          </Formula>
        </section>

        {/* ── 6. Prioridade ───────────────────────────────────────────── */}
        <section id="prioridade" className="mt-20 scroll-mt-24">
          <SectionHead
            title="Prioridade dos temas"
            lead="Nenhuma das duas casas ordena as próprias proposições. A ordenação da pauta é derivada — e o Votto diz de quê."
          />

          <Prose>
            <p>
              Este é o único índice da página que não é sobre uma pessoa: ele ordena a
              lista de temas e alimenta a etiqueta de urgência. É calculado no momento da
              importação, a partir de três sinais que as casas publicam.
            </p>
          </Prose>

          <Formula
            label="Prioridade"
            note="0–100 · recalculável sem reimportar nada"
            plain="A prioridade é a soma da base do regime, do modificador de situação e do bônus de recência, limitada entre zero e cem, e limitada a dez quando a proposição já está concluída."
            where={[
              { sym: <Txt>regime</Txt>, def: "25 a 65, pelo regime de tramitação. Medida Provisória entra no topo por prazo constitucional. O Senado não publica regime, então o vocabulário de situação dele fornece a base — sem isso nenhuma proposição do Senado poderia superar uma da Câmara." },
              { sym: <Txt>situação</Txt>, def: "−25 a +25. Estar pautado domina; já ter saído da casa é o que mais precisa de correção." },
              { sym: <Txt>recência</Txt>, def: "−8 a +10, pelo tempo desde a última movimentação oficial." },
            ]}
          >
            <Line>
              <Var>p</Var>
              <Op>=</Op>
              <Txt>limita</Txt>
              <Paren scale={1.2}>
                <Txt>regime</Txt>
                <Op>+</Op>
                <Txt>situação</Txt>
                <Op>+</Op>
                <Txt>recência</Txt>
                <Op>,</Op>
                <Num>0</Num>
                <Op>,</Op>
                <Num>100</Num>
              </Paren>
            </Line>
            <Line note="arquivo não é pauta">
              <Var>p</Var>
              <Op>≤</Op>
              <Const>10</Const>
              <Txt>quando a tramitação já terminou</Txt>
            </Line>
          </Formula>

          <Figures
            caption="As faixas de prioridade"
            head={["Faixa", "Intervalo"]}
            rows={PRIORITY_BAND_RANGES.map((range) => [
              priorityBandLabel[range.band],
              <span key={range.band} className="vt-num">
                {range.max === undefined
                  ? `${range.min} – 100`
                  : `${range.min} – ${range.max - 1}`}
              </span>,
            ])}
          />

          <Prose>
            <p>
              A base deixa folga de propósito. Trinta e cinco das 42 proposições pautadas no
              plenário da Câmara carregam algum regime de urgência — uma base alta marcaria
              praticamente o plenário inteiro como urgente, e a etiqueta deixaria de
              informar qualquer coisa.
            </p>
          </Prose>
        </section>

        {/* ── 7. Recusas ──────────────────────────────────────────────── */}
        <section id="recusas" className="mt-20 scroll-mt-24">
          <SectionHead
            title="Quando nada é publicado"
            lead="Todo piso, toda porta e todo teto em vigor, em uma tabela. Cada um deles é uma decisão de não publicar, e não uma decisão de publicar um número menor."
          />

          <Prose>
            <p>
              É a parte da metodologia que mais decide o que você vê. Um índice que sempre
              produz um número produz números sobre nada — e um zero publicado contra uma
              pessoa nomeada lê-se como acusação, não como ausência de dado.
            </p>
          </Prose>

          <Figures
            caption="Alinhamento"
            head={["Regra", "Valor", "Consequência"]}
            rows={[
              [
                "Temas em comum",
                <span key="a" className="vt-num">≥ 1</span>,
                "Sem tema em comum não há leitura pessoal — nem 0%, nem 50%.",
              ],
              [
                "Dupla abstenção",
                <span key="b" className="text-[var(--color-muted)]">descartada</span>,
                "O tema sai do numerador e do denominador da leitura pessoal.",
              ],
            ]}
          />

          <Figures
            caption="Performance política"
            head={["Regra", "Valor", "Consequência"]}
            rows={[
              [
                "Votações mínimas para medir assiduidade",
                <Const key="a">{MIN_ROLL_CALLS}</Const>,
                "Abaixo disso, uma sessão perdida move a razão em dezenas de pontos: o pilar é ausência.",
              ],
              [
                "Licença máxima na janela",
                <Const key="b">{Math.round(MAX_LEAVE_SHARE * 100)}%</Const>,
                "Acima disso a assiduidade não é medida — senão quem esteve ausente quase toda a janela pontuaria perfeitamente por duas sessões.",
              ],
              [
                "Meses mínimos de mandato",
                <Const key="c">{MIN_MONTHS}</Const>,
                "Sem eles, produção e custo não viram taxa por mês.",
              ],
              [
                "Documentos de reembolso",
                <span key="d" className="vt-num">&gt; 0</span>,
                "Zero documento é “a casa não publicou ainda”, indistinguível de R$ 0 gasto. Ler isso como frugalidade exemplar é exatamente o contrário.",
              ],
              [
                "Teto de cota do estado",
                <span key="e" className="text-[var(--color-muted)]">conhecido</span>,
                "Sem o teto publicado do estado, o custo não é medido — uma taxa contra o teto errado é pior que nenhuma.",
              ],
              [
                "Cobertura mínima dos pilares",
                <Const key="f">{Math.round(MIN_COVERAGE * 100)}%</Const>,
                "Abaixo de metade do peso total, o índice inteiro é ausência de leitura.",
              ],
              [
                "Piso de cada pilar",
                <Const key="g">{PILLAR_FLOOR}</Const>,
                "Uma média geométrica morre em zero; o piso mantém separáveis as formas distintas de fracassar.",
              ],
            ]}
          />

          <Figures
            caption="Posicionamento"
            head={["Regra", "Valor", "Consequência"]}
            rows={[
              [
                "Discriminação mínima do item",
                <Const key="a">{dec(MIN_DISCRIMINATION)}</Const>,
                "Equivale a um placar de 90/10. Abaixo disso a votação é tratada como unânime e sai da conta.",
              ],
              [
                "Peso efetivo mínimo por eixo",
                <Const key="b">{MIN_EFFECTIVE_ITEMS}</Const>,
                "Abaixo disso o eixo é ausência de leitura — nunca zero, que é a coordenada do centro.",
              ],
              [
                "Itens da casa",
                <Const key="c">{MIN_HOUSE_ITEMS}</Const>,
                "A casa inteira fica sem posicionamento. É a porta que exclui o Senado, e ela é mecânica.",
              ],
              [
                "Agentes medidos na casa",
                <Const key="d">{MIN_HOUSE_AGENTS}</Const>,
                "Abaixo disso as correlações de validação não significam nada.",
              ],
              [
                "Correlação com governismo",
                <span key="e" className="whitespace-nowrap">≤ <Const>{dec(MAX_GOVERNMENT_CORRELATION)}</Const></span>,
                "Acima, o índice mede apoio ao Executivo e a casa é bloqueada.",
              ],
              [
                "Correlação com a âncora externa",
                <span key="f" className="whitespace-nowrap">≥ <Const>{dec(MIN_ANCHOR_CORRELATION)}</Const></span>,
                `Sobre ao menos ${Math.round(MIN_ANCHOR_COVERAGE * 100)}% das cadeiras. Abaixo, nada é publicado.`,
              ],
              [
                "Correlação entre os eixos",
                <span key="g" className="whitespace-nowrap">≤ <Const>{dec(MAX_AXIS_CORRELATION)}</Const></span>,
                "Acima, o eixo social alimenta a figura mas não é publicado como número.",
              ],
              [
                "Faixa do espectro",
                <span key="h" className="text-[var(--color-muted)]">nunca</span>,
                "O veredito de cinco faixas é calculado e não é impresso: cada faixa tem 40 pontos de largura, e um rótulo decidido por ruído é pior que nenhum.",
              ],
            ]}
          />
        </section>

        {/* ── 8. Edições ──────────────────────────────────────────────── */}
        <section id="edicoes" className="mt-20 scroll-mt-24">
          <SectionHead
            title="Edições da metodologia"
            lead="Um número que muda porque a pessoa mudou e um número que muda porque o método mudou são fatos diferentes."
          />

          <Prose>
            <p>
              Metas fixas garantem que a nota de um parlamentar não se mova quando{" "}
              <Key>outra pessoa</Key> muda de conduta. Elas não garantem nada contra nós:
              recalibrar um peso move todas as leituras do site de uma vez. Por isso cada
              leitura é <Key>carimbada</Key> com a edição da metodologia que a produziu, e
              a edição é impressa ao lado do número.
            </p>
            <p>
              A edição da performance política carrega ainda uma{" "}
              <Key>impressão digital</Key>: um hash das metas, dos pesos, do conjunto de
              pilares e das constantes de ajuste. Mudar qualquer um deles sem declarar uma
              nova edição faz a verificação automática do projeto falhar — é uma disciplina
              obrigatória, não uma lembrança.
            </p>
          </Prose>

          <Figures
            caption="Em vigor agora"
            head={["Índice", "Edição", "Desde", "Resumo"]}
            rows={[
              [
                "Performance política",
                <span key="a" className="vt-num">{QUALITY_METHODOLOGY.version}</span>,
                <span key="b" className="whitespace-nowrap">{stamp(QUALITY_METHODOLOGY.changedAt)}</span>,
                <>
                  {QUALITY_METHODOLOGY.summary}{" "}
                  <span className="text-[var(--color-muted)]">
                    Impressão <span className="vt-num">{methodologyFingerprint()}</span>.
                  </span>
                </>,
              ],
              [
                "Posicionamento",
                <span key="c" className="vt-num">{POSITIONING_METHODOLOGY.version}</span>,
                <span key="d" className="whitespace-nowrap">{stamp(POSITIONING_METHODOLOGY.changedAt)}</span>,
                POSITIONING_METHODOLOGY.summary,
              ],
              [
                "Alinhamento",
                <span key="e" className="text-[var(--color-muted)]">sem edição</span>,
                <span key="f" className="text-[var(--color-muted)]">—</span>,
                "Uma média de concordância, sem constantes de calibragem. A regra de descarte da dupla abstenção é verificada automaticamente a cada alteração.",
              ],
            ]}
          />

          <Prose>
            <p>
              Duas coisas ainda são <Key>declaradamente provisórias</Key>, e é melhor
              lê-las aqui do que descobri-las depois: os cortes das faixas de performance
              antecedem as metas fixas e a média geométrica, e o piso de cobertura do
              posicionamento é o número a recalibrar primeiro contra o histograma real,
              porque é ele que decide se um eixo chega a ser publicado.
            </p>
          </Prose>
        </section>

        {/* ── Fecho ───────────────────────────────────────────────────── */}
        <Reveal variant="fade" className="mt-20 border-t border-line pt-10">
          <hr className="vt-rule-ink vt-grow w-14" />
          <h2 className="vt-lift mt-4 text-[1.9rem] leading-tight" style={beat(140)}>
            A conta está aberta. O resto é o registro.
          </h2>
          <p
            className="vt-lift mt-3 max-w-xl text-[0.98rem] leading-relaxed text-navy-700"
            style={beat(240)}
          >
            Toda leitura publicada traz, ao lado, o número bruto de que ela saiu — quantas
            votações, quantos temas, qual margem —, e cada tema guarda o link para a página
            oficial da casa. Qualquer figura desta página pode ser refeita documento por
            documento.
          </p>
          <div
            className="vt-lift mt-7 flex flex-col gap-3 sm:flex-row sm:items-center"
            style={beat(340)}
          >
            <ButtonLink href="/sobre" size="lg">
              A versão sem matemática
            </ButtonLink>
            <ButtonLink href="/agentes" variant="ghost" size="lg">
              Ver os índices aplicados →
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
    </>
  );
}
