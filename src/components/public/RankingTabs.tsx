"use client";

/**
 * Tabbed alignment ranking. A single card with tabs (Deputados federais /
 * Senadores / Partidos); each tab shows a numbered list ranked by alignment.
 * The value shown is the global "alinhamento com eleitores" when logged out, or
 * the citizen's personal alignment when logged in (the parent decides which).
 */
import * as React from "react";
import Link from "next/link";
import { Card, CardBody, ButtonLink } from "@/components/ui";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { cn } from "@/lib/cn";

export interface RankingRow {
  kid: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  alignment: number | null;
  href: string;
}

export interface RankingTab {
  key: string;
  label: string;
  rows: RankingRow[];
  hrefAll?: string;
  avatarShape?: "round" | "square";
}

function alignmentColor(v: number): string {
  return v >= 66
    ? "var(--color-positive)"
    : v >= 33
      ? "var(--color-neutral)"
      : "var(--color-negative)";
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function RankingTabs({ tabs }: { tabs: RankingTab[] }) {
  const [active, setActive] = React.useState(tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!current) return null;
  const avatarClass =
    current.avatarShape === "square"
      ? "rounded-lg border border-navy-200 bg-navy-50 object-contain p-0.5"
      : "rounded-full border border-navy-200 bg-navy-50 object-cover";

  return (
    <Card>
      <CardBody>
        {/* Tabs */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl bg-navy-100 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                aria-pressed={tab.key === current.key}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  tab.key === current.key
                    ? "bg-white text-navy-900 shadow-sm"
                    : "text-[var(--color-muted)] hover:text-navy-800",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {current.hrefAll ? (
            <ButtonLink href={current.hrefAll} variant="ghost" size="sm">
              Ver todos
            </ButtonLink>
          ) : null}
        </div>

        {/* List */}
        {current.rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted)]">Sem dados disponíveis.</p>
        ) : (
          <ol className="mt-2 divide-y divide-[var(--color-line)]">
            {current.rows.map((row, i) => (
              <li key={row.kid}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:bg-navy-50/60"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold",
                      i === 0 ? "bg-accent-500 text-navy-900" : "bg-navy-100 text-navy-700",
                    )}
                  >
                    {i + 1}
                  </span>
                  <ImageWithFallback
                    src={row.imageUrl}
                    alt={row.name}
                    className={cn("h-9 w-9", avatarClass)}
                    fallback={
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center bg-navy-100 text-xs font-bold text-navy-700",
                          current.avatarShape === "square" ? "rounded-lg" : "rounded-full",
                        )}
                      >
                        {initialsOf(row.name)}
                      </div>
                    }
                  />
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
