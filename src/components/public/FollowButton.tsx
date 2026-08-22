"use client";

/**
 * The follow control — "Seguir" — on an agent's card and on their record.
 *
 * Outline and small, in ink — the same treatment as `ShareButton`, and
 * deliberately the same: these are the two secondary actions a record carries,
 * they sit side by side on the agent's masthead, and two different shapes there
 * would read as two different kinds of thing. Terracota is reserved for the
 * ballot, which is the page's loud action; a second pigment block beside it
 * would compete with the vote for the same attention (docs/design.md §9).
 *
 * Four states, which are the one-per-office rule made visible:
 *
 * - `anonymous`  — the invitation; the click goes to the login, as the ballot's does.
 * - `available`  — "Seguir", opening the sheet that explains before recording.
 * - `following`  — this is the declared one; the control becomes the way back out.
 * - `taken`      — **no button at all.** The office belongs to somebody else, and
 *                  instead of a disabled control the citizen gets a line naming
 *                  who holds it, linked. That keeps the swap findable without the
 *                  platform pretending you can follow two deputies at once.
 * - `unavailable`— a mandate that ended; nothing to declare, nothing to print.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { FollowDialog } from "@/components/public/FollowDialog";
import { followAgent, unfollowAgent } from "@/lib/actions/follows";

/** What the control should render for one agent, resolved server-side. */
export type FollowSlot =
  | { kind: "anonymous" }
  | { kind: "available" }
  | { kind: "following" }
  | { kind: "taken"; agentKid: string; agentName: string }
  | { kind: "unavailable" };

export function FollowButton({
  agentKid,
  agentName,
  officeLabel,
  slot,
  className,
}: {
  agentKid: string;
  agentName: string;
  /** The office in running prose — "deputado federal". */
  officeLabel: string;
  slot: FollowSlot;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const close = React.useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  if (slot.kind === "unavailable") return null;

  if (slot.kind === "taken") {
    return (
      <p className={cn("text-xs leading-relaxed text-[var(--color-muted)]", className)}>
        Você já acompanha{" "}
        <Link
          href={`/agentes/${slot.agentKid}`}
          className="border-b border-navy-300 text-navy-700 transition-colors hover:border-accent-500 hover:text-accent-600"
        >
          {slot.agentName}
        </Link>{" "}
        como {officeLabel}.
      </p>
    );
  }

  const isFollowing = slot.kind === "following";

  function onClick() {
    if (slot.kind === "anonymous") {
      router.push("/login");
      return;
    }
    setError(null);
    setOpen(true);
  }

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = isFollowing ? await unfollowAgent(agentKid) : await followAgent(agentKid);
      if (result.ok) {
        close();
        router.refresh();
        return;
      }
      setError(result.error ?? "Não foi possível registrar agora. Tente em instantes.");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={
          isFollowing ? `Deixar de acompanhar ${agentName}` : `Acompanhar ${agentName}`
        }
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-card border border-navy-300 bg-surface px-3 py-1.5 text-xs font-semibold text-navy-900 transition-colors hover:border-navy-900 hover:bg-navy-100",
          className,
        )}
      >
        {isFollowing ? (
          <>
            {/* An ink tick, the same mark the ballot checkboxes use. */}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              aria-hidden
            >
              <path d="m4 12.5 5.5 5.5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Seguindo
          </>
        ) : (
          "Seguir"
        )}
      </button>

      {open ? (
        <FollowDialog
          mode={isFollowing ? "unfollow" : "follow"}
          agentName={agentName}
          officeLabel={officeLabel}
          pending={pending}
          error={error}
          onConfirm={onConfirm}
          onClose={close}
        />
      ) : null}
    </>
  );
}
