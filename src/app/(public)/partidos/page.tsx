/**
 * Parties list: active parties with their aggregate left↔right positioning band,
 * agent count and (for logged-in citizens) their alignment meter. Sortable by
 * alignment (when logged in), number of agents, or name.
 */
import { Container, Card, CardBody, Field, Select, Button } from "@/components/ui";
import { PartyCard } from "@/components/public/PartyCard";
import { db } from "@/lib/db";
import { toPublicParty } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { getPartyPosition } from "@/lib/domain/positions";
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

  // Aggregate positioning per party (uses internal id; never exposed).
  const positions = await Promise.all(parties.map((p) => getPartyPosition(p.id)));

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
    profileLabel: string;
    profileKey: string;
    profileBasis: number;
    alignment: number | null;
    engagement: number | null;
  };

  let rows: Row[] = parties.map((p, i) => ({
    party: toPublicParty(p),
    profileLabel: positions[i].profileLabel,
    profileKey: positions[i].profileKey,
    profileBasis: positions[i].basis,
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

  return (
    <Container className="py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-navy-900">Partidos</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Posição no espectro político e, ao entrar, o seu alinhamento com cada partido.
        </p>
      </header>

      {/* Filters */}
      <Card className="mb-8">
        <CardBody>
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Ordenar por">
              <Select name="sort" defaultValue={sort ?? ""}>
                <option value="">Nome</option>
                <option value="engagement">Engajamento com eleitores</option>
                <option value="agents">Nº de agentes</option>
                {session ? <option value="alignment">Seu alinhamento</option> : null}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full sm:w-auto">
                Aplicar
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-muted)]">Nenhum partido cadastrado.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <PartyCard
              key={row.party.kid}
              party={row.party}
              profileLabel={row.profileLabel}
              profileKey={row.profileKey}
              profileBasis={row.profileBasis}
              alignment={session ? row.alignment : null}
              engagement={row.engagement}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
