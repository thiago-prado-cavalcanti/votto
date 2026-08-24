"use client";

/**
 * The citizen's ballot: Sim / Não / Neutro.
 *
 * Voting is the platform's main action, so the three options are one printed
 * ballot rather than three loose buttons — three equal columns, **nothing inside
 * them but the word**. An option carries its vote pigment (moss / brick / stone)
 * from the start: the word and the rule around it are already in the colour the
 * tally will use, so the ballot is readable before anything is chosen and the
 * chosen one only has to be filled in solid, the way a form is filled with a pen.
 *
 * The word is set in the **display serif**, not the sans the rest of the kit's
 * buttons use: this is the one control that is a statement rather than a piece
 * of chrome, and it should read like the headline it answers (docs/design.md).
 *
 * Two colour notes, both about legibility rather than taste:
 * - stone is a fill, too light to set a word in, so the neutral option speaks in
 *   warm ink (`navy-600`) and keeps stone for its filled state;
 * - filled stone is a mid tone, so its word is ink where the other two are paper.
 *
 * When the citizen is logged in it calls the `castVote` server action and marks
 * the current choice. When not, the options route to the login page so the
 * citizen can authenticate first.
 *
 * **The confirmation.** Once per session, the first vote is held while the
 * citizen answers for three digits of their CPF and one part of their birth
 * date (`@/lib/auth/vote-challenge`). It opens *below the ballot, with the
 * chosen option already filled in* — the vote has been cast as far as the
 * citizen is concerned, and this is the signature under it, not a second
 * decision. Every later vote in the session goes straight through.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { castVote, confirmAndCastVote } from "@/lib/actions/votes";
import { describeField, type VoteChallenge } from "@/lib/auth/vote-challenge-shape";
import type { VoteValue } from "@/generated/prisma";

const OPTIONS: Array<{
  value: VoteValue;
  label: string;
  /** The word and its rule on paper. */
  ink: string;
  /** The block once it is chosen. */
  fill: string;
  /** The word on that block. */
  on: string;
}> = [
  {
    value: "YES",
    label: "Sim",
    ink: "var(--color-vote-yes)",
    fill: "var(--color-vote-yes)",
    on: "var(--color-navy-50)",
  },
  {
    value: "NO",
    label: "Não",
    ink: "var(--color-vote-no)",
    fill: "var(--color-vote-no)",
    on: "var(--color-navy-50)",
  },
  {
    value: "ABSTENTION",
    label: "Neutro",
    ink: "var(--color-navy-600)",
    fill: "var(--color-vote-abstention)",
    on: "var(--color-navy-900)",
  },
];

/** "1º, 4º e 9º" — the positions read the way someone counts them on a card. */
function ordinals(positions: readonly number[]): string {
  const parts = positions.map((p) => `${p}º`);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`
    : parts[0];
}

export function VoteButtons({
  themeKid,
  isAuthenticated,
  currentValue = null,
  size = "md",
  className,
}: {
  themeKid: string;
  isAuthenticated: boolean;
  currentValue?: VoteValue | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [choice, setChoice] = React.useState<VoteValue | null>(currentValue);
  const [error, setError] = React.useState<string | null>(null);

  // The held vote and the question standing between it and the tally.
  const [challenge, setChallenge] = React.useState<VoteChallenge | null>(null);
  const [heldVote, setHeldVote] = React.useState<VoteValue | null>(null);
  const [cpfDigits, setCpfDigits] = React.useState("");
  const [dateDigits, setDateDigits] = React.useState("");

  // Sync local choice when the server-provided current value changes (React's
  // recommended "adjust state during render" pattern — no effect needed).
  const [prevCurrent, setPrevCurrent] = React.useState<VoteValue | null>(currentValue);
  if (currentValue !== prevCurrent) {
    setPrevCurrent(currentValue);
    setChoice(currentValue);
  }

  function handleVote(value: VoteValue) {
    if (!isAuthenticated) {
      // Carry the bill through the sign-in. The value is deliberately NOT
      // carried: a vote is recorded when the citizen presses the button, never
      // replayed from a parameter afterwards (src/lib/auth/return-to.ts).
      // Read from the document rather than `useSearchParams`, which would put
      // this component behind a Suspense boundary on every page that mounts it.
      const here = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await castVote(themeKid, value);
      if (result.ok) {
        setChoice(result.value ?? value);
        router.refresh();
        return;
      }
      if (result.challenge) {
        // Hold the vote and show the signature line. The ballot keeps the
        // chosen option filled so the citizen can see what they are confirming.
        setChallenge(result.challenge);
        setHeldVote(value);
        setChoice(value);
        setCpfDigits("");
        setDateDigits("");
        return;
      }
      setError(result.error ?? "Não foi possível registrar seu voto.");
    });
  }

  function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (!heldVote) return;
    setError(null);

    startTransition(async () => {
      const result = await confirmAndCastVote(themeKid, heldVote, cpfDigits, dateDigits);
      if (result.ok) {
        setChallenge(null);
        setHeldVote(null);
        setChoice(result.value ?? heldVote);
        router.refresh();
        return;
      }
      if (result.reauthenticate) {
        router.push("/login");
        return;
      }
      if (result.challenge) setChallenge(result.challenge);
      setCpfDigits("");
      setDateDigits("");
      setError(result.error ?? "Não foi possível confirmar o seu voto.");
    });
  }

  function cancelChallenge() {
    setChallenge(null);
    setHeldVote(null);
    setChoice(currentValue);
    setError(null);
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const active = choice === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={pending}
              onClick={() => handleVote(opt.value)}
              aria-pressed={active}
              // The pigment travels as custom properties so hover can be a class
              // (an inline `border-color` would win over any `hover:` utility).
              style={
                {
                  "--vt-ink": active ? opt.fill : opt.ink,
                  "--vt-soft": `color-mix(in srgb, ${opt.ink} 38%, transparent)`,
                  // Translucent pigment closed by a stroke of the same pigment:
                  // the radar's petal, at the size of a button.
                  "--vt-tint": `color-mix(in srgb, ${opt.ink} 7%, transparent)`,
                  "--vt-tint-hover": `color-mix(in srgb, ${opt.ink} 14%, transparent)`,
                  "--vt-on": opt.on,
                } as React.CSSProperties
              }
              className={cn(
                "font-display inline-flex items-center justify-center rounded-card border",
                "transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
                // Even the compact ballot clears 44px on a phone: it is the
                // platform's one action, and 40px is under the floor every
                // touch guideline sets. The 40 come back from `sm` up, where
                // the row is a mouse target beside a `size="sm"` button.
                size === "sm" ? "h-11 text-base sm:h-10" : "h-12 text-lg",
                active
                  ? "border-[var(--vt-ink)] bg-[var(--vt-ink)] text-[var(--vt-on)]"
                  : "border-[var(--vt-soft)] bg-[var(--vt-tint)] text-[var(--vt-ink)] hover:border-[var(--vt-ink)] hover:bg-[var(--vt-tint-hover)]",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {/* The signature line. A terracota rule opens it, the way the voting panel
          itself opens — this is part of the same action, not a warning. */}
      {challenge ? (
        <form onSubmit={handleConfirm} className="mt-3 rounded-card border border-line bg-canvas">
          <div className="h-[3px] rounded-t-card bg-accent-500" />
          <div className="p-4">
            <p className="text-sm leading-snug text-navy-900">
              <span className="font-semibold">Confirme que é você.</span> Uma vez por
              sessão, para o seu voto valer.
            </p>

            <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  {ordinals(challenge.positions)} dígitos do seu CPF
                </span>
                <input
                  value={cpfDigits}
                  onChange={(e) => setCpfDigits(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  placeholder="000"
                  aria-label={`${ordinals(challenge.positions)} dígitos do seu CPF`}
                  className="vt-num mt-1.5 h-11 w-full rounded-card border border-line bg-surface px-3 text-lg tracking-[0.35em] text-navy-900 outline-none focus-visible:border-navy-900"
                />
              </label>

              <label className="block">
                <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  {describeField(challenge.field)} do seu nascimento
                </span>
                <input
                  value={dateDigits}
                  onChange={(e) => setDateDigits(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  placeholder={challenge.field === "year" ? "00" : "00"}
                  aria-label={`${describeField(challenge.field)} do seu nascimento`}
                  className="vt-num mt-1.5 h-11 w-full rounded-card border border-line bg-surface px-3 text-lg tracking-[0.35em] text-navy-900 outline-none focus-visible:border-navy-900"
                />
              </label>
            </div>

            {challenge.field === "year" ? (
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                Os dois últimos dígitos do ano — 1976 vira <span className="vt-num">76</span>.
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 text-xs text-[var(--color-negative)]">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                disabled={pending || cpfDigits.length < 3 || dateDigits.length < 2}
                className="font-display inline-flex h-11 items-center justify-center rounded-card bg-navy-900 px-5 text-base text-navy-50 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "Confirmando…" : "Confirmar voto"}
              </button>
              <button
                type="button"
                onClick={cancelChallenge}
                className="text-xs text-[var(--color-muted)] underline hover:text-navy-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {choice && !challenge ? (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Seu voto:{" "}
          <span className="font-medium text-navy-800">
            {OPTIONS.find((o) => o.value === choice)?.label}
          </span>
          . Pode ser alterado a qualquer momento.
        </p>
      ) : null}
      {error && !challenge ? (
        <p className="mt-2 text-xs text-[var(--color-negative)]">{error}</p>
      ) : null}
    </div>
  );
}
