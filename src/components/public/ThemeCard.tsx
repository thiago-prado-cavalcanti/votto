/**
 * Card summarizing a theme in lists, with scope badge, temperature/tallies and a
 * quick-vote control.
 */
import Link from "next/link";
import { Card, CardBody, Badge } from "@/components/ui";
import { TemperatureBar } from "@/components/public/TemperatureBar";
import { VoteButtons } from "@/components/public/VoteButtons";
import { scopeLabel } from "@/lib/labels";
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
          <Badge tone="navy">{scopeLabel[theme.scope]}</Badge>
          {location ? (
            <span className="text-xs text-[var(--color-muted)]">{location}</span>
          ) : null}
        </div>
        <Link href={`/temas/${theme.kid}`} className="group">
          <h3 className="text-lg font-semibold leading-snug text-navy-900 group-hover:text-navy-600">
            {theme.name}
          </h3>
        </Link>
        {theme.summary ? (
          <p className="line-clamp-3 text-sm text-[var(--color-muted)]">{theme.summary}</p>
        ) : null}
        <div className="mt-auto pt-2">
          <TemperatureBar
            yesCount={theme.yesCount}
            noCount={theme.noCount}
            absCount={theme.absCount}
          />
        </div>
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
