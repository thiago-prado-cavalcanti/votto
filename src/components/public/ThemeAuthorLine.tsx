/**
 * Who is behind a bill, for the footer of a theme card and its detail page.
 *
 * Accountability is the point of the platform, so a theme should show a face
 * wherever one exists. The role label is not decoration: "Autor" is a much
 * stronger claim than "Relator" — one wrote the bill, the other was assigned to
 * it — and conflating them would misattribute authorship.
 *
 * Renders nothing when the source names nobody.
 */
import Link from "next/link";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { agentTypeLabel } from "@/lib/labels";
import type { ThemeAuthor } from "@/lib/dto";

const ROLE_LABEL: Record<ThemeAuthor["role"], string> = {
  PROPOSER: "Autor",
  RAPPORTEUR: "Relator",
};

/** Initials for the photo fallback — official photo coverage is incomplete. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function ThemeAuthorLine({ author }: { author: ThemeAuthor | null }) {
  if (!author) return null;

  const { agent } = author;
  const party = agent?.party;
  const partyLabel = party?.acronym ?? party?.name ?? null;
  // A non-parliamentary author (a committee, the Executive) has no page to open.
  const subtitle = agent
    ? [agentTypeLabel[agent.type], partyLabel, agent.state].filter(Boolean).join(" · ")
    : "Autoria institucional";

  const body = (
    <>
      <ImageWithFallback
        src={agent?.imageUrl}
        alt={author.name}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
        fallback={
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-[11px] font-semibold text-navy-700"
            aria-hidden
          >
            {initials(author.name)}
          </div>
        }
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-navy-900">
          {author.name}
        </span>
        <span className="block truncate text-xs text-[var(--color-muted)]">{subtitle}</span>
      </span>
    </>
  );

  return (
    <div className="flex items-center gap-3 border-t border-line pt-3">
      <span className="shrink-0 rounded-[2px] border border-line bg-canvas px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {ROLE_LABEL[author.role]}
      </span>
      {agent ? (
        <Link
          href={`/agentes/${agent.kid}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-card transition-colors hover:bg-navy-50/60"
        >
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
    </div>
  );
}
