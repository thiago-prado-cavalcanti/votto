"use client";

/**
 * Admin login form. Submits credentials to the loginAction and shows an error
 * message returned by the server action on failure.
 */
import { useActionState } from "react";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { loginAction, type ActionState } from "@/lib/actions/admin/auth";

const initialState: ActionState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@votto.com.br" />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error ? (
        <p className="rounded-xl bg-[#fbeaeb] px-3.5 py-2.5 text-sm text-[var(--color-negative)]">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="w-full" size="lg" pendingLabel="Entrando...">
        Entrar
      </SubmitButton>
    </form>
  );
}
