/**
 * Dynamic widget/OG image endpoint: GET /api/og/<tema|agente|partido>/<kid>.
 *
 * Renders the live branded card (next/og) used both as the link-unfurl image on
 * the detail pages and as the downloadable PNG (?download=1) for Instagram and
 * manual sharing. Public, login-independent — exposes only already-public data
 * keyed by `kid` (never internal ids; CLAUDE.md §5).
 */
import { db } from "@/lib/db";
import {
  agentElectorateAlignments,
  partyElectorateAlignments,
  agentBaseAlignments,
  partyBaseAlignments,
} from "@/lib/indexes/alignment";
import { publicReading } from "@/lib/domain/reading";
import { getAgentPosition, getPartyPosition } from "@/lib/domain/positions";
import { agentTypeLabel } from "@/lib/labels";
import { themeCardImage, agentCardImage, partyCardImage } from "@/lib/widgets/images";

// ImageResponse + Prisma/Redis → must run on the Node.js runtime (not edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["tema", "agente", "partido"]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string; kid: string }> },
) {
  const { type, kid } = await params;
  if (!TYPES.has(type)) return new Response("Not found", { status: 404 });

  const image = await buildImage(type, kid);
  if (!image) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.get("download");
  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
  if (download) {
    headers.set("Content-Disposition", `attachment; filename="votto-${type}-${kid}.png"`);
  }
  return new Response(image.body, { status: image.status, headers });
}

async function buildImage(type: string, kid: string): Promise<Response | null> {
  if (type === "tema") {
    const theme = await db.theme.findUnique({
      where: { kid },
      select: { name: true, yesCount: true, noCount: true, absCount: true, status: true },
    });
    if (!theme || theme.status !== "ACTIVE") return null;
    return themeCardImage({
      name: theme.name,
      yes: theme.yesCount,
      no: theme.noCount,
      abs: theme.absCount,
    });
  }

  if (type === "agente") {
    const agent = await db.publicAgent.findUnique({
      where: { kid },
      include: { party: true },
    });
    if (!agent || agent.status !== "ACTIVE") return null;
    // The same reading the site publishes: the agent's own base where they have
    // one, the electorate where they do not. A shared card that disagreed with
    // the page it links to would be worse than no card.
    const [engagement, base, position] = await Promise.all([
      agentElectorateAlignments(),
      agentBaseAlignments(),
      getAgentPosition(agent.id),
    ]);
    const location = [agent.municipality, agent.state].filter(Boolean).join(" · ");
    const subtitleParts = [agentTypeLabel[agent.type]];
    if (agent.party) subtitleParts.push(agent.party.acronym ?? agent.party.name);
    if (location) subtitleParts.push(location);
    return agentCardImage({
      name: `${agent.firstName} ${agent.lastName}`.trim(),
      subtitle: subtitleParts.join(" · "),
      imageUrl: agent.imageUrl,
      alignment: publicReading(base.get(agent.kid), engagement.get(agent.kid)?.alignment ?? null)
        .value,
    });
  }

  // partido
  const party = await db.party.findUnique({ where: { kid } });
  if (!party || party.status !== "ACTIVE") return null;
  const [engagement, base, position] = await Promise.all([
    partyElectorateAlignments(),
    partyBaseAlignments(),
    getPartyPosition(party.id),
  ]);
  const acronym = party.acronym ?? party.name.slice(0, 3).toUpperCase();
  return partyCardImage({
    name: party.name,
    acronym,
    subtitle: `${acronym} · ${party.agentCount} ${party.agentCount === 1 ? "agente" : "agentes"}`,
    logoUrl: party.logoUrl,
    alignment: publicReading(base.get(party.kid), engagement.get(party.kid)?.alignment ?? null)
      .value,
  });
}
