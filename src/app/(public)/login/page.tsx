/**
 * Citizen login page. Login is only available through official identity providers
 * (gov.br / bancos credenciados) that pre-verify the citizen's CPF.
 */
import type { Metadata } from "next";
import { Container, Card, CardBody, ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
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
                O acesso é feito exclusivamente por provedores oficiais (gov.br ou
                bancos credenciados), que verificam o seu CPF previamente. Assim
                garantimos um voto por cidadão sem que o Votto precise validar
                documentos.
              </p>
            </div>

            <ButtonLink href="/api/auth/govbr/start" size="lg" className="w-full">
              Entrar com gov.br
            </ButtonLink>

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
