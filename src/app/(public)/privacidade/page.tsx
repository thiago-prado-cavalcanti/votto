/**
 * Privacy policy.
 *
 * Required by Meta (a Facebook Login app cannot leave Development mode without
 * a privacy policy URL), by Google's consent screen and by Apple — but the
 * reason it reads the way it does is CLAUDE.md §5: a platform whose promise is
 * "a leak exposes nothing beyond your name" has to be able to show its work.
 *
 * Every claim here is checked against the code, not aspirational. If the data
 * model changes, this page changes with it — the table below mirrors
 * `prisma/schema.prisma` (User, SocialAccount, Vote) field by field.
 *
 * One point of law drives the whole document: a vote on a political theme is an
 * **opinião política**, which LGPD art. 5º, II lists as *dado pessoal sensível*.
 * Art. 11, I therefore requires consent that is "específica e destacada" — which
 * is why the CPF step carries its own separate checkbox rather than a blanket
 * "aceito os termos".
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
  title: "Política de Privacidade",
  description:
    "O que o Votto coleta, por que, com quem compartilha e como você exerce seus direitos sob a LGPD.",
};

export default function PrivacyPage() {
  return (
    <>
      <PageIntro
        eyebrow="Documento"
        title="Política de Privacidade"
        lead={
          <>
            O Votto foi construído para saber o mínimo possível sobre você. Esta página
            diz exatamente o que ele guarda, por quê, e o que você pode exigir de volta.
          </>
        }
      >
        <p className="text-sm text-navy-600">
          Última atualização: {CONTROLLER.updatedAt}
        </p>
      </PageIntro>

      <Container className="py-14">
        <DocBody>
          {/* The short version, for the majority who will read only this. */}
          <DocSummary>
              <li>
                <Key>Seu voto é anônimo.</Key> Nenhuma tela, API, widget ou exportação
                mostra como uma pessoa votou. O que é público são somas.
              </li>
              <li>
                <Key>Guardamos seu nome e o seu CPF criptografado</Key> — mais nada que
                identifique você.
              </li>
              <li>
                <Key>Não guardamos seu e-mail</Key>, telefone, foto, lista de contatos
                nem sua data de nascimento completa, mesmo quando o provedor social
                oferece.
              </li>
              <li>
                <Key>Não vendemos dados</Key> e não montamos perfil publicitário.
              </li>
              <li>
                <Key>O CPF existe por um motivo só:</Key> impedir que a mesma pessoa
                vote duas vezes no mesmo tema.
              </li>
          </DocSummary>

          <Clause n={1} title="Quem é o responsável">
            <p>
              O tratamento dos seus dados é feito por {CONTROLLER.legalName}, inscrita
              sob o CNPJ {CONTROLLER.taxId}, responsável pela plataforma Votto
              (votto.online), na condição de <Key>controlador</Key> nos termos da Lei
              13.709/2018 (LGPD).
            </p>
            <p>
              Para qualquer assunto desta política, incluindo o exercício dos seus
              direitos, escreva para{" "}
              <ContactLink />
              .
            </p>
          </Clause>

          <Clause n={2} title="O que coletamos, e nada além disso">
            <p>
              Esta é a lista completa. Se um dado não está aqui, o Votto não o tem.
            </p>

            <div className="-mx-1 overflow-x-auto">
              <table className="mt-1 w-full min-w-[34rem] border-collapse text-left text-[0.9rem]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-2 pr-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                      Dado
                    </th>
                    <th className="py-2 pr-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                      De onde vem
                    </th>
                    <th className="py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
                      Como é guardado
                    </th>
                  </tr>
                </thead>
                <tbody className="text-navy-700">
                  {[
                    [
                      "Nome e sobrenome",
                      "Registro da Receita Federal",
                      "Em claro. É o único dado legível sobre você.",
                    ],
                    [
                      "CPF",
                      "Você digita",
                      "Criptografado (AES-256-GCM). Nunca em texto puro.",
                    ],
                    [
                      "Código derivado do CPF",
                      "Calculado por nós",
                      "Hash irreversível. É ele que impede o voto duplicado.",
                    ],
                    [
                      "6 primeiros dígitos do CPF",
                      "Calculado por nós",
                      "Em claro. Sozinhos, não identificam ninguém.",
                    ],
                    [
                      "Data de nascimento",
                      "Você digita; conferida na Receita",
                      "Criptografada. Usada só para confirmar que é você na hora de votar.",
                    ],
                    [
                      "Ano de nascimento",
                      "Registro da Receita Federal",
                      "Em claro. Sozinho, não identifica ninguém.",
                    ],
                    [
                      "Identificador da sua conta social",
                      "Apple, Google ou Meta",
                      "Código opaco, uso interno. Reconhece você no próximo acesso.",
                    ],
                    [
                      "Seus votos",
                      "Você",
                      "Ligados à sua conta, para calcular o seu alinhamento.",
                    ],
                  ].map(([what, where, how]) => (
                    <tr key={what} className="border-b border-line/60 align-top">
                      <td className="py-2.5 pr-4 font-medium text-navy-900">{what}</td>
                      <td className="py-2.5 pr-4">{where}</td>
                      <td className="py-2.5">{how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-1">
              <Key>O que recusamos de propósito.</Key> Apple, Google e Meta oferecem o
              seu e-mail; não pedimos e não guardamos. Também não coletamos telefone,
              endereço, foto de perfil, lista de amigos nem senha — você não cria senha
              no Votto, então não há o que vazar.
            </p>
            <p>
              <Key>Sobre a data de nascimento.</Key> Guardamos a data completa
              criptografada porque ela é usada na confirmação do voto, que pede o dia,
              o mês ou o ano. Em claro fica apenas o <Key>ano</Key>, que sozinho não
              identifica ninguém e serve para conferir a idade mínima e para as
              estatísticas anônimas.
            </p>
          </Clause>

          <Clause n={3} title="Seus votos são dado sensível, e tratamos como tal">
            <p>
              A LGPD (art. 5º, II) classifica <Key>opinião política</Key> como dado
              pessoal sensível. Um voto seu em um tema político é exatamente isso.
            </p>
            <p>
              Por isso o art. 11 exige um consentimento <Key>específico e destacado</Key>{" "}
              — e é o que pedimos no cadastro, numa caixa separada, só para essa
              finalidade. Não é um &ldquo;aceito os termos&rdquo; genérico, e você pode
              revogá-lo depois sem perder o acesso ao restante da plataforma.
            </p>
            <p>
              Enquanto o consentimento vale, os seus votos servem a duas coisas: calcular
              o <Key>seu</Key> alinhamento com agentes públicos e partidos, e entrar em{" "}
              <Key>totais agregados</Key>. Nunca a mais nada.
            </p>
          </Clause>

          <Clause n={4} title="Por que pedimos o seu CPF">
            <p>
              Sem um identificador único nacional, uma mesma pessoa criaria contas novas
              e votaria quantas vezes quisesse — e a plataforma inteira perderia o
              sentido. O CPF é o que existe no Brasil para isso.
            </p>
            <p>
              Ele é confirmado uma vez, no cadastro, contra o registro oficial da Receita
              Federal, junto com a sua data de nascimento. Desse momento em diante ele
              some: fica criptografado, e o que o sistema usa no dia a dia é um{" "}
              <Key>código irreversível</Key> derivado dele. Não é possível recuperar o
              seu CPF a partir desse código.
            </p>
            <p>
              O seu nome e o seu CPF <Key>não são usados para exibir ou atribuir voto
              algum</Key>. Eles servem para garantir unicidade e nada mais.
            </p>
          </Clause>

          <Clause n={5} title="A confirmação na hora de votar">
            <p>
              Uma vez por sessão, antes do seu primeiro voto, pedimos{" "}
              <Key>três dígitos do seu CPF</Key> — indicados pela posição — e{" "}
              <Key>o dia, o mês ou o ano</Key> do seu nascimento. A combinação muda a
              cada vez.
            </p>
            <p>
              Isso não é burocracia nem uma segunda senha: é o que impede que alguém que
              pegou o seu celular destravado, ou um computador compartilhado onde você
              esqueceu a sessão aberta, vote no seu lugar. Depois de confirmar, todos os
              seus votos naquela sessão seguem direto.
            </p>
            <p>
              Nenhum desses dígitos é enviado a terceiros nem gravado em lugar nenhum —
              a conferência acontece na memória do servidor, contra os campos
              criptografados, e o resultado é apenas &ldquo;confere&rdquo; ou
              &ldquo;não confere&rdquo;.
            </p>
          </Clause>

          <Clause n={6} title="Com quem compartilhamos">
            <p>Três destinos, e só três:</p>
            <RuleList>
              <RuleItem>
                <Key>O provedor que você escolheu para entrar</Key> (Apple, Google ou
                Meta) sabe que você entrou no Votto — é o que qualquer login social
                implica. Ele não recebe o seu CPF nem os seus votos.
              </RuleItem>
              <RuleItem>
                <Key>O serviço de validação de CPF</Key> recebe o seu CPF e a sua data de
                nascimento uma única vez, no cadastro, para confirmar contra a base da
                Receita Federal. Não recebe os seus votos.
              </RuleItem>
              <RuleItem>
                <Key>Google Analytics</Key>, com medição de audiência do site público, em
                dados agregados. Não roda na área administrativa nem nos widgets
                incorporados, e não recebe o seu CPF, o seu nome ou os seus votos.
              </RuleItem>
            </RuleList>
            <p>
              Não vendemos dados pessoais, não fazemos publicidade direcionada e não
              cedemos a sua base a terceiros. Se um dia publicarmos pesquisas a partir da
              plataforma, será sobre <Key>dados agregados e anonimizados</Key>, dos quais
              não é possível chegar a uma pessoa.
            </p>
          </Clause>

          <Clause n={7} title="Cookies">
            <p>
              Usamos o mínimo. Nenhum cookie de publicidade, nenhum rastreador de
              terceiros além do Google Analytics.
            </p>
            <RuleList>
              <RuleItem>
                <Key>Sessão</Key> — mantém você conectado. Assinado, inacessível a
                JavaScript, expira em 8 horas.
              </RuleItem>
              <RuleItem>
                <Key>Cadastro em andamento</Key> — segura a sua conta social entre a
                autorização e a confirmação do CPF. Expira em 30 minutos, e se você
                desistir no meio, <Key>nada é gravado</Key>.
              </RuleItem>
              <RuleItem>
                <Key>Google Analytics</Key> — medição de audiência do site público.
              </RuleItem>
            </RuleList>
          </Clause>

          <Clause n={8} title="Por quanto tempo guardamos">
            <p>
              Enquanto a sua conta existir. Se você pedir a exclusão, apagamos a conta,
              o vínculo com o provedor social e os seus votos, e os totais públicos são
              recalculados sem eles.
            </p>
            <p>
              Registros técnicos de execução (quando uma sincronização com a Câmara ou o
              Senado rodou, por exemplo) não contêm dado pessoal e são mantidos para
              auditoria da plataforma.
            </p>
          </Clause>

          <Clause n={9} title="Seus direitos, e como exercê-los">
            <p>
              A LGPD (art. 18) garante a você, sobre os seus dados:{" "}
              <Key>confirmação e acesso</Key>, <Key>correção</Key>,{" "}
              <Key>anonimização, bloqueio ou eliminação</Key>,{" "}
              <Key>portabilidade</Key>, <Key>informação sobre compartilhamento</Key> e{" "}
              <Key>revogação do consentimento</Key>.
            </p>
            <p>
              Escreva para{" "}
              <ContactLink />{" "}
              a partir de qualquer endereço e responderemos em até{" "}
              <Key>15 dias</Key>. Como não guardamos o seu e-mail, vamos pedir que você
              se identifique entrando na plataforma — é a única forma de termos certeza
              de que estamos entregando os dados de alguém à própria pessoa.
            </p>
            <p>
              Você também pode reclamar diretamente à{" "}
              <DocLink href="https://www.gov.br/anpd" external>
                Autoridade Nacional de Proteção de Dados (ANPD)
              </DocLink>
              .
            </p>
          </Clause>

          <Clause n={10} title="Como protegemos">
            <p>
              O CPF é cifrado com AES-256-GCM e a chave fica fora do banco de dados. O
              código usado para impedir voto duplicado é um HMAC-SHA256 — irreversível
              por construção, e não permite nem comparar dois CPFs sem a chave.
            </p>
            <p>
              As sessões são cookies assinados e inacessíveis a JavaScript. Você não cria
              senha no Votto, então não há credencial sua para vazar. E identificadores
              internos do banco nunca saem do sistema: nenhuma resposta de API, widget ou
              exportação os expõe.
            </p>
            <p>
              Nenhum sistema é inviolável. O que dá para prometer com honestidade é que,
              se o banco do Votto vazar inteiro, o que estará legível é o seu nome — não
              o seu CPF, não o seu e-mail, e não como você votou individualmente.
            </p>
          </Clause>

          <Clause n={11} title="Menores de 16 anos">
            <p>
              O voto no Brasil é facultativo a partir dos 16 anos, e a plataforma segue a
              mesma régua: o cadastro é recusado para quem tem menos que isso, a partir
              da data de nascimento confirmada no registro oficial.
            </p>
          </Clause>

          <Clause n={12} title="Mudanças nesta política">
            <p>
              Se algo mudar, a data no topo muda junto. Alterações que ampliem o uso dos
              seus dados serão comunicadas na plataforma antes de valer, e quando a lei
              exigir, pediremos o seu consentimento de novo — não vamos presumi-lo.
            </p>
          </Clause>

          <Reveal variant="fade" className="border-t border-line pt-8">
            <p className="text-sm text-[var(--color-muted)]">
              Quer entender como o alinhamento é calculado e de onde vêm os dados
              oficiais?{" "}
              <DocLink href="/temas">Comece pelos temas</DocLink>
              .
            </p>
          </Reveal>
        </DocBody>
      </Container>
    </>
  );
}
