/**
 * DTO mappers — the single place where entities become external-facing shapes.
 *
 * GLOBAL RULE (CLAUDE.md §5): never expose internal `id`/`*Id`. Public consumers
 * reference resources by `kid`. Always map through these helpers before returning
 * data to a page/component/API. Relations are mapped recursively.
 */
import type {
  AgentType,
  EntityStatus,
  House,
  Scope,
  VoteValue,
} from "@/generated/prisma";
import { priorityBand, type PriorityBand } from "@/lib/domain/priority";

export interface PublicParty {
  kid: string;
  name: string;
  acronym: string | null;
  description: string | null;
  logoUrl: string | null;
  agentCount: number;
  status: EntityStatus;
  leaderName: string | null;
  websiteUrl: string | null;
}

export interface PublicAgentDTO {
  kid: string;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  description: string | null;
  type: AgentType;
  state: string | null;
  municipality: string | null;
  status: EntityStatus;
  /** Official profile page on camara.leg.br / senado.leg.br. */
  externalUrl: string | null;
  /** False for agents whose mandate ended — their votes are kept, they are not ranked. */
  inOffice: boolean;
  party: PublicParty | null;
}

export interface PublicArticle {
  kid: string;
  title: string | null;
  originalUrl: string;
  downloadUrl: string | null;
}

export interface ThemeViewpoints {
  right?: string;
  center?: string;
  left?: string;
}

/**
 * An official subject classification, as shown publicly. The source's own
 * numeric code is deliberately dropped: it is a government-internal identifier
 * used only for dedup (CLAUDE.md §8).
 */
export interface PublicClassification {
  label: string;
  hierarchy: string | null;
  /** True when the source flags this as the bill's main subject. */
  primary: boolean;
}

/**
 * Who is accountable for a bill, as shown on a theme card.
 *
 * `role` distinguishes the two: the proposer authored it (the stronger claim),
 * the rapporteur is currently shepherding it. A theme shows the proposer when
 * there is one, and falls back to the rapporteur.
 */
export interface ThemeAuthor {
  role: "PROPOSER" | "RAPPORTEUR";
  name: string;
  /** Present when the author is a parliamentarian we have a page for. */
  agent: PublicAgentDTO | null;
}

export interface PublicTheme {
  kid: string;
  name: string;
  summary: string;
  description: string;
  viewpoints: ThemeViewpoints | null;
  scope: Scope;
  state: string | null;
  municipality: string | null;
  status: EntityStatus;
  yesCount: number;
  noCount: number;
  absCount: number;
  totalVotes: number;
  /** Official short identifier, e.g. "PL 3085/2026" (null for manual themes). */
  identifier: string | null;
  house: House | null;
  /** Bill page on the originating house's own site. */
  externalUrl: string | null;
  situation: string | null;
  urgency: string | null;
  priority: number;
  band: PriorityBand;
  inProgress: boolean;
  classifications: PublicClassification[];
  presentedAt: string | null;
  lastActionAt: string | null;
  /** Proposer, else rapporteur, else null. */
  author: ThemeAuthor | null;
  /** AI-written headline in plain Portuguese; the official `name` is untouched. */
  plainTitle: string | null;
  /** AI-written explanation; the official `summary` is untouched. */
  plainSummary: string | null;
  /** Model that wrote the two fields above — shown so the reader can judge them. */
  aiModel: string | null;
  articles?: PublicArticle[];
}

type PartyLike = {
  kid: string;
  name: string;
  acronym: string | null;
  description: string | null;
  logoUrl: string | null;
  agentCount: number;
  status: EntityStatus;
  leaderName?: string | null;
  websiteUrl?: string | null;
};

export function toPublicParty(p: PartyLike): PublicParty {
  return {
    kid: p.kid,
    name: p.name,
    acronym: p.acronym,
    description: p.description,
    logoUrl: p.logoUrl,
    agentCount: p.agentCount,
    status: p.status,
    leaderName: p.leaderName ?? null,
    websiteUrl: p.websiteUrl ?? null,
  };
}

type AgentLike = {
  kid: string;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  description: string | null;
  type: AgentType;
  state: string | null;
  municipality: string | null;
  status: EntityStatus;
  externalUrl?: string | null;
  inOffice?: boolean;
  party?: PartyLike | null;
};

export function toPublicAgent(a: AgentLike): PublicAgentDTO {
  return {
    kid: a.kid,
    firstName: a.firstName,
    lastName: a.lastName,
    imageUrl: a.imageUrl,
    description: a.description,
    type: a.type,
    state: a.state,
    municipality: a.municipality,
    status: a.status,
    externalUrl: a.externalUrl ?? null,
    inOffice: a.inOffice ?? true,
    party: a.party ? toPublicParty(a.party) : null,
  };
}

type ArticleLike = {
  kid: string;
  title: string | null;
  originalUrl: string;
  downloadUrl: string | null;
};

export function toPublicArticle(a: ArticleLike): PublicArticle {
  return { kid: a.kid, title: a.title, originalUrl: a.originalUrl, downloadUrl: a.downloadUrl };
}

type ThemeLike = {
  kid: string;
  name: string;
  summary: string;
  description?: string;
  viewpoints?: unknown;
  scope: Scope;
  state: string | null;
  municipality: string | null;
  status: EntityStatus;
  yesCount: number;
  noCount: number;
  absCount: number;
  identifier?: string | null;
  house?: House | null;
  externalUrl?: string | null;
  situation?: string | null;
  urgency?: string | null;
  priority?: number;
  inProgress?: boolean;
  classifications?: unknown;
  presentedAt?: Date | null;
  lastActionAt?: Date | null;
  proposer?: AgentLike | null;
  proposerName?: string | null;
  rapporteur?: AgentLike | null;
  plainTitle?: string | null;
  plainSummary?: string | null;
  aiModel?: string | null;
  articles?: ArticleLike[];
};

/**
 * The relations `toPublicTheme` needs to build a complete theme.
 *
 * It exists because forgetting it is silent and the failure is subtle. Without
 * the includes, `themeAuthor` still finds the `proposerName` **column** and
 * renders a bare name — no photo, no party, no link to the agent — while a
 * theme whose only face is a rapporteur shows nobody at all. Nothing throws,
 * nothing is empty, the list merely looks poorer on one page than another,
 * which is exactly how the home and `/temas` drifted apart.
 *
 * Spread it into every theme query whose result reaches `toPublicTheme`:
 *
 * ```ts
 * db.theme.findMany({ where, include: THEME_AUTHOR_INCLUDE })
 * ```
 */
export const THEME_AUTHOR_INCLUDE = {
  proposer: { include: { party: true } },
  rapporteur: { include: { party: true } },
} as const;

/**
 * Pick the accountable face for a theme: the proposer when known (a
 * parliamentarian, else the institution that authored it), otherwise the
 * rapporteur. Returns null for themes with neither.
 */
function pickAuthor(t: ThemeLike): ThemeAuthor | null {
  if (t.proposer) {
    return {
      role: "PROPOSER",
      name: `${t.proposer.firstName} ${t.proposer.lastName}`.trim(),
      agent: toPublicAgent(t.proposer),
    };
  }
  if (t.proposerName) {
    return { role: "PROPOSER", name: t.proposerName, agent: null };
  }
  if (t.rapporteur) {
    return {
      role: "RAPPORTEUR",
      name: `${t.rapporteur.firstName} ${t.rapporteur.lastName}`.trim(),
      agent: toPublicAgent(t.rapporteur),
    };
  }
  return null;
}

function parseViewpoints(value: unknown): ThemeViewpoints | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" && x.trim() ? x : undefined);
  const out: ThemeViewpoints = { right: s(v.right), center: s(v.center), left: s(v.left) };
  return out.right || out.center || out.left ? out : null;
}

/**
 * Read the stored classification JSON into its public shape, dropping the
 * source's numeric code. Malformed entries are skipped rather than crashing a
 * page — the column is written by importers we don't control the input of.
 */
function parseClassifications(value: unknown): PublicClassification[] {
  if (!Array.isArray(value)) return [];
  const out: PublicClassification[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Record<string, unknown>;
    if (typeof c.label !== "string" || !c.label.trim()) continue;
    out.push({
      label: c.label,
      hierarchy: typeof c.hierarchy === "string" && c.hierarchy.trim() ? c.hierarchy : null,
      primary: Number(c.relevance) === 1,
    });
  }
  return out;
}

export function toPublicTheme(t: ThemeLike): PublicTheme {
  const priority = t.priority ?? 0;
  return {
    kid: t.kid,
    name: t.name,
    summary: t.summary,
    description: t.description ?? "",
    viewpoints: parseViewpoints(t.viewpoints),
    scope: t.scope,
    state: t.state,
    municipality: t.municipality,
    status: t.status,
    yesCount: t.yesCount,
    noCount: t.noCount,
    absCount: t.absCount,
    totalVotes: t.yesCount + t.noCount + t.absCount,
    identifier: t.identifier ?? null,
    house: t.house ?? null,
    externalUrl: t.externalUrl ?? null,
    situation: t.situation ?? null,
    urgency: t.urgency ?? null,
    priority,
    band: priorityBand(priority),
    inProgress: t.inProgress ?? true,
    classifications: parseClassifications(t.classifications),
    presentedAt: t.presentedAt?.toISOString() ?? null,
    lastActionAt: t.lastActionAt?.toISOString() ?? null,
    author: pickAuthor(t),
    plainTitle: t.plainTitle ?? null,
    plainSummary: t.plainSummary ?? null,
    aiModel: t.aiModel ?? null,
    articles: t.articles?.map(toPublicArticle),
  };
}

export const VOTE_VALUES: VoteValue[] = ["YES", "NO", "ABSTENTION"];
