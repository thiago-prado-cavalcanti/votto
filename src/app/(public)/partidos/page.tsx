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
import { citizenPartyAlignments, partyElectorateAlignments } from "@/lib/indexes/alignment";

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


  // Electorate engagement (always available, login-independent).
  const engagement = await partyElectorateAlignments();

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
    engagement: number | null;
  };

  let rows: Row[] = parties.map((p) => ({
    party: toPublicParty(p),
    alignment: alignments?.get(p.kid)?.alignment ?? null,
    engagement: engagement.get(p.kid)?.alignment ?? null,
  }));

  if (sort === "alignment" && alignments) {
    rows = [...rows].sort((a, b) => (b.alignment ?? -1) - (a.alignment ?? -1));
  } else if (sort === "engagement") {
    rows = [...rows].sort((a, b) => (b.engagement ?? -1) - (a.engagement ?? -1));
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
              <option value="engagement">Alinhamento com eleitores</option>
              <option value="agents">Nº de agentes</option>
              {session ? <option value="alignment">Seu alinhamento</option> : null}
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
