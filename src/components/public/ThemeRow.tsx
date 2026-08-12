/**
 * A theme as a line on the order paper.
 *
 * Replaces the card grid in the theme lists (docs/design.md): the bill reads as an
 * agenda entry — official identifier, headline, summary, subject tags, author —
 * with the voting panel set apart on the right behind a vertical hairline. Rows
 * are separated by 1px rules, so a list of forty bills reads as one document
 * instead of forty floating objects.
 */
import Link from "next/link";
import { TemperatureBar } from "@/components/public/TemperatureBar";
import { VoteButtons } from "@/components/public/VoteButtons";
import { ShareButton } from "@/components/public/ShareButton";
import { PriorityBadge } from "@/components/public/PriorityBadge";
import { ThemeAuthorLine } from "@/components/public/ThemeAuthorLine";
import { houseShortLabel, scopeLabel } from "@/lib/labels";
import type { PublicTheme } from "@/lib/dto";
import type { VoteValue } from "@/generated/prisma";

export function ThemeRow({
  theme,
  isAuthenticated,
  currentVote = null,
}: {
  theme: PublicTheme;
  isAuthenticated: boolean;
  currentVote?: VoteValue | null;
}) {
  const location = [theme.municipality, theme.state].filter(Boolean).join(" · ");

  return (
    <article className="grid gap-6 py-7 lg:grid-cols-[1fr_17rem] lg:gap-10">
      {/* ── The entry ──────────────────────────────────────────────── */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            {theme.house ? houseShortLabel[theme.house] : scopeLabel[theme.scope]}
            {theme.identifier ? ` · ${theme.identifier}` : ""}
            {location ? ` · ${location}` : ""}
          </span>
          <PriorityBadge band={theme.band} urgency={theme.urgency} situation={theme.situation} />
          <ShareButton
            kind="tema"
            kid={theme.kid}
            title={theme.name}
            className="ml-auto shrink-0"
          />
        </div>

        <Link href={`/temas/${theme.kid}`} className="group mt-2 block">
          <h3 className="text-[1.35rem] leading-snug text-navy-900 group-hover:underline">
            {/* The plain-language headline when we have one; the official
                ementa is still shown below and in full on the detail page. */}
            {theme.plainTitle ?? theme.name}
          </h3>
        </Link>

        {theme.plainSummary ?? theme.summary ? (
          <p className="mt-2 line-clamp-3 max-w-2xl text-sm leading-relaxed text-navy-700">
            {theme.plainSummary ?? theme.summary}
          </p>
        ) : null}

        {theme.classifications.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {theme.classifications.slice(0, 3).map((c) => (
              <span
                key={c.label}
                className="text-[0.7rem] uppercase tracking-[0.1em] text-[var(--color-muted)]"
                title={c.hierarchy ?? undefined}
              >
                {c.label}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 max-w-xl">
          <ThemeAuthorLine author={theme.author} />
        </div>
      </div>

      {/* ── The voting panel ───────────────────────────────────────── */}
      <div className="lg:border-l lg:border-line lg:pl-8">
        <TemperatureBar
          yesCount={theme.yesCount}
          noCount={theme.noCount}
          absCount={theme.absCount}
        />
        <div className="mt-4">
          <VoteButtons
            themeKid={theme.kid}
            isAuthenticated={isAuthenticated}
            currentValue={currentVote}
            size="sm"
          />
        </div>
      </div>
    </article>
  );
}

/** The list wrapper: hairline between entries, one rule closing the document. */
export function ThemeList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-[var(--color-line)] border-b border-line">{children}</div>;
}
