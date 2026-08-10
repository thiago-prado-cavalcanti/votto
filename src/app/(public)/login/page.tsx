/**
 * Citizen login page. Login is only available through gov.br, the official
 * identity provider that has already verified the citizen's CPF.
 *
 * Bank identity is reached through gov.br itself: validating an account at a
 * credentialed bank is what raises it to the "selo prata", and `GOVBR_MIN_TRUST`
 * can require that seal. Votto never talks to a bank directly.
 */
import type { Metadata } from "next";
import { Container, Card, CardBody, ButtonLink } from "@/components/ui";
import { env, isGovbrConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Entrar",
};

/** User-facing explanation for each failure the callback can redirect with. */
const ERROR_MESSAGES: Record<string, string> = {
  state: "Sessão de login inválida ou expirada. Tente novamente.",
  expired: "O login demorou demais para ser concluído. Tente novamente.",
  denied: "Autorização cancelada no gov.br.",
  trust:
    "Sua conta gov.br ainda não tem o nível de confiabilidade exigido. " +
    "Valide-a em um banco credenciado ou pelo aplicativo gov.br e tente novamente.",
  provider: "Não foi possível falar com o gov.br agora. Tente novamente em instantes.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.provider : null;

  // Production before the gov.br credentials arrive: the authorization route
  // answers 501, so showing the button would send a visitor to a raw JSON
  // error. Say plainly that login is not open yet instead.
  const loginAvailable = env.govbr.mode === "mock" || isGovbrConfigured();

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md">
        <Card>
          <CardBody className="flex flex-col gap-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-navy-900">
                Entrar no Votto
              </h1>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                O acesso é feito exclusivamente pelo gov.br, que verifica o seu CPF
                previamente. Assim garantimos um voto por cidadão sem que o Votto
                precise validar documentos.
              </p>
            </div>

            {message ? (
              <p
                role="alert"
                className="rounded-lg bg-[#fbeaeb] px-3 py-2 text-sm text-[var(--color-negative)]"
              >
                {message}
              </p>
            ) : null}

            {loginAvailable ? (
              <ButtonLink href="/api/auth/govbr/start" size="lg" className="w-full">
                Entrar com gov.br
              </ButtonLink>
            ) : (
              <div className="rounded-xl border border-line bg-canvas px-4 py-3.5">
                <p className="text-sm font-semibold text-navy-900">
                  A entrada pelo gov.br ainda não está aberta.
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  O credenciamento junto ao gov.br está em andamento. Enquanto isso
                  você pode navegar por todos os temas, agentes públicos e partidos —
                  só o voto depende do login.
                </p>
              </div>
            )}

            <p className="text-xs leading-relaxed text-[var(--color-muted)]">
              Tem conta em um banco credenciado? Ela eleva o nível da sua conta
              gov.br (selo prata) e serve para entrar aqui — o login continua sendo
              feito pelo gov.br.
            </p>

            <p className="text-xs leading-relaxed text-[var(--color-muted)]">
              Nenhum dado além do seu nome é armazenado. O CPF é usado apenas para
              garantir a unicidade do voto e fica criptografado, nunca exposto.
            </p>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
