/**
 * Card summarizing a party in lists: logo/acronym, name, agent count, aggregate
 * left↔right positioning band and (optionally) the citizen's alignment meter.
 */
import Link from "next/link";
import { Card, CardBody, Badge, AlignmentMeter } from "@/components/ui";
import { PositionBadge } from "@/components/public/PositionBadge";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import type { PublicParty } from "@/lib/dto";

export function PartyCard({
  party,
  profileLabel,
  profileKey,
  profileBasis,
  alignment = null,
  engagement = null,
}: {
  party: PublicParty;
  profileLabel: string;
  profileKey?: string;
  profileBasis: number;
  /** 0–100 alignment with the logged-in citizen, or null when N/A. */
  alignment?: number | null;
  /** 0–100 engagement with the whole electorate (always available). */
  engagement?: number | null;
}) {
  const acronym = party.acronym ?? party.name.slice(0, 3).toUpperCase();

  return (
    <Card className="flex h-full flex-col">
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-3">
          <ImageWithFallback
            src={party.logoUrl}
            alt={acronym}
            className="h-12 w-12 rounded-xl bg-navy-50 object-contain p-1"
            fallback={
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-900 text-xs font-extrabold text-white">
                {acronym}
              </div>
            }
          />
          <div className="min-w-0">
            <Link href={`/partidos/${party.kid}`} className="group">
              <h3 className="truncate text-base font-semibold text-navy-900 group-hover:text-navy-600">
                {party.name}
              </h3>
            </Link>
            <p className="text-xs text-[var(--color-muted)]">
              {acronym} · {party.agentCount}{" "}
              {party.agentCount === 1 ? "agente" : "agentes"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PositionBadge
            profileLabel={profileLabel}
            profileKey={profileKey}
            basis={profileBasis}
          />
          {party.status === "BLOCKED" ? <Badge tone="gray">Bloqueado</Badge> : null}
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
