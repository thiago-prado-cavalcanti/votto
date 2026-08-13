/**
 * A theme as a line on the order paper.
 *
 * Replaces the card grid in the theme lists (docs/design.md): the bill reads as an
 * agenda entry — official identifier, headline, summary, subject tags, author —
 * with the voting panel set apart on the right as a plate of paper. Rows are
 * separated by 1px rules, so a list of forty bills reads as one document instead
 * of forty floating objects, while the one thing the citizen is here to do keeps
 * an edge of its own.
 *
 * Each entry arrives on its own scroll position rather than the list arriving as
 * a block: an order paper is read one line at a time, and a sixty-row list that
 * animated as a unit would either fire entirely off-screen or lurch. `delay`
 * offsets rows that share a screen so they don't land in perfect unison.
 */
import Link from "next/link";
import { Reveal } from "@/components/public/motion";
import { TemperatureBar } from "@/components/public/TemperatureBar";
import { VoteButtons } from "@/components/public/VoteButtons";
import { ShareButton } from "@/components/public/ShareButton";
import { PriorityBadge } from "@/components/public/PriorityBadge";
import { ThemeAuthorLine } from "@/components/public/ThemeAuthorLine";
import { cn } from "@/lib/cn";
import { houseShortLabel, scopeLabel } from "@/lib/labels";
import type { PublicTheme } from "@/lib/dto";
import type { VoteValue } from "@/generated/prisma";

export function ThemeRow({
  theme,
  isAuthenticated,
  currentVote = null,
  delay = 0,
}: {
  theme: PublicTheme;
  isAuthenticated: boolean;
  currentVote?: VoteValue | null;
  /** Offset for rows that arrive on the same screen, in ms. */
  delay?: number;
}) {
  const location = [theme.municipality, theme.state].filter(Boolean).join(" · ");

  return (
    <Reveal
      as="article"
      delay={delay}
      className="grid gap-6 py-7 lg:grid-cols-[1fr_17rem] lg:gap-10"
    >
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

      {/* ── The voting panel ───────────────────────────────────────────
          No plate: the panel sits on the paper like the rest of the entry, and
          the column is separated by a single hairline. The result and the
          ballot carry their own weight — the share set large in pigment, the
          ballot in its vote colours under a terracota prompt — so a box around
          them only added furniture. */}
      <div className="lg:border-l lg:border-line lg:pl-8">
        <TemperatureBar
          yesCount={theme.yesCount}
          noCount={theme.noCount}
          absCount={theme.absCount}
        />
        <div className="mt-4 border-t border-line pt-3.5">
          <span
            className={cn(
              "text-[0.7rem] font-semibold uppercase tracking-[0.12em]",
              currentVote
                ? "text-[var(--color-muted)]"
                : "text-[var(--color-accent-600)]",
            )}
          >
            {currentVote ? "Seu voto" : "Vote neste tema"}
          </span>
          <VoteButtons
            className="mt-2"
            themeKid={theme.kid}
            isAuthenticated={isAuthenticated}
            currentValue={currentVote}
            size="sm"
          />
        </div>
      </div>
    </Reveal>
  );
}

/** The list wrapper: hairline between entries, one rule closing the document. */
export function ThemeList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-[var(--color-line)] border-b border-line">{children}</div>;
}
