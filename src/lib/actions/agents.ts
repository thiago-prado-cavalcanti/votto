"use server";

/**
 * The continuation of the agents list — what the bench hands over when the
 * citizen reaches the bottom of the page.
 *
 * A server action rather than a public API route, for the same reason the rest
 * of the site reads through DTOs: the rows come back already mapped by
 * `toPublicAgent`, so no internal id can travel out with them (CLAUDE.md §5),
 * and there is no second, unversioned contract to keep in step with the page.
 *
 * Reads only. The viewer's own alignment and follow state ride along, so an
 * appended card carries exactly the same three readings as one the server
 * rendered.
 */
import { db } from "@/lib/db";
import { getCitizenSession } from "@/lib/auth/session";
import { loadAgentPage, type AgentListQuery, type AgentPage } from "@/lib/domain/agent-list";

/**
 * Read the page of the agents list that follows the ones already on screen.
 *
 * @param query The list's filter/order state, exactly as it sits in the URL.
 * @param page  1-based page index; clamped server-side, so a hand-edited value
 *              can only ever ask for a page the list itself would serve.
 */
export async function loadMoreAgents(query: AgentListQuery, page: number): Promise<AgentPage> {
  const session = await getCitizenSession();
  const viewer = session
    ? await db.user.findUnique({
        where: { kid: session.userKid },
        select: { id: true, voteVersion: true },
      })
    : null;

  return loadAgentPage(
    query,
    page,
    viewer ? { userId: viewer.id, voteVersion: viewer.voteVersion } : null,
  );
}
