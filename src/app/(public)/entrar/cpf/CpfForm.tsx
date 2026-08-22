"use client";

/**
 * The CPF confirmation form.
 *
 * A client component only because it renders the server action's error text in
 * place; the submission itself is a plain form post, so it still works if the
 * JavaScript never arrives.
 */
import { useActionState } from "react";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { linkCpfAction, type LinkCpfResult } from "@/lib/actions/citizen-cpf";

export function CpfForm() {
  const [state, formAction, pending] = useActionState<LinkCpfResult | null, FormData>(
    linkCpfAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <p
          role="alert"
          className="rounded-card bg-[#f7e9e4] px-3 py-2 text-sm text-[var(--color-negative)]"
        >
          {state.error}
          {state.restart ? (
            <>
              {" "}
              <a href="/login" className="font-semibold underline">
                Entrar novamente
              </a>
              .
            </>
          ) : null}
        </p>
      ) : null}

      <Field label="CPF" htmlFor="cpf" hint="Somente números ou com pontuação.">
        <Input
          id="cpf"
          name="cpf"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
        />
      </Field>

      <Field
        label="Data de nascimento"
        htmlFor="birthDate"
        hint="A Receita Federal só confirma o CPF junto com a data de nascimento."
      >
        <Input
          id="birthDate"
          name="birthDate"
          required
          inputMode="numeric"
          autoComplete="bday"
          placeholder="DD/MM/AAAA"
        />
      </Field>

      {/* Specific, highlighted consent — LGPD art. 11, I. A vote on a political
          theme is an "opinião política", which art. 5º, II lists as sensitive
          personal data, and consent for it may not ride along inside a blanket
          acceptance of terms. Hence its own box, its own rule, its own wording. */}
      <div className="rounded-card border border-line bg-canvas p-4">
        <Checkbox
          name="consent"
          value="1"
          label={
            <span className="text-[0.9rem] leading-[1.55]">
              Autorizo o Votto a registrar os meus votos em temas políticos para calcular
              o meu alinhamento com agentes públicos e partidos, e para compor totais
              agregados.
            </span>
          }
          hint="Voto é opinião política — dado sensível pela LGPD. Por isso pedimos esta autorização separadamente, e você pode revogá-la depois."
        />
        <p className="mt-3 border-t border-line pt-3 text-xs text-[var(--color-muted)]">
          Ao entrar, você concorda com os{" "}
          <a
            href="/termos"
            target="_blank"
            className="border-b border-navy-300 text-navy-800 hover:border-accent-500 hover:text-accent-500"
          >
            Termos de Serviço
          </a>{" "}
          e com a{" "}
          <a
            href="/privacidade"
            target="_blank"
            className="border-b border-navy-300 text-navy-800 hover:border-accent-500 hover:text-accent-500"
          >
            Política de Privacidade
          </a>
          .
        </p>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Confirmando…" : "Confirmar e entrar"}
      </Button>
    </form>
  );
}
