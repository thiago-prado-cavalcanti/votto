"use client";

/**
 * Client-side quick-vote control (Sim / Não / Abstenção).
 *
 * When the citizen is logged in it calls the `castVote` server action and
 * highlights the current choice. When not logged in, the buttons route to the
 * login page so the citizen can authenticate first.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { castVote } from "@/lib/actions/votes";
import type { VoteValue } from "@/generated/prisma";

const OPTIONS: Array<{ value: VoteValue; label: string }> = [
  { value: "YES", label: "Sim" },
  { value: "NO", label: "Não" },
  { value: "ABSTENTION", label: "Abstenção" },
];

export function VoteButtons({
  themeKid,
  isAuthenticated,
  currentValue = null,
  size = "md",
}: {
  themeKid: string;
  isAuthenticated: boolean;
  currentValue?: VoteValue | null;
  size?: "sm" | "md";
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
    <div>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const active = choice === opt.value;
          const tone =
            opt.value === "YES" ? "positive" : opt.value === "NO" ? "negative" : "neutral";
          return (
            <Button
              key={opt.value}
              type="button"
              size={size === "sm" ? "sm" : "md"}
              variant={active ? "primary" : "outline"}
              disabled={pending}
              onClick={() => handleVote(opt.value)}
              className={cn(
                active && tone === "positive" && "bg-[var(--color-positive)] hover:opacity-90",
                active && tone === "negative" && "bg-[var(--color-negative)] hover:opacity-90",
                active && tone === "neutral" && "bg-[var(--color-neutral)] hover:opacity-90",
              )}
              aria-pressed={active}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
      {choice ? (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Seu voto atual:{" "}
          <span className="font-medium text-navy-800">
            {OPTIONS.find((o) => o.value === choice)?.label}
          </span>
          . Você pode alterá-lo a qualquer momento.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-[var(--color-negative)]">{error}</p> : null}
    </div>
  );
}
