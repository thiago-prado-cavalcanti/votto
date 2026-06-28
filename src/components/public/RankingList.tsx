/**
 * Compact alignment ranking list (numbered). Each row shows rank, avatar, name,
 * a subtitle (party · state) and the citizen's alignment score. Used on the home
 * page for the top deputies / senators / parties. Server-component friendly.
 */
import Link from "next/link";
import { Card, CardBody, ButtonLink } from "@/components/ui";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";

export interface RankingRow {
  kid: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  alignment: number | null;
  href: string;
}

function alignmentColor(v: number): string {
  return v >= 66
    ? "var(--color-positive)"
    : v >= 33
      ? "var(--color-neutral)"
      : "var(--color-negative)";
}

function rankTone(rank: number): string {
  return rank === 1 ? "bg-accent-500 text-navy-900" : "bg-navy-100 text-navy-700";
}

function Avatar({ src, name, rounded }: { src: string | null; name: string; rounded: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <ImageWithFallback
      src={src}
      alt={name}
      className={`h-9 w-9 ${rounded} object-cover`}
      fallback={
        <div
          className={`flex h-9 w-9 items-center justify-center ${rounded} bg-navy-100 text-xs font-bold text-navy-700`}
        >
          {initials}
        </div>
      }
    />
  );
}

export function RankingList({
  title,
  rows,
  hrefAll,
  avatarShape = "round",
}: {
  title: string;
  rows: RankingRow[];
  hrefAll?: string;
  avatarShape?: "round" | "square";
}) {
  const rounded = avatarShape === "round" ? "rounded-full" : "rounded-lg bg-white object-contain p-0.5";

  return (
    <Card className="h-full">
      <CardBody>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-navy-900">{title}</h3>
          {hrefAll ? (
            <ButtonLink href={hrefAll} variant="ghost" size="sm">
              Ver todos
            </ButtonLink>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted)]">Sem dados disponíveis.</p>
        ) : (
          <ol className="mt-3 divide-y divide-[var(--color-line)]">
            {rows.map((row, i) => (
              <li key={row.kid}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:bg-navy-50/60"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${rankTone(
                      i + 1,
                    )}`}
                  >
                    {i + 1}
                  </span>
                  <Avatar src={row.imageUrl} name={row.name} rounded={rounded} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-900">{row.name}</p>
                    <p className="truncate text-xs text-[var(--color-muted)]">{row.subtitle}</p>
                  </div>
                  {row.alignment !== null ? (
                    <span
                      className="font-display text-base font-extrabold tabular-nums"
                      style={{ color: alignmentColor(row.alignment) }}
                    >
                      {row.alignment}%
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-navy-300">—</span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
