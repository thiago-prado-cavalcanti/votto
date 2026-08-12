/**
 * Embeddable agent widget: identity + the "Alinhamento com eleitores" rating
 * (stars + %) with the positioning band as a secondary chip. Dynamic so the
 * rating stays live inside the iframe.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EmbedShell } from "@/components/public/EmbedShell";
import { StarRating } from "@/components/public/StarRating";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { agentElectorateAlignments } from "@/lib/indexes/alignment";
import { getAgentPosition } from "@/lib/domain/positions";
import { agentTypeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AgentEmbed({ params }: { params: Promise<{ kid: string }> }) {
  const { kid } = await params;
  const agent = await db.publicAgent.findUnique({ where: { kid }, include: { party: true } });
  if (!agent || agent.status !== "ACTIVE") notFound();

  const [engagement, position] = await Promise.all([
    agentElectorateAlignments(),
    getAgentPosition(agent.id),
  ]);
  const alignment = engagement.get(agent.kid)?.alignment ?? null;
  const band = position.basis > 0 ? position.profileLabel : null;

  const fullName = `${agent.firstName} ${agent.lastName}`.trim();
  const initials = `${agent.firstName[0] ?? ""}${agent.lastName[0] ?? ""}`.toUpperCase();
  const subtitle = [agentTypeLabel[agent.type], agent.party?.acronym ?? agent.party?.name]
    .filter(Boolean)
    .join(" · ");

  return (
    <EmbedShell eyebrow="Agente público" href={`/agentes/${agent.kid}`} cta="Ver no Votto">
      <div className="flex items-center gap-3">
        <ImageWithFallback
          src={agent.imageUrl}
          alt={fullName}
          className="h-12 w-12 rounded-full bg-navy-50 object-cover"
          fallback={
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-100 text-sm font-semibold text-navy-700">
              {initials}
            </div>
          }
        />
        <div className="min-w-0">
          <h1 className="truncate text-lg text-navy-900">{fullName}</h1>
          <p className="truncate text-xs text-[var(--color-muted)]">{subtitle}</p>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <RatingBlock alignment={alignment} band={band} />
      </div>
    </EmbedShell>
  );
}

function RatingBlock({ alignment, band }: { alignment: number | null; band: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium text-[var(--color-muted)]">Alinhamento com eleitores</div>
      <div className="mt-1 flex items-center gap-3">
        <span className="vt-num text-3xl text-navy-900">
          {alignment === null ? "—" : `${alignment}%`}
        </span>
        {alignment !== null ? <StarRating value={alignment} size={18} /> : null}
        {band ? (
          <span className="ml-auto rounded-[2px] bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-800">
            {band}
          </span>
        ) : null}
      </div>
    </div>
  );
}
