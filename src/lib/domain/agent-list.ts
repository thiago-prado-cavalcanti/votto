/**
 * One page of the public agents list.
 *
 * Extracted from the page so the "load more" server action can serve the exact
 * same rows the server rendered, the way `theme-list.ts` backs the themes feed.
 *
 * **Why the whole bench is still assembled to serve 60 of it.** Three of the
 * four orderings — your alignment, the base reading, the performance index —
 * are not columns the database can sort on. They come from maps the index layer
 * builds and Redis caches, so placing the first row already requires every row.
 * That is fine: those maps are one cached read regardless of page, and they were
 * never what made the page heavy.
 *
 * What made it heavy was rendering 594 cards into the document — 2.5 MB of HTML
 * on production, against 125 KB for the parties list. Cutting the slice, not the
 * query, is what that costs; the ordering stays exactly what it was.
 */
import "server-only";
import { db } from "@/lib/db";
import { toPublicAgent } from "@/lib/dto";
import { agentSearchFilter } from "@/lib/domain/search";
import { publicReading } from "@/lib/domain/reading";
import { citizenFollows, followSlot } from "@/lib/domain/follows";
import type { FollowSlot } from "@/components/public/FollowButton";
import {
  agentBaseAlignments,
  agentElectorateAlignments,
  citizenAgentAlignments,
  type BaseAlignment,
} from "@/lib/indexes/alignment";
import { AgentType, type Prisma } from "@/generated/prisma";

/** Rows served per page. Matches the themes feed, and the grid is three across. */
export const AGENT_PAGE_SIZE = 60;

/**
 * Hard stop on how deep the feed will page.
 *
 * The bench is 594; this is well past it and exists only so a hand-edited `?p=`
 * cannot walk the list forever.
 */
const AGENT_MAX_PAGES = 40;

const AGENT_TYPES = Object.values(AgentType);

/** The list's filter/order state, exactly as it sits in the URL. */
export interface AgentListQuery {
  q?: string;
  type?: string;
  state?: string;
  party?: string;
  sort?: string;
  /** "asc" | "desc"; anything else reads as descending. */
  dir?: string;
}

/**
 * The three readings a bench can be ranked by, and the tokens that address them.
 *
 * `engagement` and `alignment` are the older names for the base and personal
 * readings. They stay because links to them are already in circulation — the URL
 * is a contract with anybody who bookmarked or shared one.
 */
export const AGENT_SORTS = {
  quality: (r: AgentRow) => r.quality,
  base: (r: AgentRow) => r.published,
  personal: (r: AgentRow) => r.alignment,
} as const;

export type AgentSortKey = keyof typeof AGENT_SORTS;

const SORT_ALIASES: Record<string, AgentSortKey> = {
  engagement: "base",
  alignment: "personal",
};

/** Canonical sort key. Performance leads: it is the one that reads logged out. */
export function agentSort(sort: string | undefined): AgentSortKey {
  if (!sort) return "quality";
  if (sort in AGENT_SORTS) return sort as AgentSortKey;
  return SORT_ALIASES[sort] ?? "quality";
}

/** Descending unless asked otherwise — on all three readings the top is the point. */
export function agentDirection(dir: string | undefined): "asc" | "desc" {
  return dir === "asc" ? "asc" : "desc";
}

/** One card's worth of data. */
export interface AgentRow {
  agent: ReturnType<typeof toPublicAgent>;
  alignment: number | null;
  engagement: number | null;
  base: BaseAlignment | undefined;
  follow: FollowSlot;
  /** The figure actually printed — what "sort by alignment" must order on. */
  published: number | null;
  /** 0–100 performance index, or null when too little of it could be measured. */
  quality: number | null;
}

export interface AgentPage {
  rows: AgentRow[];
  /** 1-based index of the page returned. */
  page: number;
  hasMore: boolean;
  /** Every matching agent, before slicing — what the masthead plate counts. */
  total: number;
  /** Count by office over the whole filtered set, for the masthead plate. */
  byType: Array<{ type: AgentType; count: number }>;
}

/** Translate the URL state into a Prisma filter. */
export function agentListWhere(query: AgentListQuery): Prisma.PublicAgentWhereInput {
  // Former members keep their votes (the alignment index needs them) but are
  // not listed or ranked — the page is about who holds a mandate today.
  const where: Prisma.PublicAgentWhereInput = { status: "ACTIVE", inOffice: true };
  if (query.type && AGENT_TYPES.includes(query.type as AgentType)) {
    where.type = query.type as AgentType;
  }
  if (query.state) where.state = query.state;
  if (query.party) where.party = { kid: query.party };
  // Search: the agent's own name and their party's name/acronym, folded so an
  // accent never has to be typed. ANDed with the selects above rather than
  // replacing them — box and filters are one form.
  const search = agentSearchFilter(query.q);
  if (search) where.AND = search;
  return where;
}

/**
 * Read one page of the agents list.
 *
 * `userId`/`voteVersion` are the logged-in citizen's, when there is one; they
 * only affect the personal alignment column and the follow controls.
 */
export async function loadAgentPage(
  query: AgentListQuery,
  page = 1,
  viewer?: { userId: string; voteVersion: number } | null,
): Promise<AgentPage> {
  const safePage = Math.min(Math.max(Math.trunc(page) || 1, 1), AGENT_MAX_PAGES);

  const [agents, engagement, base] = await Promise.all([
    db.publicAgent.findMany({
      where: agentListWhere(query),
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: { party: true },
    }),
    agentElectorateAlignments(),
    agentBaseAlignments(),
  ]);

  const [alignments, follows] = viewer
    ? await Promise.all([
        citizenAgentAlignments(viewer.userId, viewer.voteVersion),
        citizenFollows(viewer.userId),
      ])
    : [null, null];

  let rows: AgentRow[] = agents.map((a) => {
    const agentBase = base.get(a.kid);
    const agentEngagement = engagement.get(a.kid)?.alignment ?? null;
    return {
      agent: toPublicAgent(a),
      alignment: alignments?.get(a.kid)?.alignment ?? null,
      engagement: agentEngagement,
      base: agentBase,
      follow: followSlot(a, viewer ? follows ?? new Map() : null),
      published: publicReading(agentBase, agentEngagement).value,
      quality: a.qualityScore,
    };
  });

  const pick = AGENT_SORTS[agentSort(query.sort)];
  const descending = agentDirection(query.dir) === "desc";
  // The unmeasured sink to the bottom in BOTH directions. They are not the worst
  // agents, they are the ones we could not measure, and asking for the bottom of
  // a ranking should not hand back the people who are missing from it
  // (CLAUDE.md §3.3).
  rows = [...rows].sort((a, b) => {
    const x = pick(a);
    const y = pick(b);
    if (x === null && y === null) return a.agent.firstName.localeCompare(b.agent.firstName);
    if (x === null) return 1;
    if (y === null) return -1;
    return descending ? y - x : x - y;
  });

  // The masthead plate describes the whole filtered set, not the slice — it is
  // the shape of the bench the filters selected, and it must not shrink as the
  // reader scrolls.
  const counts = new Map<AgentType, number>();
  for (const agent of agents) counts.set(agent.type, (counts.get(agent.type) ?? 0) + 1);

  const start = (safePage - 1) * AGENT_PAGE_SIZE;
  return {
    rows: rows.slice(start, start + AGENT_PAGE_SIZE),
    page: safePage,
    hasMore: rows.length > start + AGENT_PAGE_SIZE && safePage < AGENT_MAX_PAGES,
    total: rows.length,
    byType: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count })),
  };
}
