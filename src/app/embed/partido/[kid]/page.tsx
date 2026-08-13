/**
 * Embeddable party widget: identity + the "Alinhamento com eleitores" rating
 * (stars + %). Dynamic
 * so the rating stays live inside the iframe.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EmbedShell } from "@/components/public/EmbedShell";
import { StarRating } from "@/components/public/StarRating";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { partyElectorateAlignments } from "@/lib/indexes/alignment";

export const dynamic = "force-dynamic";

export default async function PartyEmbed({ params }: { params: Promise<{ kid: string }> }) {
  const { kid } = await params;
  const party = await db.party.findUnique({ where: { kid } });
  if (!party || party.status !== "ACTIVE") notFound();

  const engagement = await partyElectorateAlignments();
  const alignment = engagement.get(party.kid)?.alignment ?? null;

  const acronym = party.acronym ?? party.name.slice(0, 3).toUpperCase();

  return (
    <EmbedShell eyebrow="Partido" href={`/partidos/${party.kid}`} cta="Ver no Votto">
      <div className="flex items-center gap-3">
        {/* Same treatment as the parties page: the mark fits whole inside a
            square, with no plate of its own. */}
        <ImageWithFallback
          src={party.logoUrl}
          alt={acronym}
          className="h-10 w-auto max-w-32 shrink-0 object-contain mix-blend-multiply"
          fallback={
            <div className="flex h-10 shrink-0 items-center font-display text-base leading-none text-navy-700">
              {acronym}
            </div>
          }
        />
        <div className="min-w-0">
          <h1 className="truncate text-lg text-navy-900">{party.name}</h1>
          <p className="truncate text-xs text-[var(--color-muted)]">
            {acronym} · {party.agentCount} {party.agentCount === 1 ? "agente" : "agentes"}
          </p>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <div className="text-xs font-medium text-[var(--color-muted)]">
          Alinhamento com eleitores
        </div>
        <div className="mt-1 flex items-center gap-3">
          <span className="vt-num text-3xl text-navy-900">
            {alignment === null ? "—" : `${alignment}%`}
          </span>
          {alignment !== null ? <StarRating value={alignment} size={18} /> : null}
        </div>
      </div>
    </EmbedShell>
  );
}
