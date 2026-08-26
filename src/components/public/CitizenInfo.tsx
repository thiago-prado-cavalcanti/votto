"use client";

/**
 * Os três "?" de `/voce`.
 *
 * Moram juntos porque respondem à mesma pergunta de três ângulos — o que esta
 * página está medindo do cidadão — e porque as ressalvas são as mesmas
 * (denominador ao lado do número, contagem e nunca traço latente). Separá-los em
 * três arquivos garantiria que um deles se desatualizasse sozinho.
 *
 * Nenhum deles é o `AlignmentInfo` da ficha de agente, e a razão não é de código:
 * lá a leitura publicada é do parlamentar contra a base **dele** e a folha gasta
 * um ponto inteiro explicando base↔eleitorado (§3.1). Aqui não existe essa
 * escolha — a comparação é sempre a mesma pessoa contra cada parlamentar —, e
 * carregar aquela explicação obrigaria o leitor a descartar metade dela.
 */
import { InfoButton, Point, Points } from "@/components/public/InfoSheet";
// `agreement.ts` é o módulo puro justamente para isto: a regra de concordância
// pode ser importada por um componente de cliente. `citizen.ts` não pode — fala
// com o banco —, então os dois pisos que moram lá chegam por parâmetro, vindos
// da página. Digitá-los aqui criaria a segunda cópia que o §2 proíbe: a folha
// que explica uma constante não pode ser a que a desmente.
import { MIN_ALIGNMENT_BASIS } from "@/lib/indexes/agreement";

/**
 * O "?" de "Quem vota como você".
 *
 * Dois pontos aqui são obrigatórios e não decorativos. O primeiro é a dupla
 * abstenção: sem a regra, a conta ingênua dá **acerto perfeito** para duas
 * pessoas em que nenhuma quis opinar. O segundo é o empate — com poucos temas em
 * comum, 100% quer dizer "cinco de cinco", que é sorte tanto quanto alinhamento,
 * e a lista imprime o denominador em cada linha justamente para não esconder
 * isso.
 */
export function RankingInfo({ rankSize }: { rankSize: number }) {
  return (
    <InfoButton
      label="Como este ranking é calculado"
      title="Quem vota como você"
    >
      <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
        De cada projeto que você e um parlamentar votaram, a conta é simples:{" "}
        <strong className="font-medium text-navy-900">
          votaram igual ou não
        </strong>
        . O resultado é a fatia em que votaram igual, de 0 a 100%. Só entram
        projetos que os dois votaram — nunca supomos como alguém teria votado.
      </p>

      <Points>
        <Point term="Cada casa é uma conta separada">
          Um deputado vota projetos da Câmara e um senador vota projetos do
          Senado. Comparar você com um senador usando um projeto que só a Câmara
          votou seria inventar o voto dele. Por isso as abas são separadas, e
          por isso uma delas pode ficar vazia enquanto a outra já tem lista.
        </Point>
        <Point term="Quando os dois se abstêm, o projeto sai da conta">
          Duas pessoas que não quiseram opinar não concordaram sobre nada.
          Contar isso como acerto — que é o que a conta ingênua faz — daria a
          maior concordância a quem mais se absteve. Se só um se absteve, vale
          meio: um lado se posicionou e o outro não foi contra.
        </Point>
        <Point term="O número vem sempre com quantos temas ele tem por trás">
          A leitura precisa de pelo menos {MIN_ALIGNMENT_BASIS} projetos em
          comum para existir, e no começo quase todo mundo fica perto desse piso
          — 100% ali quer dizer {MIN_ALIGNMENT_BASIS} de {MIN_ALIGNMENT_BASIS},
          e dezenas de parlamentares empatam. É por isso que cada linha traz os
          temas em comum ao lado da porcentagem, e por isso os {rankSize}{" "}
          primeiros mudam bastante nos primeiros votos.
        </Point>
        <Point term="O partido é a média dos parlamentares dele que dá para medir">
          Só entram os que têm projetos em comum com você — o denominador de
          cada linha diz quantos são. Uma bancada pequena chega ao topo com
          facilidade, porque ali a média é de uma ou duas pessoas: leia o
          partido junto com esse número, nunca sozinho.
        </Point>
        <Point term="Concordar não é o mesmo que fazer o trabalho">
          Um parlamentar que nunca aparece, não propõe nada e gasta a cota
          inteira pode estar 100% alinhado com quem pensa como ele. Quem mede
          isso é a performance política, na ficha de cada um, que não depende de
          concordar com ninguém.
        </Point>
      </Points>
    </InfoButton>
  );
}

/**
 * O "?" de "Quem representa você".
 *
 * A pergunta que a ação levanta não é "como funciona" e sim "o que vocês fazem
 * com isso" — daí a folha começar pela consequência (a base do parlamentar) e
 * não pela mecânica. O ponto sobre privacidade não é rodapé: acompanhar é
 * opinião política, e o compromisso de nunca publicar quem segue quem é o que
 * torna a declaração possível.
 */
export function FollowsInfo() {
  return (
    <InfoButton
      label="O que é acompanhar um parlamentar"
      eyebrow="O que isto significa"
      title="Quem representa você"
    >
      <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
        O voto é secreto, então a plataforma não pode perguntar em quem você
        votou. Acompanhar é o que ela pode perguntar:{" "}
        <strong className="font-medium text-navy-900">
          quem representa você agora
        </strong>{" "}
        — uma declaração no presente, que você desfaz quando quiser.
      </p>

      <Points>
        <Point term="É o que cria a base de um parlamentar">
          Quem acompanha alguém forma a base dessa pessoa, e a ficha dela passa
          a publicar o quanto os votos dela acompanham o que essa base pensa,
          tema a tema. Sem ninguém acompanhando, a comparação recai sobre todos
          os cidadãos que votaram — e ninguém é eleito por todo mundo.
        </Point>
        <Point term="Um por cargo, como na urna">
          Um deputado federal, um senador. Onde já existe escolha, o botão some
          das outras fichas daquele cargo e no lugar dele aparece o nome de quem
          ocupa a vaga, com link — trocar continua a um clique, sem a plataforma
          fingir que dá para acompanhar dois deputados.
        </Point>
        <Point term="Só quem está em exercício">
          Mandato encerrado não pode ser acompanhado. Se o de alguém que você
          acompanha terminar, a declaração fica guardada e aparece na sua Conta
          para você refazer.
        </Point>
        <Point term="O total é público; quem são, nunca">
          Para ninguém, em nenhuma circunstância. Acompanhar é opinião política,
          e o consentimento é pedido em separado, na própria folha que abre
          quando você escolhe.
        </Point>
      </Points>
    </InfoButton>
  );
}

/**
 * O "?" de "Você e o governo".
 *
 * A ressalva que não pode faltar é a mesma do §3.2, e pelo mesmo motivo: sem
 * ela o leitor conclui "ideologia" sozinho. Quem se opõe pela esquerda e quem se
 * opõe pela direita produzem o mesmo número, o que torna o número inútil como
 * espectro e fiel como contagem.
 *
 * A segunda ressalva é desta página e não existe na ficha do agente: os dois
 * números têm denominadores diferentes — votações lá, temas aqui — e por isso
 * não se comparam direto.
 */
export function CitizenGovernismoInfo({ floor }: { floor: number }) {
  return (
    <InfoButton label="Como esta contagem é feita" title="Você e o governo">
      <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
        Em cada votação, a bancada do governo publica como orientou os seus.
        Esta é a fatia dos seus votos que{" "}
        <strong className="font-medium text-navy-900">
          coincidiu com essa orientação
        </strong>{" "}
        — uma contagem sobre documentos públicos, não uma estimativa.
      </p>

      <Points>
        <Point term="Mede coincidência com o Executivo, não ideologia">
          Nunca leia isto como espectro. Quem se opõe ao governo pela esquerda e
          quem se opõe pela direita aparecem no mesmo lugar aqui, por razões
          opostas — e é justamente por isso que a plataforma não põe faixas nem
          adjetivos neste número.
        </Point>
        <Point term="Não compare direto com o número de um parlamentar">
          O dele conta votações; o seu conta temas. Um projeto pode ir ao
          plenário várias vezes, e lá cada ida conta uma vez — aqui, o seu voto
          no tema conta uma só. São a mesma pergunta, não a mesma conta.
        </Point>
        <Point term="Só entram temas em que o governo orientou">
          Onde a bancada liberou o voto, ou não orientou, não há com o que
          coincidir. Por isso o denominador impresso ao lado costuma ser bem
          menor que o total de temas que você votou — e abaixo de {floor} temas
          orientados não há leitura nenhuma.
        </Point>
      </Points>
    </InfoButton>
  );
}
