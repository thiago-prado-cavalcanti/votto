"use server";

/**
 * Following a public agent ("acompanhar") — the citizen's declaration of who
 * represents them.
 *
 * The ballot is secret, so the platform cannot ask who somebody voted for. This
 * is the analogue it can ask for: a present-tense, revocable declaration. It
 * enrols the citizen in that agent's base, which is what the agent's published
 * alignment is then measured against.
 *
 * Deliberately NOT behind the vote challenge (`src/lib/auth/vote-challenge.ts`).
 * That challenge exists to stop an unlocked phone from casting a vote in
 * somebody's name; a follow on its own moves no index, because the base is
 * computed from the followers' VOTES — and casting those already passed the
 * challenge. Asking twice would buy nothing and cost the action.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCitizen } from "@/lib/auth/guards";
import { cacheDel } from "@/lib/redis";
import { agentTypeProseLabel } from "@/lib/labels";
import type { AgentType } from "@/generated/prisma";

export interface FollowResult {
  ok: boolean;
  error?: string;
}

/** Cache key of the base index, dropped whenever a base changes. */
const BASE_CACHE_KEY = "base:agents:v1";

/** The one-per-office refusal, worded the same whether we detect it or Postgres does. */
function officeTakenError(type: AgentType): string {
  return `Você já acompanha um ${agentTypeProseLabel[type]}. Deixe de seguir antes de escolher outro.`;
}

/**
 * Refresh every surface that prints a base reading or a follow control, and
 * drop the cached index so the citizen sees their own click land.
 */
async function revalidateFollowSurfaces(agentKid: string, partyKid?: string | null) {
  await cacheDel(BASE_CACHE_KEY);
  revalidatePath("/");
  revalidatePath("/agentes");
  revalidatePath(`/agentes/${agentKid}`);
  revalidatePath("/partidos");
  if (partyKid) revalidatePath(`/partidos/${partyKid}`);
  revalidatePath("/conta");
}

/**
 * Start following an agent, enrolling the citizen in that agent's base.
 *
 * Refuses when the office is already taken by a different agent: one follow per
 * office, because a citizen elects one federal deputy and one senator. Swapping
 * is a two-step move — stop following, then choose. Following the agent you
 * already follow is a no-op rather than an error, so a double click is harmless.
 *
 * @param agentKid Public kid of the agent to follow.
 */
export async function followAgent(agentKid: string): Promise<FollowResult> {
  const session = await requireCitizen();

  const [user, agent] = await Promise.all([
    db.user.findUnique({ where: { kid: session.userKid }, select: { id: true } }),
    db.publicAgent.findUnique({
      where: { kid: agentKid },
      select: {
        id: true,
        type: true,
        status: true,
        inOffice: true,
        party: { select: { kid: true } },
      },
    }),
  ]);

  if (!user) return { ok: false, error: "Cidadão não encontrado." };
  if (!agent || agent.status !== "ACTIVE") {
    return { ok: false, error: "Agente indisponível." };
  }
  // A mandate that ended represents nobody — there is nothing to declare.
  if (!agent.inOffice) {
    return { ok: false, error: "Este mandato foi encerrado e não pode ser acompanhado." };
  }

  const held = await db.agentFollow.findUnique({
    where: { userId_type: { userId: user.id, type: agent.type } },
    select: { agentId: true },
  });
  if (held) {
    if (held.agentId === agent.id) return { ok: true };
    return { ok: false, error: officeTakenError(agent.type) };
  }

  try {
    await db.agentFollow.create({
      data: { userId: user.id, agentId: agent.id, type: agent.type },
    });
  } catch (error) {
    // Two tabs confirming at once: the unique index is the real guard, and it
    // answers in the same words the check above would have.
    if (isUniqueViolation(error)) {
      return { ok: false, error: officeTakenError(agent.type) };
    }
    throw error;
  }

  await revalidateFollowSurfaces(agentKid, agent.party?.kid);
  return { ok: true };
}

/**
 * Stop following an agent. The citizen leaves that agent's base, and the office
 * is free to be declared again.
 *
 * @param agentKid Public kid of the agent to stop following.
 */
export async function unfollowAgent(agentKid: string): Promise<FollowResult> {
  const session = await requireCitizen();

  const [user, agent] = await Promise.all([
    db.user.findUnique({ where: { kid: session.userKid }, select: { id: true } }),
    db.publicAgent.findUnique({
      where: { kid: agentKid },
      select: { id: true, party: { select: { kid: true } } },
    }),
  ]);

  if (!user) return { ok: false, error: "Cidadão não encontrado." };
  if (!agent) return { ok: false, error: "Agente não encontrado." };

  await db.agentFollow.deleteMany({ where: { userId: user.id, agentId: agent.id } });

  await revalidateFollowSurfaces(agentKid, agent.party?.kid);
  return { ok: true };
}

/** Prisma's unique-constraint violation, without importing its error class. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
