/**
 * Step two of citizen sign-up: confirming the CPF.
 *
 * Reachable only with a pending social identity (`src/lib/auth/pending.ts`).
 * Without one there is nothing to bind a CPF to, so the visitor goes back to
 * the login page rather than being shown a form that cannot succeed.
 *
 * A citizen who already finished this step never sees the page again: the
 * callback recognizes their social account and opens the session directly.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container, Card, CardBody } from "@/components/ui";
import { Reveal } from "@/components/public/motion";
import { readPending } from "@/lib/auth/pending";
import { getCitizenSession } from "@/lib/auth/session";
import { cancelPendingAction } from "@/lib/actions/citizen-cpf";
import { CpfForm } from "./CpfForm";

export const metadata: Metadata = {
  title: "Confirmar CPF",
};

export const dynamic = "force-dynamic";

export default async function LinkCpfPage() {
  if (await getCitizenSession()) redirect("/");

  const pending = await readPending();
  if (!pending) redirect("/login");

  const greeting = pending.firstName ? `, ${pending.firstName}` : "";

  return (
    <Container className="py-16">
      <Reveal className="mx-auto max-w-md">
        <Card>
          <CardBody className="flex flex-col gap-5">
            <div>
              <h1 className="text-[1.9rem] leading-tight text-navy-900">
                Falta confirmar o seu CPF
              </h1>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Quase lá{greeting}. Conferimos o CPF diretamente no registro oficial da
                Receita Federal — sem ele não há como garantir um voto por cidadão.
              </p>
            </div>

            <CpfForm />

            <div className="border-t border-line pt-4">
              <p className="text-xs leading-relaxed text-[var(--color-muted)]">
                O CPF é guardado criptografado e nunca aparece em nenhuma tela, relatório
                ou integração. Dele derivamos apenas um código irreversível, que serve
                para impedir um segundo voto no mesmo tema. Seu voto continua anônimo.
              </p>
              <form action={cancelPendingAction} className="mt-3">
                <button
                  type="submit"
                  className="text-xs font-medium text-navy-700 underline hover:text-navy-900"
                >
                  Cancelar e voltar
                </button>
              </form>
            </div>
          </CardBody>
        </Card>
      </Reveal>
    </Container>
  );
}
