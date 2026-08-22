/**
 * Parties list: active parties with their agent count and (for logged-in
 * citizens) their alignment meter. Sortable by alignment (when logged in),
 * number of agents, or name.
 */
import { Container, Field, Select, ButtonLink } from "@/components/ui";
import { PageIntro } from "@/components/public/Section";
import { IndexPlate } from "@/components/public/IndexPlate";
import { FilterBar } from "@/components/public/FilterBar";
import { PartyCard } from "@/components/public/PartyCard";
import { db } from "@/lib/db";
import { toPublicParty } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import {
  citizenPartyAlignments,
  partyElectorateAlignments,
  partyBaseAlignments,
  type BaseAlignment,
} from "@/lib/indexes/alignment";
import { partyQualityScores } from "@/lib/domain/quality";
import { publicReading } from "@/lib/domain/reading";

export const dynamic = "force-dynamic";

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const session = await getCitizenSession();

  const parties = await db.party.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
  });


  // The published reading: the combined bases of the party's agents, falling
  // back to the electorate where none of them is followed yet.
  const [engagement, base, quality] = await Promise.all([
    partyElectorateAlignments(),
    partyBaseAlignments(),
    partyQualityScores(),
  ]);

  // Alignment for logged-in citizens.
  let alignments: Map<string, { alignment: number | null; agents: number }> | null = null;
  if (session) {
    const user = await db.user.findUnique({
      where: { kid: session.userKid },
      select: { id: true, voteVersion: true },
    });
    if (user) {
      alignments = await citizenPartyAlignments(user.id, user.voteVersion);
    }
  }

  type Row = {
    party: ReturnType<typeof toPublicParty>;
    alignment: number | null;
    quality: number | null;
    engagement: number | null;
    base: BaseAlignment | undefined;
    /** The figure actually printed — what the ranking must order on. */
    published: number | null;
  };

  let rows: Row[] = parties.map((p) => {
    const partyBase = base.get(p.kid);
    const partyEngagement = engagement.get(p.kid)?.alignment ?? null;
    return {
      party: toPublicParty(p),
      alignment: alignments?.get(p.kid)?.alignment ?? null,
      quality: quality.get(p.kid) ?? null,
      engagement: partyEngagement,
      base: partyBase,
      published: publicReading(partyBase, partyEngagement).value,
    };
  });

  if (sort === "alignment" && alignments) {
    rows = [...rows].sort((a, b) => (b.alignment ?? -1) - (a.alignment ?? -1));
  } else if (sort === "engagement") {
    rows = [...rows].sort((a, b) => (b.published ?? -1) - (a.published ?? -1));
  } else if (sort === "quality") {
    // −1 for the unmeasured, so they sink rather than ranking as zero.
    rows = [...rows].sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1));
  } else if (sort === "agents") {
    rows = [...rows].sort((a, b) => b.party.agentCount - a.party.agentCount);
  }

  // Masthead plate: the five largest benches. A party list is read as a balance
  // of forces before it is read alphabetically, and the headcount is the one
  // figure that is available for every party today (the positioning index needs
  // themes tagged with dimensions, which most still lack). Terracota marks the
  // leader, as in the home ranking.
  const benchRows = [...parties]
    .sort((a, b) => b.agentCount - a.agentCount)
    .slice(0, 5)
    .filter((p) => p.agentCount > 0)
    .map((p, i) => ({
      label: p.acronym ?? p.name,
      value: p.agentCount,
      color: i === 0 ? "var(--color-accent-500)" : "var(--color-navy-800)",
    }));

  return (
    <>
      <PageIntro
        eyebrow="Bancadas e alinhamento"
        title="Partidos"
        lead="Tamanho de bancada e, ao entrar, o seu alinhamento com cada partido."
        figure={
          benchRows.length > 0 ? (
            <IndexPlate
              caption="Maiores bancadas"
              note={`${parties.length.toLocaleString("pt-BR")} ${parties.length === 1 ? "partido" : "partidos"}`}
              rows={benchRows}
            />
          ) : null
        }
      >
        {!session ? (
          <ButtonLink href="/login">Entrar para ver meu alinhamento</ButtonLink>
        ) : null}
      </PageIntro>

      <Container className="py-10">
        <FilterBar submitLabel="Aplicar">
          <Field label="Ordenar por">
            <Select variant="rule" name="sort" defaultValue={sort ?? ""}>
              <option value="">Nome</option>
              {/* The value stays `engagement` (an internal token, and links to
                  it already exist); the label follows what is actually shown. */}
              {/* The two index readings sit together, then the structural
                  count: they answer the same kind of question as each other and
                  a different kind from "how big is the bench". */}
              <option value="engagement">Alinhamento com a base</option>
              <option value="quality">Índice de qualidade</option>
              {session ? <option value="alignment">Seu alinhamento</option> : null}
              <option value="agents">Nº de agentes</option>
            </Select>
          </Field>
        </FilterBar>

        {rows.length === 0 ? (
          <p className="border-t border-line py-8 text-sm text-[var(--color-muted)]">
            Nenhum partido cadastrado.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row, i) => (
              <PartyCard
                key={row.party.kid}
                party={row.party}
                alignment={session ? row.alignment : null}
                engagement={row.engagement}
                base={row.base}
                quality={row.quality}
                // Cards sharing a row arrive left to right; each row of the grid
                // still waits for its own scroll position.
                delay={(i % 3) * 80}
              />
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
