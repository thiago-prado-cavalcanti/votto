/**
 * Card summarizing a public agent in lists: party, type, location and
 * (optionally) the citizen's alignment meter.
 *
 * The card is its own revealed block, which is also what arms the alignment
 * meters inside it: the pigment wipes in and the reading arrives behind it.
 * `delay` offsets cards sharing a row of the grid.
 */
import Link from "next/link";
import { Reveal } from "@/components/public/motion";
import { Card, CardBody, Badge, AlignmentMeter } from "@/components/ui";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { ShareButton } from "@/components/public/ShareButton";
import { FollowButton, type FollowSlot } from "@/components/public/FollowButton";
import { cn } from "@/lib/cn";
import { agentTypeLabel, agentTypeProseLabel } from "@/lib/labels";
import { publicReading } from "@/lib/domain/reading";
import type { BaseAlignment } from "@/lib/indexes/alignment";
import type { PublicAgentDTO } from "@/lib/dto";

export function AgentCard({
  agent,
  alignment = null,
  engagement = null,
  base,
  quality = null,
  follow,
  delay = 0,
}: {
  agent: PublicAgentDTO;
  /** 0–100 alignment with the logged-in citizen, or null when N/A. */
  alignment?: number | null;
  /** 0–100 engagement with the whole electorate (the fallback reading). */
  engagement?: number | null;
  /** The agent's reading against their own base, when anybody follows them. */
  base?: BaseAlignment;
  /**
   * 0–100 quality index — how the mandate is exercised, independent of who the
   * agent agrees with. Null when too little of it could be measured, and the
   * meter is then omitted rather than drawn at zero (CLAUDE.md §3.3).
   */
  quality?: number | null;
  /** What the follow control should render; omitted where it does not belong. */
  follow?: FollowSlot;
  /** Offset for cards that arrive on the same row, in ms. */
  delay?: number;
}) {
  const fullName = `${agent.firstName} ${agent.lastName}`.trim();
  const location = [agent.municipality, agent.state].filter(Boolean).join(" · ");
  const initials = `${agent.firstName[0] ?? ""}${agent.lastName[0] ?? ""}`.toUpperCase();
  const reading = publicReading(base, engagement);

  return (
    <Reveal delay={delay} className="h-full">
      <Card className="flex h-full flex-col transition-colors hover:border-navy-300">
        <CardBody className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-3">
            <ImageWithFallback
              src={agent.imageUrl}
              alt={fullName}
              className="h-14 w-14 rounded-full bg-navy-100 object-cover"
              fallback={
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-100 text-sm font-semibold text-navy-700">
                  {initials}
                </div>
              }
            />
            <div className="min-w-0">
              <Link href={`/agentes/${agent.kid}`} className="group">
                <h3 className="truncate text-lg text-navy-900 group-hover:underline">{fullName}</h3>
              </Link>
              <p className="text-xs text-[var(--color-muted)]">
                {agentTypeLabel[agent.type]}
                {location ? ` · ${location}` : ""}
              </p>
            </div>
            <ShareButton
              kind="agente"
              kid={agent.kid}
              title={fullName}
              className="ml-auto shrink-0 self-start"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {agent.party ? (
              // The party is a mark, not a tag: nearly every official logo is a
              // wordmark, so inside a badge — 16px tall — it collapsed into a
              // coloured smear, and printing the acronym beside it said the same
              // thing twice. Now that the curated marks carry the acronym
              // themselves (`src/lib/integration/party-logos.ts`), the mark is
              // the label; the acronym in small caps only stands in for a party
              // that has no curated mark yet.
              //
              // Only the HEIGHT is set: the marks are built on a shared canvas
              // height that carries their normalized weight, each cut tight in
              // width (`scripts/build-party-logos.mjs`). Fixing the width too
              // would pad the element past the mark and un-align it from the
              // card's edge — the max-w is a guard, not the layout.
              <ImageWithFallback
                src={agent.party.logoUrl}
                alt={agent.party.acronym ?? agent.party.name}
                className="h-10 w-auto max-w-28 shrink-0 object-contain mix-blend-multiply"
                fallback={
                  <span className="text-xs font-medium uppercase tracking-[0.08em] text-navy-700">
                    {agent.party.acronym ?? agent.party.name}
                  </span>
                }
              />
            ) : (
              <Badge tone="gray">Sem partido</Badge>
            )}
          </div>

          {/* Rendered only when there is a reading to show. An agent with no
              shared themes yet has neither meter, and an empty block still costs
              its own padding plus the column gap — which is the hollow bottom
              margin those cards were carrying.

              The first meter is the base wherever there is one and the
              electorate where there is not (`publicReading`) — never both, they
              answer the same question. */}
          {reading.value !== null || alignment !== null || quality !== null ? (
            <div className="mt-auto space-y-2 pt-2">
              {reading.value !== null ? (
                <AlignmentMeter value={reading.value} label={reading.label} />
              ) : null}
              {alignment !== null ? (
                <AlignmentMeter value={alignment} label="Seu alinhamento" />
              ) : null}
              {/* Quality answers a different question from the two above — not
                  who the agent agrees with, but how the mandate is exercised.
                  Omitted, never zeroed, when it could not be measured. */}
              {quality !== null ? (
                <AlignmentMeter value={quality} label="Performance política" />
              ) : null}
            </div>
          ) : null}

          {/* The declaration, on its own rule under the readings: it is an
              action, not a statistic, and it must not read as a third meter.
              `mt-auto` here too, so a card with no reading at all still pins it
              to the bottom edge. */}
          {follow && follow.kind !== "unavailable" ? (
            <div
              className={cn(
                "border-t border-line pt-2.5",
                reading.value === null && alignment === null ? "mt-auto" : "",
              )}
            >
              <FollowButton
                agentKid={agent.kid}
                agentName={fullName}
                officeLabel={agentTypeProseLabel[agent.type]}
                slot={follow}
              />
            </div>
          ) : null}
        </CardBody>
      </Card>
    </Reveal>
  );
}
