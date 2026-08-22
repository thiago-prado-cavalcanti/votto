/**
 * Simulated social consent screen (development only).
 *
 * Stands in for Google, Apple and Meta so the whole sign-up — social identity,
 * then CPF confirmation — can be walked locally without registering an app with
 * any of them. It posts a fake `sub` to the social callback, which then routes
 * to `/entrar/cpf` exactly as a real provider would.
 *
 * It hands out an identity from a form, so reachable in production it would let
 * anyone impersonate any social account. The callback already refuses the
 * submission outside mock mode; the page refuses to exist at all, because a
 * visible fake login is its own kind of failure.
 */
import { notFound } from "next/navigation";
import { Container, Card, CardBody, Button, Field, Input } from "@/components/ui";
import { env } from "@/lib/env";
import { isButtonKey, resolveProvider } from "@/lib/auth/social/providers";

export const dynamic = "force-dynamic";

/**
 * Test identities. The `subject` stands in for the provider's `sub` — reusing
 * one is how you simulate a returning citizen, which should skip the CPF step
 * entirely and land straight on the home page.
 */
const PRESETS: Array<{ subject: string; firstName: string; lastName: string }> = [
  { subject: "ana", firstName: "Ana", lastName: "Oliveira" },
  { subject: "bruno", firstName: "Bruno", lastName: "Santos" },
  { subject: "carla", firstName: "Carla", lastName: "Souza" },
  { subject: "diego", firstName: "Diego", lastName: "Pereira" },
];

/**
 * Valid CPFs for the CPF step. The mock registry accepts any structurally valid
 * number and rejects anything starting with `000`, so both paths are testable.
 */
const TEST_CPFS = ["529.982.247-25", "111.444.777-35", "390.533.447-05"];

export default async function DevIdpPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; provider?: string }>;
}) {
  if (env.social.mode !== "mock") notFound();

  const { state = "", provider: slug = "google" } = await searchParams;
  if (!isButtonKey(slug)) notFound();

  const provider = resolveProvider(slug);
  if (!provider) notFound();

  // The slug is what the citizen pressed; the resolved provider is what gets
  // stored. They differ for Instagram, and seeing that here is the point.
  const resolvedNote =
    slug === "instagram"
      ? "O botão do Instagram roda o fluxo do Facebook — a conta é gravada como FACEBOOK."
      : null;

  const action = `/api/auth/social/${slug}/callback`;

  return (
    <div className="min-h-screen bg-canvas">
      <Container className="py-12">
        <div className="mx-auto max-w-lg">
          <div className="mb-4 rounded-card border border-[var(--color-neutral)] bg-[var(--color-ochre-light)] px-4 py-3 text-sm text-[var(--color-neutral)]">
            Ambiente de simulação — esta tela imita o consentimento de um provedor
            social para desenvolvimento. Nenhuma conexão real é feita.
          </div>

          <Card>
            <CardBody className="flex flex-col gap-6">
              <div>
                <h1 className="text-2xl text-navy-900">
                  {provider.label} (simulado)
                </h1>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Escolha uma conta para autorizar o acesso ao Votto. Em seguida você
                  confirmará um CPF.
                </p>
                {resolvedNote ? (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">{resolvedNote}</p>
                ) : null}
              </div>

              {/* Preset accounts */}
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium text-navy-800">Contas de teste</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PRESETS.map((p) => (
                    <form key={p.subject} action={action} method="post">
                      <input type="hidden" name="mock" value="1" />
                      <input type="hidden" name="state" value={state} />
                      <input type="hidden" name="subject" value={p.subject} />
                      <input type="hidden" name="firstName" value={p.firstName} />
                      <input type="hidden" name="lastName" value={p.lastName} />
                      <button
                        type="submit"
                        className="w-full rounded-card border border-line bg-surface p-3 text-left transition-colors hover:bg-navy-50"
                      >
                        <span className="block text-sm font-semibold text-navy-900">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="block text-xs text-[var(--color-muted)]">
                          sub: {p.subject}
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </div>

              {/* Custom account */}
              <div className="border-t border-line pt-5">
                <span className="text-sm font-medium text-navy-800">
                  Ou informe uma conta personalizada
                </span>
                <form action={action} method="post" className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="mock" value="1" />
                  <input type="hidden" name="state" value={state} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome" htmlFor="firstName">
                      <Input id="firstName" name="firstName" required autoComplete="off" />
                    </Field>
                    <Field label="Sobrenome" htmlFor="lastName">
                      <Input id="lastName" name="lastName" required autoComplete="off" />
                    </Field>
                  </div>
                  <Field
                    label="Identificador da conta (sub)"
                    htmlFor="subject"
                    hint="Repita um valor já usado para simular um cidadão que volta."
                  >
                    <Input id="subject" name="subject" required autoComplete="off" />
                  </Field>
                  <Button type="submit" className="w-full">
                    Autorizar acesso
                  </Button>
                </form>
              </div>

              <div className="border-t border-line pt-5">
                <span className="text-sm font-medium text-navy-800">
                  CPFs válidos para a próxima etapa
                </span>
                <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">
                  {TEST_CPFS.join(" · ")}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Qualquer data de nascimento serve no provedor `mock`. Um CPF começando
                  com <code>000</code> (ex.: 000.000.004-34) exercita a rejeição.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </Container>
    </div>
  );
}
