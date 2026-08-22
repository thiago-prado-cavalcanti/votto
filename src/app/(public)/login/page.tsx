/**
 * Citizen login page.
 *
 * Entry is by social provider (Apple, Google, Meta), followed by a CPF
 * confirmation against the official registry. gov.br would be the better door
 * — it hands over a CPF it has already verified — but Login Único is granted
 * only to public bodies on `.gov.br` domains, so it is not available to Votto.
 *
 * The page says what the two steps buy and what they do not, because a citizen
 * about to hand over a CPF is owed that.
 */
import type { Metadata } from "next";
import { Container, Card, CardBody } from "@/components/ui";
import { Reveal } from "@/components/public/motion";
import { SocialButtons } from "@/components/public/SocialButtons";
import { availableButtons } from "@/lib/auth/social/providers";

export const metadata: Metadata = {
  title: "Entrar",
};

/** User-facing explanation for each failure a callback can redirect with. */
const ERROR_MESSAGES: Record<string, string> = {
  state: "Sessão de login inválida ou expirada. Tente novamente.",
  expired: "O login demorou demais para ser concluído. Tente novamente.",
  denied: "Autorização cancelada.",
  not_configured: "Esta forma de entrada ainda não está disponível. Tente outra.",
  provider: "Não foi possível falar com o provedor agora. Tente novamente em instantes.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.provider : null;
  const loginAvailable = availableButtons().length > 0;

  return (
    <Container className="py-16">
      <Reveal className="mx-auto max-w-md">
        <Card>
          <CardBody className="flex flex-col gap-5">
            <div>
              <h1 className="text-[1.9rem] leading-tight text-navy-900">Entrar no Votto</h1>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Entre com uma conta que você já tem. Em seguida confirmamos o seu CPF
                no registro oficial da Receita Federal — é o que garante um voto por
                cidadão.
              </p>
            </div>

            {message ? (
              <p
                role="alert"
                className="rounded-card bg-[#f7e9e4] px-3 py-2 text-sm text-[var(--color-negative)]"
              >
                {message}
              </p>
            ) : null}

            {loginAvailable ? (
              <SocialButtons />
            ) : (
              <div className="rounded-card border border-line bg-canvas px-4 py-3.5">
                <p className="text-sm font-semibold text-navy-900">
                  A entrada ainda não está aberta.
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Enquanto isso você pode navegar por todos os temas, agentes públicos
                  e partidos — só o voto depende do login.
                </p>
              </div>
            )}

            <div className="border-t border-line pt-4">
              <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                <span className="font-semibold text-navy-800">Por que pedimos o CPF.</span>{" "}
                Uma conta social prova que você controla aquela conta, não quem você é.
                O CPF é o identificador único nacional: sem ele, um mesmo eleitor
                poderia votar quantas vezes quisesse criando contas novas.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                Nenhum dado além do seu nome é armazenado. O CPF é guardado
                criptografado, usado apenas para garantir a unicidade do voto, e nunca
                é exposto. Seu voto é sempre anônimo.
              </p>
            </div>
          </CardBody>
        </Card>
      </Reveal>
    </Container>
  );
}
