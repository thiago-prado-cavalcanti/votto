/**
 * Card summarizing a public agent in lists, with party, type, location,
 * positioning profile and (optionally) the citizen's alignment meter.
 */
import Link from "next/link";
import { Card, CardBody, Badge, AlignmentMeter } from "@/components/ui";
import { PositionBadge } from "@/components/public/PositionBadge";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { agentTypeLabel } from "@/lib/labels";
import type { PublicAgentDTO } from "@/lib/dto";

export function AgentCard({
  agent,
  profileLabel,
  profileKey,
  profileBasis,
  alignment = null,
  engagement = null,
}: {
  agent: PublicAgentDTO;
  profileLabel: string;
  profileKey?: string;
  profileBasis: number;
  /** 0–100 alignment with the logged-in citizen, or null when N/A. */
  alignment?: number | null;
  /** 0–100 engagement with the whole electorate (always available). */
  engagement?: number | null;
}) {
  const fullName = `${agent.firstName} ${agent.lastName}`.trim();
  const location = [agent.municipality, agent.state].filter(Boolean).join(" · ");
  const initials = `${agent.firstName[0] ?? ""}${agent.lastName[0] ?? ""}`.toUpperCase();

  return (
    <Card className="flex h-full flex-col">
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-3">
          <ImageWithFallback
            src={agent.imageUrl}
            alt={fullName}
            className="h-14 w-14 rounded-full bg-navy-50 object-cover"
            fallback={
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-100 text-sm font-semibold text-navy-700">
                {initials}
              </div>
            }
          />
          <div className="min-w-0">
            <Link href={`/agentes/${agent.kid}`} className="group">
              <h3 className="truncate text-base font-semibold text-navy-900 group-hover:text-navy-600">
                {fullName}
              </h3>
            </Link>
            <p className="text-xs text-[var(--color-muted)]">
              {agentTypeLabel[agent.type]}
              {location ? ` · ${location}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {agent.party ? (
            <Badge tone="navy">{agent.party.acronym ?? agent.party.name}</Badge>
          ) : (
            <Badge tone="gray">Sem partido</Badge>
          )}
          <PositionBadge profileLabel={profileLabel} profileKey={profileKey} basis={profileBasis} />
        </div>

        <div className="mt-auto space-y-2 pt-2">
          {engagement !== null ? (
            <AlignmentMeter value={engagement} label="Alinhamento com eleitores" />
          ) : null}
          {alignment !== null ? <AlignmentMeter value={alignment} label="Seu alinhamento" /> : null}
        </div>
      </CardBody>
    </Card>
  );
}
