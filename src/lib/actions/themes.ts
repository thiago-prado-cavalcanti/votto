"use server";

/**
 * The continuation of the themes list — what the order paper hands over when the
 * citizen reaches the bottom of the page.
 *
 * A server action rather than a public API route, for the same reason the rest
 * of the site reads through DTOs: the rows come back already mapped by
 * `toPublicTheme`, so no internal id can travel out with them (CLAUDE.md §5),
 * and there is no second, unversioned contract to keep in step with the page.
 *
 * Reads only. The citizen's own vote rides along so an appended row can open on
 * "Seu voto" exactly like the rows rendered on the server.
 */
import { getCitizenSession } from "@/lib/auth/session";
import {
  loadThemePage,
  themeVotesFor,
  type ThemeListQuery,
  type ThemePage,
} from "@/lib/domain/theme-list";
import type { VoteValue } from "@/generated/prisma";

export interface MoreThemes extends ThemePage {
  /** The citizen's vote on each returned theme, keyed by public kid. */
  votes: Record<string, VoteValue>;
  /** Whether a session is open, which decides how the ballot renders. */
  isAuthenticated: boolean;
}

/**
 * Read the page of the themes list that follows the ones already on screen.
 *
 * @param query The list's filter/order state, exactly as it sits in the URL.
 * @param page  1-based page index; clamped server-side, so a hand-edited value
 *              can only ever ask for a page the list itself would serve.
 */
export async function loadMoreThemes(query: ThemeListQuery, page: number): Promise<MoreThemes> {
  const session = await getCitizenSession();
  const result = await loadThemePage(query, page);
  const votes = session
    ? await themeVotesFor(session.cpfHash, result.themes.map((t) => t.kid))
    : {};

  return { ...result, votes, isAuthenticated: Boolean(session) };
}
