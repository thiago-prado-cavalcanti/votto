/**
 * Embeddable party widget: identity + the "Alinhamento com eleitores" rating
 * (stars + %) with the aggregate positioning band as a secondary chip. Dynamic
 * so the rating stays live inside the iframe.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EmbedShell } from "@/components/public/EmbedShell";
import { StarRating } from "@/components/public/StarRating";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { partyElectorateAlignments } from "@/lib/indexes/alignment";
import { getPartyPosition } from "@/lib/domain/positions";

export const dynamic = "force-dynamic";

export default async function PartyEmbed({ params }: { params: Promise<{ kid: string }> }) {
  const { kid } = await params;
  const party = await db.party.findUnique({ where: { kid } });
  if (!party || party.status !== "ACTIVE") notFound();

  const [engagement, position] = await Promise.all([
    partyElectorateAlignments(),
    getPartyPosition(party.id),
  ]);
  const alignment = engagement.get(party.kid)?.alignment ?? null;
  const band = position.basis > 0 ? position.profileLabel : null;

  const acronym = party.acronym ?? party.name.slice(0, 3).toUpperCase();

  return (
    <EmbedShell eyebrow="Partido" href={`/partidos/${party.kid}`} cta="Ver no Votto">
      <div className="flex items-center gap-3">
        <ImageWithFallback
          src={party.logoUrl}
          alt={acronym}
          className="h-12 w-12 rounded-xl bg-navy-50 object-contain p-1"
          fallback={
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-navy-100 bg-navy-50 px-1 text-center text-[10px] font-extrabold leading-none text-navy-700">
              {acronym}
            </div>
          }
        />
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-navy-900">{party.name}</h1>
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
          <span className="font-display text-3xl font-extrabold tracking-tight text-navy-900">
            {alignment === null ? "—" : `${alignment}%`}
          </span>
          {alignment !== null ? <StarRating value={alignment} size={18} /> : null}
          {band ? (
            <span className="ml-auto rounded-full bg-navy-100 px-2.5 py-1 text-xs font-semibold text-navy-800">
              {band}
            </span>
          ) : null}
        </div>
      </div>
    </EmbedShell>
  );
}
