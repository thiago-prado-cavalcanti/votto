/**
 * Card summarizing a theme in lists, with scope badge, temperature/tallies and a
 * quick-vote control.
 */
import Link from "next/link";
import { Card, CardBody, Badge } from "@/components/ui";
import { TemperatureBar } from "@/components/public/TemperatureBar";
import { VoteButtons } from "@/components/public/VoteButtons";
import { ShareButton } from "@/components/public/ShareButton";
import { PriorityBadge } from "@/components/public/PriorityBadge";
import { ThemeAuthorLine } from "@/components/public/ThemeAuthorLine";
import { houseShortLabel, scopeLabel } from "@/lib/labels";
import type { PublicTheme } from "@/lib/dto";
import type { VoteValue } from "@/generated/prisma";

export function ThemeCard({
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
    <Card className="flex h-full flex-col">
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="navy">
              {theme.house ? houseShortLabel[theme.house] : scopeLabel[theme.scope]}
            </Badge>
            <PriorityBadge
              band={theme.band}
              urgency={theme.urgency}
              situation={theme.situation}
            />
          </div>
          <div className="flex items-center gap-2">
            {location ? (
              <span className="text-xs text-[var(--color-muted)]">{location}</span>
            ) : null}
            <ShareButton kind="tema" kid={theme.kid} title={theme.name} />
          </div>
        </div>
        <Link href={`/temas/${theme.kid}`} className="group">
          {theme.identifier ? (
            <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              {theme.identifier}
            </span>
          ) : null}
          <h3 className="text-lg font-semibold leading-snug text-navy-900 group-hover:text-navy-600">
            {/* The plain-language headline when we have one; the official
                ementa is still shown below and in full on the detail page. */}
            {theme.plainTitle ?? theme.name}
          </h3>
        </Link>
        {theme.plainSummary ?? theme.summary ? (
          <p className="line-clamp-3 text-sm text-[var(--color-muted)]">
            {theme.plainSummary ?? theme.summary}
          </p>
        ) : null}
        {theme.classifications.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {theme.classifications.slice(0, 2).map((c) => (
              <span
                key={c.label}
                className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-[var(--color-muted)]"
                title={c.hierarchy ?? undefined}
              >
                {c.label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-auto pt-2">
          <TemperatureBar
            yesCount={theme.yesCount}
            noCount={theme.noCount}
            absCount={theme.absCount}
          />
        </div>
        <ThemeAuthorLine author={theme.author} />

        <div className="pt-1">
          <VoteButtons
            themeKid={theme.kid}
            isAuthenticated={isAuthenticated}
            currentValue={currentVote}
            size="sm"
          />
        </div>
      </CardBody>
    </Card>
  );
}
