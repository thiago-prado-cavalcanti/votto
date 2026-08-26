"use client";

/**
 * O "?" do bloco Posicionamento.
 *
 * ── A folha que mais precisa existir ────────────────────────────────────────
 *
 * O bloco publica `governismo` — quantas vezes o parlamentar votou como o bloco
 * `Governo` foi orientado — e é a leitura mais fácil de ler errado do site
 * inteiro, porque parece um eixo esquerda↔direita e não é. Um deputado do PSOL e
 * um do NOVO podem marcar 20% pelos motivos opostos.
 *
 * §3.2 é explícito: a legenda dessa advertência tem de estar **ao lado do
 * número**, porque sem ela o leitor conclui "ideologia" sozinho — que é o erro
 * que o portão de falsificação recusa cometer na matemática e que a interface
 * cometeria à mão.
 *
 * ── Por que os eixos não aparecem ───────────────────────────────────────────
 *
 * Não é obra em andamento: é resultado. Três testes independentes reprovaram o
 * índice de espectro para votação nominal brasileira (âncora 0,75 contra 0,85
 * exigidos; a fronteira (ρ, governismo) nunca entra na região permitida; e a
 * estabilidade entre mandatos deu 0,32 contra os 0,81–0,92 da literatura). A
 * página diz isso em vez de deixar um vazio que parece bug.
 */
import { InfoButton, Point, Points } from "@/components/public/InfoSheet";

export function PositioningInfo() {
  return (
    <InfoButton
      label="O que o posicionamento mede, e o que não mede"
      eyebrow="Como é medido"
      title="Posicionamento"
    >
      <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
        O que se publica aqui é uma <strong className="font-medium text-navy-900">contagem</strong>
        : em quantas votações o parlamentar votou como o bloco do Governo foi orientado a votar.
        A orientação é publicada pela própria Casa, votação por votação — não é interpretação
        nossa.
      </p>

      <Points>
        <Point term="Isto não é esquerda e direita">
          É a coisa mais importante desta folha. Um deputado do PSOL e um do NOVO podem votar
          contra o governo na mesma proporção{" "}
          <strong className="font-medium text-navy-900">por motivos opostos</strong> — um pela
          esquerda, outro pela direita — e sair com o mesmo número. Governismo mede apoio ao
          Executivo do momento, e nada além disso.
        </Point>
        <Point term="Sem faixas e sem adjetivos">
          Não chamamos ninguém de “governista”. A palavra é uma acusação e transformaria uma
          contagem em julgamento. O número aparece cru, com o total de votações ao lado — “78%” e
          “78% de 312 votações” são afirmações diferentes.
        </Point>
        <Point term="Muda de sentido quando muda o presidente">
          O mesmo parlamentar, votando exatamente igual, troca de lado quando a Presidência
          troca de mãos. É por isso que o número nunca deve ser lido como um traço da pessoa, e
          por isso ele vale para um mandato de cada vez.
        </Point>
        <Point term="Por que não há um eixo Estado↔Mercado aqui">
          Nós construímos esse eixo e ele{" "}
          <strong className="font-medium text-navy-900">não passou nos testes</strong>. Em três
          verificações independentes — comparação com pesquisas de especialistas, separação do
          governismo, e estabilidade da leitura entre mandatos — a medida ficou abaixo do que a
          literatura exige. A primeira dimensão de uma votação nominal brasileira é governo
          contra oposição, não ideologia. Publicar um espectro assim mesmo seria imprimir apoio
          ao Executivo com o rótulo de ideologia, e preferimos não publicar.
        </Point>
        <Point term="Abstenção e ausência não contam como voto contra">
          Só entram as votações em que o parlamentar votou e em que havia orientação do bloco.
          Quem presidiu a sessão está impedido de votar e sai da conta. Abaixo de dez votações
          com orientação, não há leitura nenhuma.
        </Point>
      </Points>

      <p className="mt-5 text-[0.8rem] leading-[1.55] text-navy-500">
        No Senado a orientação de bancada é registrada em cerca de um terço das votações
        nominais, contra quase todas na Câmara — regimento, não falha de dados. Por isso o
        denominador viaja sempre junto do número, e um senador não deve ser comparado a um
        deputado como se as duas contas tivessem a mesma base.
      </p>
    </InfoButton>
  );
}
