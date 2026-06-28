/**
 * Alignment Index (CLAUDE.md §3.1) — the platform's primary feature.
 *
 * For the logged-in citizen, compute how aligned each public agent (and party) is
 * with that citizen's voting record:
 *   - votes map to numbers: YES=+1, NO=-1, ABSTENTION=0
 *   - alignment is the mean agreement over the set of themes BOTH voted on,
 *     normalized to 0–100% (100 = identical, 0 = opposite).
 *
 * Performance design:
 *   - an agent has at most one vote per theme, so agent vote vectors are small and
 *     stable — we read them straight from the DB;
 *   - per-agent results for a citizen are cached in Redis, keyed by the citizen's
 *     `voteVersion` so the cache self-invalidates when they vote.
 */
import "server-only";
import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/redis";
import type { VoteValue } from "@/generated/prisma";

function toScore(v: VoteValue): number {
  return v === "YES" ? 1 : v === "NO" ? -1 : 0;
}

/** Agreement of two votes on the same theme → 0..1 (1 same, 0 opposite). */
function pairAgreement(a: VoteValue, b: VoteValue): number {
  // distance is 0, 1 or 2 on the {-1,0,1} scale → map to 1, 0.5, 0.
  return 1 - Math.abs(toScore(a) - toScore(b)) / 2;
}

export interface AgentAlignment {
  agentKid: string;
  /** 0–100; null when there are no themes in common. */
  alignment: number | null;
  sharedThemes: number;
}

/**
 * Compute the alignment between one citizen and every active public agent.
 * Returns a map keyed by agent kid.
 */
export async function citizenAgentAlignments(
  userId: string,
  voteVersion: number,
): Promise<Map<string, AgentAlignment>> {
  const cacheKey = `align:user:${userId}:v${voteVersion}`;
  const cached = await cacheGet<AgentAlignment[]>(cacheKey);
  if (cached) return new Map(cached.map((a) => [a.agentKid, a]));

  const userVotes = await db.vote.findMany({
    where: { userId, voterType: "USER" },
    select: { themeId: true, value: true },
  });

  const userMap = new Map(userVotes.map((v) => [v.themeId, v.value]));
  const themeIds = [...userMap.keys()];

  const result = new Map<string, AgentAlignment>();
  if (themeIds.length === 0) return result;

  const agentVotes = await db.vote.findMany({
    where: { voterType: "AGENT", themeId: { in: themeIds }, agent: { status: "ACTIVE" } },
    select: { value: true, themeId: true, agent: { select: { kid: true } } },
  });

  const acc = new Map<string, { sum: number; n: number }>();
  for (const av of agentVotes) {
    const kid = av.agent?.kid;
    if (!kid) continue;
    const uv = userMap.get(av.themeId);
    if (!uv) continue;
    const cur = acc.get(kid) ?? { sum: 0, n: 0 };
    cur.sum += pairAgreement(uv, av.value);
    cur.n += 1;
    acc.set(kid, cur);
  }

  for (const [agentKid, { sum, n }] of acc) {
    result.set(agentKid, {
      agentKid,
      alignment: n > 0 ? Math.round((sum / n) * 100) : null,
      sharedThemes: n,
    });
  }

  await cacheSet(cacheKey, [...result.values()], 300);
  return result;
}

/**
 * Alignment between one citizen and a single agent (uses the batch computation).
 */
export async function citizenAgentAlignment(
  userId: string,
  voteVersion: number,
  agentKid: string,
): Promise<AgentAlignment | null> {
  const all = await citizenAgentAlignments(userId, voteVersion);
  return all.get(agentKid) ?? null;
}

/**
 * Party alignment = average of its agents' alignments with the citizen
 * (only agents that share themes with the citizen count).
 */
export async function citizenPartyAlignments(
  userId: string,
  voteVersion: number,
): Promise<Map<string, { partyKid: string; alignment: number | null; agents: number }>> {
  const agentAlignments = await citizenAgentAlignments(userId, voteVersion);
  const agents = await db.publicAgent.findMany({
    where: { status: "ACTIVE", party: { isNot: null } },
    select: { kid: true, party: { select: { kid: true } } },
  });

  const acc = new Map<string, { sum: number; n: number }>();
  for (const a of agents) {
    const pk = a.party?.kid;
    if (!pk) continue;
    const al = agentAlignments.get(a.kid);
    if (!al || al.alignment === null) continue;
    const cur = acc.get(pk) ?? { sum: 0, n: 0 };
    cur.sum += al.alignment;
    cur.n += 1;
    acc.set(pk, cur);
  }

  const out = new Map<string, { partyKid: string; alignment: number | null; agents: number }>();
  for (const [partyKid, { sum, n }] of acc) {
    out.set(partyKid, { partyKid, alignment: n > 0 ? Math.round(sum / n) : null, agents: n });
  }
  return out;
}
