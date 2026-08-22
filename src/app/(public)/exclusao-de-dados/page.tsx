/**
 * Data deletion instructions.
 *
 * Meta requires a "User Data Deletion" URL for any app using Facebook Login —
 * either a callback it can call, or a page telling people how to ask. This is
 * that page, and it doubles as the LGPD art. 18 route for eliminação.
 *
 * Written as a standalone page rather than an anchor inside the privacy policy
 * because it is the one legal page someone arrives at *wanting something done*.
 * It therefore leads with the action, not with definitions.
 *
 * Honest about the mechanism: deletion is a request answered by a person, not a
 * button, because no self-service deletion exists yet. Saying "click here" and
 * shipping an e-mail address would be a lie the reader discovers one click in.
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
  Key,
  RuleItem,
  RuleList,
} from "@/components/public/LegalDoc";
import { CONTROLLER } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Exclusão de dados",
  description:
    "Como pedir a exclusão da sua conta e dos seus dados no Votto, o que é apagado e em quanto tempo.",
};

export default function DataDeletionPage() {
  return (
    <>
      <PageIntro
        eyebrow="Seus direitos"
        title="Excluir seus dados"
        lead={
          <>
            Você pode encerrar a sua conta e apagar tudo o que o Votto guarda sobre você,
            a qualquer momento e sem precisar justificar.
          </>
        }
      >
        <p className="text-sm text-navy-600">
          Última atualização: {CONTROLLER.updatedAt}
        </p>
      </PageIntro>

      <Container className="py-14">
        <DocBody>
          {/* The action first. Everything else on this page is context. */}
          <Reveal
            variant="fade"
            className="rounded-card border border-line bg-surface p-6"
          >
            <div className="h-[3px] -mx-6 -mt-6 mb-5 bg-accent-500" />
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
              Como pedir
            </h2>
            <p className="mt-4 text-[0.95rem] leading-[1.6] text-navy-700">
              Envie um e-mail para <ContactLink /> com o assunto{" "}
              <Key>&ldquo;Excluir meus dados&rdquo;</Key>.
            </p>
            <p className="mt-3 text-[0.95rem] leading-[1.6] text-navy-700">
              Respondemos em até <Key>{CONTROLLER.responseDays} dias</Key>.
            </p>
            <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-[var(--color-muted)]">
              Ainda não existe um botão de autoexclusão dentro da plataforma — o pedido é
              atendido por uma pessoa. Preferimos dizer isso a prometer um clique que não
              existe.
            </p>
          </Reveal>

          <Clause n={1} title="O que é apagado">
            <p>Tudo o que liga você a esta plataforma:</p>
            <RuleList>
              <RuleItem>
                <Key>Sua conta</Key> — nome, CPF criptografado, o código derivado dele, os
                seis dígitos iniciais e o ano de nascimento.
              </RuleItem>
              <RuleItem>
                <Key>O vínculo com a sua conta social</Key> (Apple, Google ou Meta).
              </RuleItem>
              <RuleItem>
                <Key>Todos os seus votos</Key>. Os totais públicos dos temas são
                recalculados sem eles.
              </RuleItem>
            </RuleList>
            <p>
              A exclusão é <Key>definitiva</Key>. Não há lixeira nem período de
              recuperação: depois de apagados, os seus votos não voltam, mesmo que você
              se cadastre de novo com o mesmo CPF.
            </p>
          </Clause>

          <Clause n={2} title="O que permanece">
            <p>
              Registros técnicos de operação da plataforma — como o horário em que uma
              sincronização com a Câmara ou o Senado foi executada. Eles{" "}
              <Key>não contêm dado pessoal</Key> e não permitem chegar a você.
            </p>
            <p>
              Os dados sobre agentes públicos, partidos e proposições continuam onde
              estavam: são atos públicos de agentes públicos, publicados pelas casas
              legislativas, e nada têm a ver com a sua conta.
            </p>
          </Clause>

          <Clause n={3} title="Como confirmamos que é você">
            <p>
              Vamos pedir que você <Key>entre na plataforma</Key> pelo provedor que usa
              normalmente. Como não guardamos o seu e-mail, a mensagem sozinha não prova
              nada — e apagar a conta de alguém a pedido de outra pessoa seria o pior
              erro possível aqui.
            </p>
          </Clause>

          <Clause n={4} title="Se você só quer desconectar o Facebook, Google ou Apple">
            <p>
              Remover o Votto da lista de aplicativos conectados do provedor{" "}
              <Key>não apaga a sua conta aqui</Key> — só corta aquele caminho de entrada.
              Se você tiver outro provedor vinculado ao mesmo CPF, continua entrando por
              ele.
            </p>
            <p>
              Para apagar de fato, use o pedido no topo desta página. Se preferir só
              desconectar:
            </p>
            <RuleList>
              <RuleItem>
                <DocLink href="https://www.facebook.com/settings?tab=applications" external>
                  Facebook → Aplicativos e sites
                </DocLink>
              </RuleItem>
              <RuleItem>
                <DocLink href="https://myaccount.google.com/permissions" external>
                  Google → Conexões com apps e serviços de terceiros
                </DocLink>
              </RuleItem>
              <RuleItem>
                <DocLink href="https://appleid.apple.com/account/manage" external>
                  Apple ID → Entrar com a Apple
                </DocLink>
              </RuleItem>
            </RuleList>
          </Clause>

          <Clause n={5} title="Seus outros direitos">
            <p>
              Além da exclusão, a LGPD garante acesso, correção, portabilidade,
              informação sobre compartilhamento e revogação do consentimento. Todos pelo
              mesmo endereço, no mesmo prazo. A lista completa está na{" "}
              <DocLink href="/privacidade">Política de Privacidade</DocLink>.
            </p>
            <p>
              Se preferir revogar apenas o consentimento para o tratamento dos seus votos
              — que é dado sensível — sem apagar a conta, diga isso no e-mail. As duas
              coisas são separadas.
            </p>
          </Clause>
        </DocBody>
      </Container>
    </>
  );
}
