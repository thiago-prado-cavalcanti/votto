"use client";

/**
 * The info affordance beside the "Performance política" heading, and the sheet
 * it opens.
 *
 * A 0–100 attached to a named person has to be able to explain itself on the
 * spot. The plate beside it already shows *what* the number is made of — four
 * pillars, each with its raw figure — but not *how* those become one score, and
 * the two things a reader is most likely to get wrong live in that gap: that
 * the bars are positions among peers rather than grades, and that "custo
 * político" is what the mandate consumes and not what the parliamentarian
 * secures for their state.
 *
 * The weights are read from `QUALITY_PILLARS`, never restated here — the About
 * page kept its own copy of them and it drifted on the first rename.
 *
 * The portal/Escape/scroll-lock shell lives in `InfoSheet`, shared with the
 * per-area readings — this file is only the content.
 */
import { InfoButton, Point, Points } from "@/components/public/InfoSheet";
import { QUALITY_METHODOLOGY, QUALITY_PILLARS } from "@/lib/indexes/quality";

export function PerformanceInfo() {
  return (
    <InfoButton
      label="Como a performance política é calculada"
      title="Performance política"
    >
      <PerformanceBody />
    </InfoButton>
  );
}

function PerformanceBody() {
  return (
    <>
        <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
        O alinhamento pergunta se um parlamentar concorda{" "}
        <strong className="font-medium text-navy-900">com você</strong>. A performance
        política pergunta outra coisa, que não depende de concordar:{" "}
        <strong className="font-medium text-navy-900">se ele está fazendo o trabalho</strong>.
        São três medidas, todas tiradas do registro oficial da própria casa, e as
        três pesam igual. O método segue o manual da OCDE e do Centro Comum de
        Investigação da União Europeia para índices compostos — o mesmo que sustenta
        o Índice de Desenvolvimento Humano.
      </p>

      <Points>
        {QUALITY_PILLARS.map((pillar) => (
          <Point key={pillar.key} term={pillar.label}>
            {EXPLANATION[pillar.key] ?? ""}
          </Point>
        ))}
      </Points>

      <h3 className="mt-6 text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
        O que vale saber
      </h3>

      <Points>
        <Point term="A régua é fixa e publicada, não o melhor colega">
          Cada pilar é medido contra uma meta fixa, não contra quem foi melhor
          naquele momento. Comparecer a todas as votações vale 100; usar metade da
          cota a que se tem direito vale 100. Isso importa por um motivo prático: a
          nota de um parlamentar só muda quando <em>ele</em> muda. Antes, medindo
          contra o melhor da turma, bastava um colega apresentar o dobro de projetos
          para a nota de todos os outros cair pela metade — sem que ninguém tivesse
          feito nada diferente.
        </Point>
        <Point term="Produzir dez vezes mais não vale dez vezes a nota">
          A produção é lida em escala logarítmica, porque a distribuição é
          extremamente desigual: metade da Câmara apresenta cerca de um projeto por
          mês e alguns apresentam trinta. Numa escala linear, esses poucos achatariam
          todo o resto no rodapé — e foi o que aconteceu na versão anterior, em que o
          deputado mediano marcava 5 de 100. A consequência é deliberada: o primeiro
          projeto conta mais que o quadringentésimo.
        </Point>
        <Point term="Protocolar projetos não leva ao topo">
          Apresentar um projeto custa uma assinatura; fazer um projeto andar, não.
          Por isso a apresentação satura: sozinha, ela chega a{" "}
          <strong className="font-medium text-navy-900">80 de 100</strong> nessa
          medida e para. Os últimos vinte pontos só vêm de desfecho — projeto que
          avançou de verdade — ou de relatoria. É a defesa contra encher o gabinete
          de proposições que ninguém vai votar.
        </Point>
        <Point term="Custo político é fração da cota, não reais">
          O teto da cota varia de R$ 41,6 mil no Distrito Federal a R$ 58,5 mil em
          Roraima, porque paga as passagens de volta para casa. Ranquear por reais
          ranqueia a distância de Brasília. Aqui o pilar é a fatia da cota
          efetivamente usada — o que também corrige uma injustiça: um senador do
          Amazonas gastando 57% do que tem direito desembolsa mais reais que um do
          Distrito Federal gastando 79%.
        </Point>
        <Point term="Falhar num pilar não se compra com os outros">
          As três notas entram numa média geométrica, não numa média simples. Numa
          média simples, quem nunca aparece, quem nunca legisla e quem gasta a cota
          inteira terminavam todos com a mesma nota confortável. É o mesmo motivo pelo
          qual o Índice de Desenvolvimento Humano trocou de média em 2010.
        </Point>
        <Point term="Sem medida é sem nota, nunca zero">
          Quando falta o dado de um pilar, o peso dele é redistribuído entre os
          outros; se faltar mais da metade, não publicamos nota nenhuma. Um
          parlamentar que não deu para medir não é um parlamentar ruim, e um zero
          seria uma acusação.
        </Point>
      </Points>

      {/* The edition, stated rather than implied. Fixed goalposts stop a score
          moving when somebody else changes; this is what lets a reader tell
          that a score moved because WE changed the rules. */}
      <p className="mt-5 text-[0.8rem] leading-[1.55] text-navy-500">
        Metodologia{" "}
        <span className="vt-num text-navy-700">{QUALITY_METHODOLOGY.version}</span>, em
        vigor desde{" "}
        {new Date(`${QUALITY_METHODOLOGY.changedAt}T12:00:00`).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}
        . Pesos, metas e regras de corte só mudam com uma edição nova — e toda nota
        guarda a edição que a calculou.
      </p>

    </>
  );
}

/** One line of prose per pillar, keyed by its registry `key`. */
const EXPLANATION: Record<string, string> = {
  attendance:
    "Votações nominais a que compareceu, entre as que aconteceram enquanto ocupava a cadeira. Afastamento oficial é descontado, e sessão que ele mesmo presidiu também — quem preside está impedido de votar.",
  production:
    "O que o parlamentar pôs para andar na casa: projetos que apresentou, contando só os que legislam de fato (PL, PEC, PLP, PDL) e não requerimentos, mais os que relatou. Os que avançaram contam em dobro, e só apresentar tem teto.",
  cost: "Fatia da cota parlamentar a que tem direito que foi efetivamente usada. Aqui, gastar menos pontua mais.",
};

