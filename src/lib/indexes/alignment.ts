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
    where: { status: "ACTIVE", inOffice: true, party: { isNot: null } },
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

// ─── Global alignment (agent/party vs. the whole electorate) ──────────────────
// A login-independent companion to the personal alignment: how aligned an agent
// (or party) is with the AGGREGATE of all citizens who voted. This is the
// "Alinhamento com eleitores" index shown everywhere, even when logged out.

export interface ElectorateAlignment {
  /** 0–100; null when there is no overlap with citizen votes. */
  alignment: number | null;
  /** number of themes that contributed. */
  basis: number;
}

/** Mean citizen stance per theme (−1..1), across all citizen votes. */
async function citizenThemeStances(): Promise<Map<string, number>> {
  const votes = await db.vote.findMany({
    where: { voterType: "USER" },
    select: { themeId: true, value: true },
  });
  const acc = new Map<string, { sum: number; n: number }>();
  for (const v of votes) {
    const cur = acc.get(v.themeId) ?? { sum: 0, n: 0 };
    cur.sum += toScore(v.value);
    cur.n += 1;
    acc.set(v.themeId, cur);
  }
  const out = new Map<string, number>();
  for (const [themeId, { sum, n }] of acc) out.set(themeId, sum / n);
  return out;
}

/**
 * Electorate engagement for every active agent: how closely the agent's votes
 * track the aggregate citizen stance per theme. Cached briefly (the electorate
 * shifts slowly relative to a request).
 */
export async function agentElectorateAlignments(): Promise<Map<string, ElectorateAlignment>> {
  const cacheKey = "electorate:agents:v1";
  const cached = await cacheGet<[string, ElectorateAlignment][]>(cacheKey);
  if (cached) return new Map(cached);

  const stances = await citizenThemeStances();
  const result = new Map<string, ElectorateAlignment>();
  if (stances.size === 0) return result;

  const themeIds = [...stances.keys()];
  const agentVotes = await db.vote.findMany({
    where: { voterType: "AGENT", themeId: { in: themeIds }, agent: { status: "ACTIVE" } },
    select: { value: true, themeId: true, agent: { select: { kid: true } } },
  });

  const acc = new Map<string, { sum: number; n: number }>();
  for (const av of agentVotes) {
    const kid = av.agent?.kid;
    if (!kid) continue;
    const stance = stances.get(av.themeId);
    if (stance === undefined) continue;
    const agreement = 1 - Math.abs(toScore(av.value) - stance) / 2;
    const cur = acc.get(kid) ?? { sum: 0, n: 0 };
    cur.sum += agreement;
    cur.n += 1;
    acc.set(kid, cur);
  }

  for (const [kid, { sum, n }] of acc) {
    result.set(kid, { alignment: n > 0 ? Math.round((sum / n) * 100) : null, basis: n });
  }
  await cacheSet(cacheKey, [...result.entries()], 120);
  return result;
}

/** Electorate engagement per party = average of its active agents' engagement. */
export async function partyElectorateAlignments(): Promise<
  Map<string, { alignment: number | null; agents: number }>
> {
  const agentMap = await agentElectorateAlignments();
  const agents = await db.publicAgent.findMany({
    where: { status: "ACTIVE", inOffice: true, party: { isNot: null } },
    select: { kid: true, party: { select: { kid: true } } },
  });

  const acc = new Map<string, { sum: number; n: number }>();
  for (const a of agents) {
    const pk = a.party?.kid;
    if (!pk) continue;
    const al = agentMap.get(a.kid);
    if (!al || al.alignment === null) continue;
    const cur = acc.get(pk) ?? { sum: 0, n: 0 };
    cur.sum += al.alignment;
    cur.n += 1;
    acc.set(pk, cur);
  }

  const out = new Map<string, { alignment: number | null; agents: number }>();
  for (const [pk, { sum, n }] of acc) {
    out.set(pk, { alignment: n > 0 ? Math.round(sum / n) : null, agents: n });
  }
  return out;
}

// ─── Base alignment (agent/party vs. the citizens who follow them) ────────────
// The index this platform exists to publish. The electorate variant above
// compares an agent against the aggregate of every citizen who voted, which
// corresponds to no real electorate — nobody is elected by everybody. The base
// is the set of citizens who declared that agent as their representative
// (`AgentFollow`), and it is the honest denominator: does this agent vote the
// way the people who chose them would vote?
//
// It replaces the electorate reading wherever a base exists; an agent nobody
// follows yet still shows the electorate figure rather than a blank.

export interface BaseAlignment {
  /** 0–100; null while the base has not voted on anything the agent voted on. */
  alignment: number | null;
  /** How many citizens declare this agent as their representative. */
  followers: number;
  /** Themes that contributed to the reading. */
  basis: number;
}

/**
 * Base alignment for every agent that has at least one follower.
 *
 * The shape mirrors `agentElectorateAlignments` with one difference that is the
 * whole point: the stance per theme is averaged over *that agent's* followers
 * rather than over one global mean, so every agent is measured against a
 * different electorate.
 *
 * Agents are seeded into the map from the follow list, before any vote is read,
 * so an agent whose base has not voted yet still reports its follower count —
 * the count is published beside the reading and must not vanish with it.
 *
 * Cached briefly under a single key, like the electorate variant; `followAgent`
 * drops that key so a citizen sees the effect of their own click. At volume the
 * replacement is a materialized per-agent aggregate updated incrementally on
 * each vote — not this full recomputation.
 */
export async function agentBaseAlignments(): Promise<Map<string, BaseAlignment>> {
  const cacheKey = "base:agents:v1";
  const cached = await cacheGet<[string, BaseAlignment][]>(cacheKey);
  if (cached) return new Map(cached);

  const follows = await db.agentFollow.findMany({
    where: { agent: { status: "ACTIVE" } },
    select: { userId: true, agentId: true, agent: { select: { kid: true } } },
  });

  const result = new Map<string, BaseAlignment>();
  if (follows.length === 0) return result;

  // agent → its base, by both keys: internal id to read the agent's own votes,
  // kid to publish under.
  const baseByAgentId = new Map<string, { kid: string; followers: Set<string> }>();
  for (const f of follows) {
    const entry = baseByAgentId.get(f.agentId) ?? { kid: f.agent.kid, followers: new Set<string>() };
    entry.followers.add(f.userId);
    baseByAgentId.set(f.agentId, entry);
  }
  for (const { kid, followers } of baseByAgentId.values()) {
    result.set(kid, { alignment: null, followers: followers.size, basis: 0 });
  }

  const followerIds = [...new Set(follows.map((f) => f.userId))];
  const citizenVotes = await db.vote.findMany({
    where: { voterType: "USER", userId: { in: followerIds } },
    select: { userId: true, themeId: true, value: true },
  });
  if (citizenVotes.length === 0) {
    await cacheSet(cacheKey, [...result.entries()], 120);
    return result;
  }

  const votesByUser = new Map<string, { themeId: string; value: VoteValue }[]>();
  for (const v of citizenVotes) {
    if (!v.userId) continue;
    const list = votesByUser.get(v.userId) ?? [];
    list.push({ themeId: v.themeId, value: v.value });
    votesByUser.set(v.userId, list);
  }

  const agentIds = [...baseByAgentId.keys()];
  const agentVotes = await db.vote.findMany({
    where: { voterType: "AGENT", agentId: { in: agentIds } },
    select: { agentId: true, themeId: true, value: true },
  });

  const votesByAgent = new Map<string, Map<string, VoteValue>>();
  for (const av of agentVotes) {
    if (!av.agentId) continue;
    const themes = votesByAgent.get(av.agentId) ?? new Map<string, VoteValue>();
    themes.set(av.themeId, av.value);
    votesByAgent.set(av.agentId, themes);
  }

  for (const [agentId, { kid, followers }] of baseByAgentId) {
    const ownVotes = votesByAgent.get(agentId);
    if (!ownVotes || ownVotes.size === 0) continue;

    // Mean stance of this base per theme (−1..1), over the themes it voted on.
    const stances = new Map<string, { sum: number; n: number }>();
    for (const userId of followers) {
      for (const v of votesByUser.get(userId) ?? []) {
        if (!ownVotes.has(v.themeId)) continue; // the agent never voted it — no pair
        const cur = stances.get(v.themeId) ?? { sum: 0, n: 0 };
        cur.sum += toScore(v.value);
        cur.n += 1;
        stances.set(v.themeId, cur);
      }
    }
    if (stances.size === 0) continue;

    let sum = 0;
    let n = 0;
    for (const [themeId, stance] of stances) {
      const agentVote = ownVotes.get(themeId);
      if (agentVote === undefined) continue;
      sum += 1 - Math.abs(toScore(agentVote) - stance.sum / stance.n) / 2;
      n += 1;
    }

    result.set(kid, {
      alignment: n > 0 ? Math.round((sum / n) * 100) : null,
      followers: followers.size,
      basis: n,
    });
  }

  await cacheSet(cacheKey, [...result.entries()], 120);
  return result;
}

/**
 * Base alignment per party: its agents' base readings, weighted by how many
 * citizens each of those agents represents.
 *
 * Weighted, where `partyElectorateAlignments` above is a plain mean, and the
 * difference is deliberate: every agent faces the same electorate, so there is
 * no natural weight there — but bases differ in size, and a senator speaking
 * for 4.000 citizens cannot count the same as a deputy speaking for 40. The
 * party's base is the union of its agents' bases, so its reading is that union's
 * average.
 */
export async function partyBaseAlignments(): Promise<Map<string, BaseAlignment>> {
  const agentMap = await agentBaseAlignments();
  if (agentMap.size === 0) return new Map();

  const agents = await db.publicAgent.findMany({
    where: { status: "ACTIVE", inOffice: true, party: { isNot: null } },
    select: { kid: true, party: { select: { kid: true } } },
  });

  const acc = new Map<string, { sum: number; weight: number; followers: number; basis: number }>();
  for (const a of agents) {
    const pk = a.party?.kid;
    if (!pk) continue;
    const reading = agentMap.get(a.kid);
    if (!reading) continue;
    const cur = acc.get(pk) ?? { sum: 0, weight: 0, followers: 0, basis: 0 };
    cur.followers += reading.followers;
    // Followers with no shared themes still count towards the party's base
    // size, but only a real reading can move the average.
    if (reading.alignment !== null) {
      cur.sum += reading.alignment * reading.followers;
      cur.weight += reading.followers;
      cur.basis += reading.basis;
    }
    acc.set(pk, cur);
  }

  const out = new Map<string, BaseAlignment>();
  for (const [partyKid, { sum, weight, followers, basis }] of acc) {
    out.set(partyKid, {
      alignment: weight > 0 ? Math.round(sum / weight) : null,
      followers,
      basis,
    });
  }
  return out;
}
