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
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { castVote } from "@/lib/actions/votes";
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

  // Sync local choice when the server-provided current value changes (React's
  // recommended "adjust state during render" pattern — no effect needed).
  const [prevCurrent, setPrevCurrent] = React.useState<VoteValue | null>(currentValue);
  if (currentValue !== prevCurrent) {
    setPrevCurrent(currentValue);
    setChoice(currentValue);
  }

  function handleVote(value: VoteValue) {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await castVote(themeKid, value);
      if (result.ok) {
        setChoice(result.value ?? value);
        router.refresh();
      } else {
        setError(result.error ?? "Não foi possível registrar seu voto.");
      }
    });
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
                size === "sm" ? "h-10 text-base" : "h-12 text-lg",
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
      {choice ? (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Seu voto:{" "}
          <span className="font-medium text-navy-800">
            {OPTIONS.find((o) => o.value === choice)?.label}
          </span>
          . Pode ser alterado a qualquer momento.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-[var(--color-negative)]">{error}</p> : null}
    </div>
  );
}
