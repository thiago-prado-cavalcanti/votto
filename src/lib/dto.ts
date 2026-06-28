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
  Scope,
  VoteValue,
} from "@/generated/prisma";

export interface PublicParty {
  kid: string;
  name: string;
  acronym: string | null;
  description: string | null;
  logoUrl: string | null;
  agentCount: number;
  status: EntityStatus;
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
  party: PublicParty | null;
}

export interface PublicArticle {
  kid: string;
  title: string | null;
  originalUrl: string;
  downloadUrl: string | null;
}

export interface PublicTheme {
  kid: string;
  name: string;
  summary: string;
  scope: Scope;
  state: string | null;
  municipality: string | null;
  status: EntityStatus;
  yesCount: number;
  noCount: number;
  absCount: number;
  totalVotes: number;
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
  scope: Scope;
  state: string | null;
  municipality: string | null;
  status: EntityStatus;
  yesCount: number;
  noCount: number;
  absCount: number;
  articles?: ArticleLike[];
};

export function toPublicTheme(t: ThemeLike): PublicTheme {
  return {
    kid: t.kid,
    name: t.name,
    summary: t.summary,
    scope: t.scope,
    state: t.state,
    municipality: t.municipality,
    status: t.status,
    yesCount: t.yesCount,
    noCount: t.noCount,
    absCount: t.absCount,
    totalVotes: t.yesCount + t.noCount + t.absCount,
    articles: t.articles?.map(toPublicArticle),
  };
}

export const VOTE_VALUES: VoteValue[] = ["YES", "NO", "ABSTENTION"];
