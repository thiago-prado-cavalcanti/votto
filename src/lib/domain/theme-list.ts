/**
 * The themes list, as one query shared by the page and by the "load more" that
 * continues it.
 *
 * It lives here rather than in the page because the list is now read in two
 * places: `/temas` renders the first page on the server, and a server action
 * appends the next ones as the citizen scrolls. Two copies of the filter
 * translation would be two chances for the appended rows to answer a slightly
 * different question than the ones already on screen — and the masthead plate,
 * which counts the whole match, would then describe neither.
 *
 * Pagination is by offset, not by cursor. The list is filtered, ranked and
 * capped, so the failure mode of an offset (a row inserted mid-scroll shifts the
 * window by one) is a duplicate entry in a list of hundreds — against a cursor,
 * which would have to encode the tie-break of three different orderings. The
 * simplest design that meets the requirement (CLAUDE.md §10).
 */
import { db } from "@/lib/db";
import { THEME_AUTHOR_INCLUDE, toPublicTheme, type PublicTheme } from "@/lib/dto";
import { themeSearchFilter } from "@/lib/domain/search";
import { themeTemperature } from "@/lib/domain/theme";
import { scopeLabel, houseLabel } from "@/lib/labels";
import type { Scope, House, Prisma, VoteValue } from "@/generated/prisma";

/** Rows per page, on the first render and on every appended one. */
export const THEME_PAGE_SIZE = 60;

/**
 * Ceiling on how far the list can be scrolled, in pages.
 *
 * An unbounded offset is an unbounded query: `skip` makes Postgres walk every
 * skipped row, so page 500 costs 500 pages of work to return one. Thirty
 * thousand bills is far past any real reading of an order paper, and the search
 * box is the right tool past that point.
 */
export const THEME_MAX_PAGES = 25;

const SCOPES = Object.keys(scopeLabel) as Scope[];
const HOUSES = Object.keys(houseLabel) as House[];

/** Available orderings, with the SQL that implements each. */
export const THEME_ORDERINGS = {
  priority: {
    label: "Prioridade na pauta",
    orderBy: [{ priority: "desc" }, { lastActionAt: "desc" }] as Prisma.ThemeOrderByWithRelationInput[],
  },
  recent: {
    label: "Movimentação mais recente",
    orderBy: [{ lastActionAt: "desc" }, { priority: "desc" }] as Prisma.ThemeOrderByWithRelationInput[],
  },
  engagement: {
    label: "Mais votados no Votto",
    orderBy: [{ yesCount: "desc" }, { noCount: "desc" }] as Prisma.ThemeOrderByWithRelationInput[],
  },
} as const;

export type ThemeOrdering = keyof typeof THEME_ORDERINGS;

/** The list's state, exactly as it travels in the URL. */
export interface ThemeListQuery {
  scope?: string;
  state?: string;
  house?: string;
  q?: string;
  order?: string;
  open?: string;
}

/** Read the ordering out of the query, falling back to the default ranking. */
export function themeOrdering(order: string | undefined): ThemeOrdering {
  return order && order in THEME_ORDERINGS ? (order as ThemeOrdering) : "priority";
}

/** Whether the list is restricted to bills still in progress (the default). */
export function themeOnlyOpen(open: string | undefined): boolean {
  return open !== "0";
}

/**
 * Translate the URL state into a Prisma filter.
 *
 * Search is ANDed with the selects rather than replacing them, which is what
 * lets the box and the filters work as one form: every control narrows the same
 * query (CLAUDE.md §4).
 */
export function themeListWhere(query: ThemeListQuery): Prisma.ThemeWhereInput {
  const where: Prisma.ThemeWhereInput = { status: "ACTIVE" };
  if (query.scope && SCOPES.includes(query.scope as Scope)) where.scope = query.scope as Scope;
  if (query.state) where.state = query.state;
  if (query.house && HOUSES.includes(query.house as House)) where.house = query.house as House;
  if (themeOnlyOpen(query.open)) where.inProgress = true;

  const search = themeSearchFilter(query.q);
  if (search) where.AND = search;

  return where;
}

/** One page of the list, plus whether the citizen can keep scrolling. */
export interface ThemePage {
  themes: PublicTheme[];
  /** 1-based index of the page returned. */
  page: number;
  hasMore: boolean;
}

/**
 * Read one page of the themes list.
 *
 * `page` is 1-based and clamped to {@link THEME_MAX_PAGES}. `hasMore` is
 * answered by asking for one row past the page rather than by a second `count`:
 * the masthead already pays for the counts it prints, and this one only has to
 * decide whether to keep the sentinel alive.
 */
export async function loadThemePage(query: ThemeListQuery, page = 1): Promise<ThemePage> {
  const safePage = Math.min(Math.max(Math.trunc(page) || 1, 1), THEME_MAX_PAGES);
  const ordering = themeOrdering(query.order);

  const rows = await db.theme.findMany({
    where: themeListWhere(query),
    orderBy: THEME_ORDERINGS[ordering].orderBy,
    skip: (safePage - 1) * THEME_PAGE_SIZE,
    take: THEME_PAGE_SIZE + 1,
    include: THEME_AUTHOR_INCLUDE,
  });

  const hasMore = rows.length > THEME_PAGE_SIZE && safePage < THEME_MAX_PAGES;
  const themes = rows.slice(0, THEME_PAGE_SIZE).map(toPublicTheme);

  // Engagement ordering is refined in memory: the temperature curve is
  // logarithmic, so raw tallies alone don't reproduce it. Refined WITHIN the
  // page, which is what keeps paging coherent — a global re-sort would have to
  // read every match to place the first row.
  if (ordering === "engagement") {
    themes.sort((a, b) => themeTemperature(b) - themeTemperature(a));
  }

  return { themes, page: safePage, hasMore };
}

/**
 * The citizen's own vote on each of the given themes, keyed by public kid.
 *
 * Read per page rather than for the whole list: the ballot on a row nobody has
 * scrolled to yet is not worth a query.
 */
export async function themeVotesFor(
  cpfHash: string,
  kids: string[],
): Promise<Record<string, VoteValue>> {
  if (kids.length === 0) return {};
  const votes = await db.vote.findMany({
    where: { cpfHash, voterType: "USER", theme: { kid: { in: kids } } },
    select: { value: true, theme: { select: { kid: true } } },
  });
  return Object.fromEntries(votes.map((v) => [v.theme.kid, v.value]));
}
