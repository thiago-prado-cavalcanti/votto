/**
 * Terms of service.
 *
 * Required by Meta (a Facebook Login app cannot go Live without a Terms of
 * Service URL) and, more to the point, required by what Votto is: a private
 * platform that looks like a civic institution and shows numbers about named
 * politicians. Two things therefore have to be said plainly and early, before
 * anything else:
 *
 *   1. **A vote here has no legal or electoral effect.** Votto is not a
 *      government channel, not a plebiscite, not connected to the TSE. A reader
 *      who confuses the two is the single worst outcome this document can
 *      allow, so it is the first clause and it is in the summary box.
 *   2. **The indexes are calculations, not verdicts.** They are only as good as
 *      their inputs and their method, and the method will change.
 *
 * Everything else here follows from the code: eligibility mirrors the age gate
 * in `citizen-cpf.ts`, one-account-per-CPF mirrors the `cpfHash` unique key, and
 * the official-data clause mirrors what the importers actually do.
 */
import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { PageIntro } from "@/components/public/Section";
import { Reveal } from "@/components/public/motion";
import {
  Clause,
  ContactLink,
  DocBody,
  DocLink,
  DocSummary,
  Key,
  RuleItem,
  RuleList,
} from "@/components/public/LegalDoc";
import { CONTROLLER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Termos de Serviço",
  description:
    "As regras de uso do Votto: o que a plataforma é, o que ela não é, e o que se espera de quem usa.",
};

export default function TermsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Documento"
        title="Termos de Serviço"
        lead={
          <>
            As regras de uso do Votto — e, antes delas, o que esta plataforma é e o que
            ela deliberadamente não é.
          </>
        }
      >
        <p className="text-sm text-navy-600">
          Última atualização: {CONTROLLER.updatedAt}
        </p>
      </PageIntro>

      <Container className="py-14">
        <DocBody>
          <DocSummary>
            <li>
              <Key>Votar aqui não tem efeito legal nem eleitoral.</Key> O Votto é uma
              plataforma privada, sem qualquer vínculo com o governo, o TSE ou o
              Congresso.
            </li>
            <li>
              <Key>Uma conta por CPF</Key>, a partir de {CONTROLLER.minimumAge} anos.
            </li>
            <li>
              <Key>Os dados sobre agentes públicos são oficiais</Key> — vêm da Câmara e
              do Senado, e não os alteramos.
            </li>
            <li>
              <Key>Os índices são cálculos, não julgamentos.</Key> A metodologia é
              pública e vai mudar.
            </li>
            <li>
              <Key>O uso é gratuito</Key> e a plataforma está em fase inicial: pode sair
              do ar e pode mudar.
            </li>
          </DocSummary>

          <Clause n={1} title="O Votto não substitui nada do processo democrático">
            <p>
              Esta é a cláusula mais importante do documento. O Votto é uma plataforma{" "}
              <Key>privada e independente</Key>, sem vínculo, convênio ou autorização de
              qualquer órgão público.
            </p>
            <p>
              Um voto registrado aqui <Key>não produz efeito jurídico, eleitoral ou
              administrativo algum</Key>. Não é plebiscito, não é referendo, não é
              consulta pública oficial, não é urna eletrônica e não conversa com o
              Tribunal Superior Eleitoral. Ele expressa a sua opinião dentro desta
              plataforma, e só.
            </p>
            <p>
              A proposta do Votto é ser um <Key>complemento</Key> à democracia
              representativa: um canal a mais para você se expressar e para medir o
              quanto os seus representantes convergem com você. Nada aqui dispensa votar
              nas eleições oficiais.
            </p>
          </Clause>

          <Clause n={2} title="Quem pode usar">
            <p>
              Navegar por temas, agentes públicos e partidos é livre e não exige cadastro.
            </p>
            <p>Para votar, é preciso:</p>
            <RuleList>
              <RuleItem>
                ter no mínimo <Key>{CONTROLLER.minimumAge} anos</Key> — a mesma idade em
                que o voto se torna facultativo no Brasil;
              </RuleItem>
              <RuleItem>
                ter um <Key>CPF regular</Key>, confirmado no registro oficial da Receita
                Federal junto com a sua data de nascimento;
              </RuleItem>
              <RuleItem>
                entrar por uma conta Apple, Google ou Meta que seja <Key>sua</Key>.
              </RuleItem>
            </RuleList>
            <p>
              <Key>Uma pessoa, uma conta.</Key> O CPF é o que garante isso: você pode
              vincular várias contas sociais ao mesmo CPF e entrar por qualquer uma
              delas, mas continua sendo um único eleitor, com um voto por tema.
            </p>
          </Clause>

          <Clause n={3} title="O que você se compromete a não fazer">
            <RuleList>
              <RuleItem>
                Usar CPF de terceiro, ou se passar por outra pessoa.
              </RuleItem>
              <RuleItem>
                Criar ou tentar criar mais de uma conta para a mesma pessoa.
              </RuleItem>
              <RuleItem>
                Automatizar votos, usar robôs, scripts ou qualquer meio de votação em
                massa.
              </RuleItem>
              <RuleItem>
                Vender, comprar, alugar ou coordenar votos dentro da plataforma.
              </RuleItem>
              <RuleItem>
                Tentar burlar limites técnicos, obter acesso não autorizado ou
                sobrecarregar a infraestrutura.
              </RuleItem>
            </RuleList>
            <p>
              Fraudar a unicidade do voto é o único jeito de destruir o valor desta
              plataforma para todo mundo. Contas envolvidas nisso são{" "}
              <Key>bloqueadas</Key>, e os votos afetados podem ser desconsiderados dos
              totais.
            </p>
          </Clause>

          <Clause n={4} title="Dados oficiais sobre agentes públicos e partidos">
            <p>
              As informações sobre parlamentares, partidos, proposições e votações
              nominais vêm das APIs públicas de dados abertos da{" "}
              <DocLink href="https://dadosabertos.camara.leg.br" external>
                Câmara dos Deputados
              </DocLink>{" "}
              e do{" "}
              <DocLink href="https://legis.senado.leg.br/dadosabertos" external>
                Senado Federal
              </DocLink>
              . São <Key>atos públicos de agentes públicos</Key>, e cada registro guarda
              um link de volta à fonte oficial.
            </p>
            <p>
              Não editamos o conteúdo oficial. Se um dado estiver errado ou desatualizado
              na fonte, ele chega errado aqui — a correção precisa acontecer na origem, e
              é replicada na sincronização seguinte. Encontrou uma divergência? Escreva
              para <ContactLink />.
            </p>
            <p>
              Resumos de temas gerados com apoio de inteligência artificial são{" "}
              <Key>auxílio de leitura, não texto oficial</Key>. Em qualquer divergência,
              vale o documento original, sempre linkado.
            </p>
          </Clause>

          <Clause n={5} title="Os índices são cálculos, não veredictos">
            <p>
              O Índice de Alinhamento compara os seus votos com os votos registrados de
              cada agente público, sobre o conjunto de temas em que <Key>ambos</Key> se
              posicionaram. É aritmética sobre registros públicos — não é nota, não é
              avaliação de desempenho e não é juízo sobre ninguém.
            </p>
            <p>
              Uma consequência que vale entender: um agente com poucos votos em comum com
              você pode aparecer com alinhamento alto ou baixo por pouca evidência. O
              número mostra o que existe, não o que falta.
            </p>
            <p>
              A metodologia é pública e <Key>vai mudar</Key> conforme a plataforma
              amadurece. Índices cuja base ainda não é confiável simplesmente não são
              exibidos — preferimos não mostrar a mostrar errado.
            </p>
          </Clause>

          <Clause n={6} title="Sua conta, seus dados">
            <p>
              O tratamento dos seus dados pessoais é regido pela{" "}
              <DocLink href="/privacidade">Política de Privacidade</DocLink>, que é parte
              integrante destes Termos. Em resumo: guardamos o seu nome e o seu CPF
              criptografado, e nada mais que identifique você.
            </p>
            <p>
              Você pode encerrar a sua conta quando quiser, sem justificativa — veja{" "}
              <DocLink href="/exclusao-de-dados">como excluir seus dados</DocLink>.
            </p>
          </Clause>

          <Clause n={7} title="Disponibilidade e mudanças">
            <p>
              O Votto está em fase inicial e é oferecido <Key>gratuitamente, no estado em
              que se encontra</Key>. Não há garantia de disponibilidade contínua: a
              plataforma pode ficar fora do ar para manutenção, e funcionalidades podem
              ser alteradas ou removidas.
            </p>
            <p>
              Se um dia houver recurso pago, ele será claramente identificado como tal e
              jamais condicionará o seu direito de votar nos temas.
            </p>
          </Clause>

          <Clause n={8} title="Limites de responsabilidade">
            <p>
              O Votto não se responsabiliza por decisões que você tome com base nos
              índices ou nos conteúdos aqui apresentados, nem por indisponibilidade,
              erro ou atraso nas fontes oficiais das quais depende.
            </p>
            <p>
              Nada nesta cláusula afasta as responsabilidades que a lei brasileira impõe
              de forma inafastável, inclusive as do Código de Defesa do Consumidor e da
              LGPD.
            </p>
          </Clause>

          <Clause n={9} title="Encerramento">
            <p>
              Você pode encerrar a sua conta a qualquer momento. Podemos bloquear ou
              encerrar contas que violem estes Termos — em especial a cláusula 3 —, e
              nesse caso você será informado pelos meios de contato disponíveis.
            </p>
          </Clause>

          <Clause n={10} title="Alterações nestes Termos">
            <p>
              Quando mudarem, a data no topo muda junto, e alterações relevantes são
              avisadas na plataforma antes de valer. Se você continuar usando o Votto
              depois disso, entende-se que concorda com a nova versão; se não concordar,
              pode encerrar a conta.
            </p>
          </Clause>

          <Clause n={11} title="Lei aplicável e foro">
            <p>
              Estes Termos são regidos pela lei brasileira. Fica eleito o foro da comarca
              de {CONTROLLER.jurisdiction} para dirimir controvérsias, ressalvado o
              direito do consumidor de demandar no foro do seu domicílio.
            </p>
            <p>
              Responsável pela plataforma: {CONTROLLER.legalName}, CNPJ{" "}
              {CONTROLLER.taxId}. Contato: <ContactLink />.
            </p>
          </Clause>

          <Reveal variant="fade" className="border-t border-line pt-8">
            <p className="text-sm text-[var(--color-muted)]">
              Leia também a <DocLink href="/privacidade">Política de Privacidade</DocLink>{" "}
              e as{" "}
              <DocLink href="/exclusao-de-dados">instruções de exclusão de dados</DocLink>
              .
            </p>
          </Reveal>
        </DocBody>
      </Container>
    </>
  );
}
