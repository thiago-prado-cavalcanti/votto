/**
 * Simulated gov.br consent screen (development only).
 *
 * Clearly labeled as a simulation. Offers preset verified identities (with valid
 * test CPFs) and a custom form. All options post the identity to the gov.br
 * callback, carrying the CSRF `state` produced by /api/auth/govbr/start.
 */
import { notFound } from "next/navigation";
import { Container, Card, CardBody, Button, Field, Input } from "@/components/ui";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const PRESETS: Array<{ firstName: string; lastName: string; cpf: string }> = [
  { firstName: "Ana", lastName: "Oliveira", cpf: "52998224725" },
  { firstName: "Bruno", lastName: "Santos", cpf: "11144477735" },
  { firstName: "Carla", lastName: "Souza", cpf: "39053344705" },
  { firstName: "Diego", lastName: "Pereira", cpf: "16899535009" },
];

function maskCpf(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export default async function DevIdpPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; error?: string }>;
}) {
  // This page mints an identity from a form. Reachable in production it would
  // hand anyone a vote under any CPF, destroying the one-vote-per-citizen
  // guarantee the whole platform rests on. The callback already refuses the
  // submission outside mock mode, but the page must not exist at all — a
  // visible fake login is its own kind of failure.
  if (env.govbr.mode !== "mock") notFound();

  const { state = "", error } = await searchParams;

  return (
    <div className="min-h-screen bg-canvas">
      <Container className="py-12">
        <div className="mx-auto max-w-lg">
          <div className="mb-4 rounded-xl border border-[var(--color-neutral)] bg-[#f6f0db] px-4 py-3 text-sm text-[var(--color-neutral)]">
            Ambiente de simulação — esta tela imita o consentimento do gov.br para
            desenvolvimento. Nenhuma conexão real com o gov.br é feita.
          </div>

          <Card>
            <CardBody className="flex flex-col gap-6">
              <div>
                <h1 className="text-xl font-bold text-navy-900">gov.br (simulado)</h1>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Escolha uma identidade verificada para autorizar o acesso ao Votto.
                </p>
              </div>

              {error === "cpf" ? (
                <p className="rounded-lg bg-[#fbeaeb] px-3 py-2 text-sm text-[var(--color-negative)]">
                  CPF inválido. Verifique os dados e tente novamente.
                </p>
              ) : null}

              {/* Preset identities */}
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium text-navy-800">
                  Identidades de teste
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PRESETS.map((p) => (
                    <form key={p.cpf} action="/api/auth/govbr/callback" method="post">
                      <input type="hidden" name="state" value={state} />
                      <input type="hidden" name="firstName" value={p.firstName} />
                      <input type="hidden" name="lastName" value={p.lastName} />
                      <input type="hidden" name="cpf" value={p.cpf} />
                      <button
                        type="submit"
                        className="w-full rounded-xl border border-line bg-white p-3 text-left transition-colors hover:bg-navy-50"
                      >
                        <span className="block text-sm font-semibold text-navy-900">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="block text-xs text-[var(--color-muted)]">
                          CPF {maskCpf(p.cpf)}
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </div>

              {/* Custom identity */}
              <div className="border-t border-line pt-5">
                <span className="text-sm font-medium text-navy-800">
                  Ou informe uma identidade personalizada
                </span>
                <form
                  action="/api/auth/govbr/callback"
                  method="post"
                  className="mt-3 flex flex-col gap-3"
                >
                  <input type="hidden" name="state" value={state} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome" htmlFor="firstName">
                      <Input id="firstName" name="firstName" required autoComplete="off" />
                    </Field>
                    <Field label="Sobrenome" htmlFor="lastName">
                      <Input id="lastName" name="lastName" required autoComplete="off" />
                    </Field>
                  </div>
                  <Field label="CPF" htmlFor="cpf" hint="Somente números ou com pontuação.">
                    <Input
                      id="cpf"
                      name="cpf"
                      required
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      autoComplete="off"
                    />
                  </Field>
                  <Button type="submit" className="w-full">
                    Autorizar acesso
                  </Button>
                </form>
              </div>
            </CardBody>
          </Card>
        </div>
      </Container>
    </div>
  );
}
