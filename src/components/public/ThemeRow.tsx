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
      className="grid gap-4 py-7 lg:grid-cols-[1fr_17rem] lg:gap-x-10 lg:gap-y-6"
    >
      {/* ── The heading ────────────────────────────────────────────────
          Split from the rest of the entry so the ballot can sit between them
          on a phone. On a wide screen the two halves rejoin as one column and
          the panel stands beside them, which is the desktop layout unchanged. */}
      <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
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
          <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-navy-700 lg:line-clamp-3">
            {theme.plainSummary ?? theme.summary}
          </p>
        ) : null}

      </div>

      {/* ── The tail: what the bill is filed under, and who signs it ──── */}
      <div className="order-3 min-w-0 lg:col-start-1 lg:row-start-2">
        {theme.classifications.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
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

        <div className="mt-3 max-w-xl lg:mt-4">
          <ThemeAuthorLine author={theme.author} />
        </div>
      </div>

      {/* ── The voting panel ───────────────────────────────────────────
          No plate: the panel sits on the paper like the rest of the entry, and
          the column is separated by a single hairline. The result and the
          ballot carry their own weight — the share set large in pigment, the
          ballot in its vote colours under a terracota prompt — so a box around
          them only added furniture. */}
      <div className="order-2 flex flex-col lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:border-l lg:border-line lg:pl-8">
        {/* On a phone the ballot comes first and the tally after it. In a column
            the tally is 120px of figures standing between the headline and the
            action the page exists for — and it reads better once the citizen has
            voted anyway. Side by side on a wide screen the original order holds,
            because there the tally costs no vertical distance at all. */}
        <div className="order-2 lg:order-none">
          <TemperatureBar
            yesCount={theme.yesCount}
            noCount={theme.noCount}
            absCount={theme.absCount}
          />
        </div>
        <div className="order-1 border-t border-line pt-3.5 lg:order-none lg:mt-4">
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
            className="mt-2 mb-4 lg:mb-0"
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
