"use client";

/**
 * O "?" do bloco Alinhamento.
 *
 * A placa ao lado publica **uma** leitura, e qual delas depende do agente:
 * contra a base, quando alguém o declarou representante; contra o eleitorado,
 * quando ninguém o fez (`publicReading`, §3.1). O título muda junto — e é
 * exatamente por isso que a diferença precisa de um lugar para ser explicada:
 * dois agentes lado a lado podem estar exibindo denominadores diferentes.
 *
 * O ponto que mais custa caro se ficar de fora é a dupla abstenção. Sem a regra,
 * a conta ingênua dá **1,0 — acerto perfeito** para duas pessoas que nenhuma
 * delas quis opinar, e infla a leitura de quem mais se abstém.
 */
import { InfoButton, Point, Points } from "@/components/public/InfoSheet";

export function AlignmentInfo() {
  return (
    <InfoButton
      label="Como o alinhamento é calculado"
      title="Alinhamento"
    >
      <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
        De cada projeto que os dois votaram, a conta é simples:{" "}
        <strong className="font-medium text-navy-900">votaram igual ou não</strong>. O
        resultado é a fatia em que votaram igual, de 0 a 100%. Só entram projetos que os dois
        votaram — nunca supomos como alguém teria votado.
      </p>

      <Points>
        <Point term="Com a base, ou com os eleitores">
          Quando cidadãos declaram que um parlamentar os representa, eles são a{" "}
          <strong className="font-medium text-navy-900">base</strong> dele, e a leitura compara o
          voto dele com o dessas pessoas. Sem ninguém, a comparação recai sobre o conjunto dos
          cidadãos que votaram na plataforma. Nunca as duas ao mesmo tempo: respondem à mesma
          pergunta, e imprimir as duas seria pedir ao leitor que arbitrasse. O título diz qual
          está valendo.
        </Point>
        <Point term="Quando os dois se abstêm, o projeto sai da conta">
          Duas pessoas que não quiseram opinar não concordaram sobre nada. Contar isso como
          acerto — que é o que a conta ingênua faz — daria a maior concordância a quem mais se
          absteve. Se só um se absteve, vale meio: um lado se posicionou e o outro não foi
          contra.
        </Point>
        <Point term="Quem segue é contado, nunca nomeado">
          O total de seguidores é público; quem são, não é — para ninguém, nunca. E seguir é
          revogável: é uma declaração no presente, não um voto passado.
        </Point>
        <Point term="Concordar não é o mesmo que fazer o trabalho">
          Um parlamentar que nunca aparece, não propõe nada e gasta a cota inteira pode estar
          100% alinhado com quem pensa como ele. Quem mede isso é a performance política, que
          não depende de concordar com ninguém.
        </Point>
      </Points>
    </InfoButton>
  );
}
