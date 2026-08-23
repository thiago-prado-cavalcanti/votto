/**
 * Card summarizing a party in lists: logo/acronym, name, agent count and
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
import { publicReading } from "@/lib/domain/reading";
import type { BaseAlignment } from "@/lib/indexes/alignment";
import type { PublicParty } from "@/lib/dto";

export function PartyCard({
  party,
  alignment = null,
  engagement = null,
  base,
  quality = null,
  delay = 0,
}: {
  party: PublicParty;
  /** 0–100 alignment with the logged-in citizen, or null when N/A. */
  alignment?: number | null;
  /** 0–100 engagement with the whole electorate (the fallback reading). */
  engagement?: number | null;
  /** The party's reading against the combined bases of its agents. */
  base?: BaseAlignment;
  /**
   * 0–100 quality index — the mean of the party's sitting agents' scores, the
   * same way alignment aggregates. Null when none of them could be measured.
   */
  quality?: number | null;
  /** Offset for cards that arrive on the same row, in ms. */
  delay?: number;
}) {
  const acronym = party.acronym ?? party.name.slice(0, 3).toUpperCase();
  const reading = publicReading(base, engagement);

  return (
    <Reveal delay={delay} className="h-full">
      <Card className="flex h-full flex-col transition-colors hover:border-navy-300">
        <CardBody className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-3">
            {/* The logo sits free on the paper — no plate, no corner, no padding.
                Only its height is set: the marks are built on a shared canvas
                height that carries their normalized optical weight, each cut
                tight in width (`scripts/build-party-logos.mjs`), so the element
                wraps the mark and lines up with the card's edge. `multiply` lets
                a mark exported on a white plate dissolve into the surface. */}
            <ImageWithFallback
              src={party.logoUrl}
              alt={acronym}
              className="h-10 w-auto max-w-32 shrink-0 object-contain mix-blend-multiply"
              fallback={
                <div className="flex h-10 shrink-0 items-center font-display text-lg leading-none text-navy-700">
                  {acronym}
                </div>
              }
            />
            <div className="min-w-0">
              <Link href={`/partidos/${party.kid}`} className="group">
                <h3 className="truncate text-lg text-navy-900 group-hover:underline">
                  {party.name}
                </h3>
              </Link>
              <p className="text-xs text-[var(--color-muted)]">
                {acronym} · {party.agentCount}{" "}
                {party.agentCount === 1 ? "agente" : "agentes"}
              </p>
            </div>
            <ShareButton
              kind="partido"
              kid={party.kid}
              title={party.name}
              className="ml-auto shrink-0 self-start"
            />
          </div>

          {/* Only when there is something to say — an empty row still costs the
              column gap. */}
          {party.status === "BLOCKED" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="gray">Bloqueado</Badge>
            </div>
          ) : null}

          {/* Only when there is a reading: an empty block still costs its padding
              and the column gap, leaving the card with a hollow bottom margin. */}
          {reading.value !== null || alignment !== null || quality !== null ? (
            <div className="mt-auto space-y-2 pt-2">
              {reading.value !== null ? (
                <AlignmentMeter value={reading.value} label={reading.label} />
              ) : null}
              {alignment !== null ? (
                <AlignmentMeter value={alignment} label="Seu alinhamento" />
              ) : null}
              {quality !== null ? (
                <AlignmentMeter value={quality} label="Performance política" />
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </Reveal>
  );
}
