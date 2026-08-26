"use client";

/**
 * O "?" das duas leituras por área.
 *
 * As duas moram na mesma folha porque **a confusão é entre elas**: a figura é a
 * mesma, e a primeira pessoa que viu o protótipo da concordância leu o eixo como
 * dedicação ao assunto — que é exatamente o que a outra mede. Explicar cada uma
 * separadamente deixaria a diferença sem dono. Aqui elas aparecem lado a lado, e
 * é a comparação que responde.
 *
 * A folha também é onde vive a regra que mais parece defeito: as fatias somam
 * mais de 100%. Estava numa legenda de rodapé, numa coluna de 23rem, abaixo da
 * dobra — ou seja, escrita e não lida.
 */
import { InfoButton, Point, Points } from "@/components/public/InfoSheet";

export function AreaInfo({ kind }: { kind: "agreement" | "authorship" }) {
  const authorship = kind === "authorship";

  return (
    <InfoButton
      label={
        authorship
          ? "Como a autoria por área é medida"
          : "Como a concordância por área é medida"
      }
      eyebrow={authorship ? "Como é medida" : "Como é calculada"}
      title={authorship ? "Propostas" : "Alinhamento por área"}
    >
      <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
        {authorship ? (
          <>
            Das propostas que o parlamentar apresentou neste mandato, quantas são de cada
            área. É uma <strong className="font-medium text-navy-900">contagem</strong>, não uma
            estimativa: cada fatia se defende proposta a proposta, na lista da própria Câmara.
          </>
        ) : (
          <>
            Cada eixo é a fatia dos projetos daquela área{" "}
            <strong className="font-medium text-navy-900">em que vocês dois votaram</strong> e
            votaram igual. É contagem sobre votação nominal publicada, não estimativa.
          </>
        )}
      </p>

      <Points>
        <Point term="Um projeto conta em cada área que toca">
          As casas classificam por assunto e uma proposta costuma ter mais de um: saneamento é
          saúde <em>e</em> infraestrutura, e conta nas duas. Por isso as fatias{" "}
          <strong className="font-medium text-navy-900">somam mais de 100%</strong> — não é erro
          de conta, e não é para ser lido como uma pizza. Na Câmara a média é de 2,16 assuntos
          por proposta.
        </Point>

        {authorship ? (
          <>
            <Point term="Apresentar é escolha; votar não é">
              O que um parlamentar vota é a pauta que a Mesa montou — medimos, e a distribuição
              de votos por área varia só ±5 pontos entre os 623 deputados, porque descreve a
              pauta e não a pessoa. O que ele <em>apresenta</em> é escolha dele, e é o que esta
              leitura mostra.
            </Point>
            <Point term="É o que ele apresentou, não o que relatou">
              Contam PL, PEC, PLP e PDL protocolados por ele neste mandato. Relatoria fica de
              fora — relatar é encargo distribuído pela Casa, não escolha. Requerimentos,
              homenagens e pedidos de informação também ficam: são atos de tramitação, não
              propostas de lei. A lista de “Temas de autoria e relatoria”, acima, é o outro
              recorte e inclui as duas coisas.
            </Point>
            <Point term="Poucas propostas, nenhuma figura">
              Abaixo de dez propostas no total não desenhamos o perfil. Com seis, cada fatia só
              pode assumir sete valores, e o desenho viraria ruído com cara de perfil. A
              contagem continua na página, porque ela continua verdadeira.
            </Point>
            <Point term="Não diz se o parlamentar é bom naquilo">
              É volume, não qualidade e não resultado. Quantas propostas ele apresentou sobre
              saúde — não se algum virou lei, e não se são bons. Para isso há a performance
              política, que mede desfecho.
            </Point>
          </>
        ) : (
          <>
            <Point term="Não é o quanto ele se dedica ao assunto">
              É concordância, e só. Um parlamentar pode aparecer com 90% em Ambiente tendo
              votado três projetos de ambiente na vida — o eixo diz que vocês pensaram igual
              neles, não que ele trabalha com o tema.
            </Point>
            <Point term="Quando os dois se abstêm, o projeto sai da conta">
              Duas pessoas que não quiseram opinar não concordaram sobre nada. O projeto sai do
              numerador e do denominador — se contasse como acerto, quem mais se abstém teria a
              maior concordância.
            </Point>
            <Point term="Eixo tracejado é ausência, não zero">
              Área com menos de cinco projetos votados pelos dois não recebe leitura. Com dois
              projetos só dá para dizer 0%, 50% ou 100%, e nenhum dos três é uma afirmação sobre
              alguém.
            </Point>
          </>
        )}
      </Points>

      <p className="mt-5 text-[0.8rem] leading-[1.55] text-navy-500">
        As áreas vêm da classificação oficial das próprias casas — os assuntos que a Câmara e o
        Senado atribuem a cada projeto —, agrupados em nove. Nenhum projeto é classificado por
        nós.
      </p>
    </InfoButton>
  );
}
