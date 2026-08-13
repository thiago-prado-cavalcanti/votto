"use client";

/**
 * Tabbed alignment ranking, set as a table.
 *
 * Three tabs (Deputados federais / Senadores / Partidos), each a ranked table
 * with an explicit index column — a table of standings rather than a card grid
 * (docs/design.md). The value shown is the global "alinhamento com eleitores"
 * when logged out, or the citizen's personal alignment when logged in (the parent
 * decides which).
 *
 * Switching tabs re-keys the body, so the new standings deal in from the top
 * rather than swapping in place — the one moment on the page where motion is
 * triggered by a click instead of the scroll (`.vt-rows`, globals.css).
 */
import * as React from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { alignmentInk } from "@/lib/domain/tone";
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
  /** `portrait` crops an agent photo into a circle; `logo` fits a party mark
   *  whole, unclipped and uncut. */
  avatarShape?: "portrait" | "logo";
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
  const logo = current.avatarShape === "logo";
  // A party mark gets no plate of its own — it fits whole inside its square and
  // `multiply` dissolves the white one some of them are exported on. A portrait
  // keeps the tinted square it is cropped into.
  const avatarClass = logo
    ? "object-contain mix-blend-multiply"
    : "rounded-full bg-navy-100 object-cover";

  return (
    <div>
      {/* Folder tabs: the ink rule runs the full width and the active tab is a
          paper card sitting on it, its bottom edge painted out so tab and panel
          read as one sheet. Every tab is flush with the rule — hence `items-end`
          and the −1px pull, which let the 1px borders land on the same pixel. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-navy-900">
        {/* `w-full` until sm keeps the tab strip on its own line, so the "Ver
            todos" link never wraps *under* it and steals the rule the tabs sit on. */}
        <div className="order-2 -mb-px flex w-full flex-wrap sm:order-none sm:w-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              aria-pressed={tab.key === current.key}
              className={cn(
                "border border-b px-[1.375rem] py-3 text-sm font-medium transition-colors",
                tab.key === current.key
                  ? "border-navy-900 border-b-surface bg-surface text-navy-900"
                  : "border-transparent text-[var(--color-muted)] hover:text-navy-900",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Sits on the tab labels' baseline, not down on the rule. */}
        {current.hrefAll ? (
          <ButtonLink
            href={current.hrefAll}
            variant="ghost"
            size="sm"
            className="order-1 mb-1 sm:order-none"
          >
            Ver todos →
          </ButtonLink>
        ) : null}
      </div>

      {current.rows.length === 0 ? (
        <p className="py-6 text-sm text-[var(--color-muted)]">Sem dados disponíveis.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-left">
            <thead>
              <tr className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                <th scope="col" className="w-10 py-2.5 pr-2 font-semibold">
                  #
                </th>
                <th scope="col" className="py-2.5 font-semibold">
                  {logo ? "Partido" : "Agente público"}
                </th>
                <th scope="col" className="hidden py-2.5 font-semibold sm:table-cell">
                  {logo ? "Sigla" : "Partido · UF"}
                </th>
                <th scope="col" className="py-2.5 pl-2 text-right font-semibold">
                  Alinhamento
                </th>
              </tr>
            </thead>
            <tbody key={current.key} className="vt-rows">
              {current.rows.map((row, i) => (
                <tr
                  key={row.kid}
                  className="border-t border-line transition-colors hover:bg-navy-50"
                >
                  <td className="py-2.5 pr-2 align-middle">
                    <span
                      className={cn(
                        "vt-num text-base",
                        i === 0 ? "text-accent-500" : "text-navy-400",
                      )}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-2.5 align-middle">
                    <Link href={row.href} className="flex items-center gap-3 group">
                      <ImageWithFallback
                        src={row.imageUrl}
                        alt={row.name}
                        className={cn("shrink-0", logo ? "h-8 w-auto max-w-24" : "h-9 w-9", avatarClass)}
                        fallback={
                          <div
                            className={cn(
                              "flex shrink-0 items-center justify-center text-[0.7rem] font-semibold text-navy-700",
                              logo ? "h-8" : "h-9 w-9 rounded-full bg-navy-100",
                            )}
                          >
                            {initialsOf(row.name)}
                          </div>
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-navy-900 group-hover:underline">
                          {row.name}
                        </span>
                        <span className="block truncate text-xs text-[var(--color-muted)] sm:hidden">
                          {row.subtitle}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden py-2.5 align-middle text-sm text-[var(--color-muted)] sm:table-cell">
                    {row.subtitle || "—"}
                  </td>
                  <td className="py-2.5 pl-2 text-right align-middle">
                    {row.alignment !== null ? (
                      <span className="vt-num text-lg" style={{ color: alignmentInk(row.alignment) }}>
                        {row.alignment}%
                      </span>
                    ) : (
                      <span className="text-xs text-navy-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
