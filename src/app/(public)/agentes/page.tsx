/**
 * Agents list: active public agents with party, type, location, positioning
 * profile and (for logged-in citizens) their alignment meter. Supports filtering
 * by type/state/party and sorting by alignment (when logged in) or name.
 */
import { Container, Card, CardBody, Field, Select, Button } from "@/components/ui";
import { AgentCard } from "@/components/public/AgentCard";
import { db } from "@/lib/db";
import { toPublicAgent } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { getAgentPosition } from "@/lib/domain/positions";
import { citizenAgentAlignments } from "@/lib/indexes/alignment";
import { agentTypeLabel, BR_STATES } from "@/lib/labels";
import type { AgentType, Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const AGENT_TYPES = Object.keys(agentTypeLabel) as AgentType[];

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; state?: string; party?: string; sort?: string }>;
}) {
  const { type, state, party, sort } = await searchParams;
  const session = await getCitizenSession();

  const where: Prisma.PublicAgentWhereInput = { status: "ACTIVE" };
  if (type && AGENT_TYPES.includes(type as AgentType)) where.type = type as AgentType;
  if (state) where.state = state;
  if (party) where.party = { kid: party };

  const [agents, parties] = await Promise.all([
    db.publicAgent.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: { party: true },
    }),
    db.party.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { kid: true, name: true, acronym: true },
    }),
  ]);

  // Positioning per agent (uses internal id; never exposed).
  const positions = await Promise.all(agents.map((a) => getAgentPosition(a.id)));

  // Alignment for logged-in citizens.
  let alignments: Map<string, { alignment: number | null; sharedThemes: number }> | null = null;
  if (session) {
    const user = await db.user.findUnique({
      where: { kid: session.userKid },
      select: { id: true, voteVersion: true },
    });
    if (user) {
      alignments = await citizenAgentAlignments(user.id, user.voteVersion);
    }
  }

  type Row = {
    agent: ReturnType<typeof toPublicAgent>;
    profileLabel: string;
    profileKey: string;
    profileBasis: number;
    alignment: number | null;
  };

  let rows: Row[] = agents.map((a, i) => ({
    agent: toPublicAgent(a),
    profileLabel: positions[i].profileLabel,
    profileKey: positions[i].profileKey,
    profileBasis: positions[i].basis,
    alignment: alignments?.get(a.kid)?.alignment ?? null,
  }));

  if (sort === "alignment" && alignments) {
    rows = [...rows].sort((a, b) => (b.alignment ?? -1) - (a.alignment ?? -1));
  }

  return (
    <Container className="py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-navy-900">Agentes públicos</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Veja os representantes e, ao entrar, descubra o seu alinhamento com cada um.
        </p>
      </header>

      {/* Filters */}
      <Card className="mb-8">
        <CardBody>
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Tipo">
              <Select name="type" defaultValue={type ?? ""}>
                <option value="">Todos</option>
                {AGENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {agentTypeLabel[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select name="state" defaultValue={state ?? ""}>
                <option value="">Todos</option>
                {BR_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Partido">
              <Select name="party" defaultValue={party ?? ""}>
                <option value="">Todos</option>
                {parties.map((p) => (
                  <option key={p.kid} value={p.kid}>
                    {p.acronym ?? p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ordenar por">
              <Select name="sort" defaultValue={sort ?? ""}>
                <option value="">Nome</option>
                {session ? <option value="alignment">Alinhamento</option> : null}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full">
                Filtrar
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-muted)]">
              Nenhum agente encontrado para os filtros selecionados.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <AgentCard
              key={row.agent.kid}
              agent={row.agent}
              profileLabel={row.profileLabel}
              profileKey={row.profileKey}
              profileBasis={row.profileBasis}
              alignment={session ? row.alignment : null}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
