/**
 * Reading the citizen's declarations of representation ("acompanhar").
 *
 * Every public page that prints an agent needs the same two things: which
 * agent, if any, the citizen already follows for that office, and therefore
 * what the follow control should render. Both are here so no page re-derives
 * the rule.
 */
import "server-only";
import { db } from "@/lib/db";
import type { AgentType } from "@/generated/prisma";
import type { FollowSlot } from "@/components/public/FollowButton";

/** The agent a citizen follows for one office, as far as any page needs it. */
export interface FollowedAgent {
  kid: string;
  name: string;
  type: AgentType;
  /** False once the mandate ends — the row stays, the representation does not. */
  inOffice: boolean;
}

/**
 * Every agent this citizen follows, keyed by office.
 *
 * One query per request. The map is keyed by `AgentType` because that is the
 * rule: at most one entry per office can exist (`@@unique([userId, type])`).
 *
 * @param userId Internal id of the citizen. Never leaves the server.
 */
export async function citizenFollows(userId: string): Promise<Map<AgentType, FollowedAgent>> {
  const rows = await db.agentFollow.findMany({
    where: { userId },
    select: {
      type: true,
      agent: { select: { kid: true, firstName: true, lastName: true, inOffice: true } },
    },
  });

  return new Map(
    rows.map((r) => [
      r.type,
      {
        kid: r.agent.kid,
        name: `${r.agent.firstName} ${r.agent.lastName}`.trim(),
        type: r.type,
        inOffice: r.agent.inOffice,
      },
    ]),
  );
}

/**
 * What the follow control should render for one agent.
 *
 * The four states are the rule made visible: logged out we invite the citizen
 * in; a free office offers the button; the followed agent carries the way back
 * out; and an office already taken by somebody else shows no button at all —
 * only a line pointing at whoever holds it, so the swap stays findable without
 * the platform pretending you can follow two deputies.
 *
 * @param agent The agent the control belongs to.
 * @param follows The citizen's follows, or null when nobody is logged in.
 */
export function followSlot(
  agent: { kid: string; type: AgentType; inOffice: boolean },
  follows: Map<AgentType, FollowedAgent> | null,
): FollowSlot {
  const held = follows?.get(agent.type);

  // A mandate that ended represents nobody, so there is nothing to declare —
  // checked before anything else, so a logged-out visitor is not invited to
  // follow somebody they will find unfollowable once they are in. The one
  // exception is a follow that predates the mandate ending: that row still
  // exists and still needs its way out.
  if (!agent.inOffice && held?.kid !== agent.kid) return { kind: "unavailable" };

  if (!follows) return { kind: "anonymous" };
  if (held?.kid === agent.kid) return { kind: "following" };
  if (held) return { kind: "taken", agentKid: held.kid, agentName: held.name };
  return { kind: "available" };
}
