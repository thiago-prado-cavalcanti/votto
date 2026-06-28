/**
 * Positioning queries: load votes + theme dimensions and compute a Position for
 * an agent or a citizen (CLAUDE.md §3.2). Thin DB layer over the pure
 * `computePosition` function.
 */
import "server-only";
import { db } from "@/lib/db";
import { computePosition, type Position } from "@/lib/indexes/positioning";

/** Political position of a public agent (by internal id). */
export async function getAgentPosition(agentId: string): Promise<Position> {
  const votes = await db.vote.findMany({
    where: { agentId, voterType: "AGENT" },
    select: { value: true, theme: { select: { dimensions: true } } },
  });
  return computePosition(votes.map((v) => ({ value: v.value, dimensions: v.theme.dimensions })));
}

/** Political position of a citizen (by internal id). */
export async function getCitizenPosition(userId: string): Promise<Position> {
  const votes = await db.vote.findMany({
    where: { userId, voterType: "USER" },
    select: { value: true, theme: { select: { dimensions: true } } },
  });
  return computePosition(votes.map((v) => ({ value: v.value, dimensions: v.theme.dimensions })));
}

/**
 * Aggregate political position of a party (by internal id), computed from the
 * combined votes of all its active agents.
 */
export async function getPartyPosition(partyId: string): Promise<Position> {
  const votes = await db.vote.findMany({
    where: { voterType: "AGENT", agent: { partyId, status: "ACTIVE" } },
    select: { value: true, theme: { select: { dimensions: true } } },
  });
  return computePosition(votes.map((v) => ({ value: v.value, dimensions: v.theme.dimensions })));
}
