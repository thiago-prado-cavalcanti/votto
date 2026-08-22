/**
 * Agents list: active public agents with party, type, location, positioning
 * profile and (for logged-in citizens) their alignment meter. Supports search by
 * name or party, filtering by type/state/party, and sorting by alignment (when
 * logged in), quality or name — one GET form, so every control narrows the same
 * query and the URL stays the state.
 */
import { Container, Field, Select, Input, ButtonLink } from "@/components/ui";
import { PageIntro } from "@/components/public/Section";
import { IndexPlate } from "@/components/public/IndexPlate";
import { FilterBar } from "@/components/public/FilterBar";
import { AgentCard } from "@/components/public/AgentCard";
import { db } from "@/lib/db";
import { toPublicAgent } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import {
  citizenAgentAlignments,
  agentElectorateAlignments,
  agentBaseAlignments,
  type BaseAlignment,
} from "@/lib/indexes/alignment";
import { citizenFollows, followSlot } from "@/lib/domain/follows";
import { publicReading } from "@/lib/domain/reading";
import { agentSearchFilter } from "@/lib/domain/search";
import type { FollowSlot } from "@/components/public/FollowButton";
import { agentTypeLabel, agentTypePluralLabel, BR_STATES } from "@/lib/labels";
import type { AgentType, Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const AGENT_TYPES = Object.keys(agentTypeLabel) as AgentType[];

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    state?: string;
    party?: string;
    sort?: string;
  }>;
}) {
  const { q, type, state, party, sort } = await searchParams;
  const session = await getCitizenSession();

  // Former members keep their votes (the alignment index needs them) but are
  // not listed or ranked — the page is about who holds a mandate today.
  const where: Prisma.PublicAgentWhereInput = { status: "ACTIVE", inOffice: true };
  if (type && AGENT_TYPES.includes(type as AgentType)) where.type = type as AgentType;
  if (state) where.state = state;
  if (party) where.party = { kid: party };
  // Search: the agent's own name and their party's name/acronym, folded so an
  // accent never has to be typed (`jose guimaraes`, `uniao`). Every word must
  // match, which is what makes `joao pt` mean "someone called João, in the PT"
  // rather than "every João plus the whole PT bench". ANDed with the selects
  // above rather than replacing them — box and filters are one form.
  const search = agentSearchFilter(q);
  if (search) where.AND = search;

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

  // The published reading: each agent against their own base, falling back to
  // the electorate where nobody follows them yet (`publicReading`).
  const [engagement, base] = await Promise.all([
    agentElectorateAlignments(),
    agentBaseAlignments(),
  ]);

  // Alignment and declarations for logged-in citizens.
  let alignments: Map<string, { alignment: number | null; sharedThemes: number }> | null = null;
  let follows: Awaited<ReturnType<typeof citizenFollows>> | null = null;
  if (session) {
    const user = await db.user.findUnique({
      where: { kid: session.userKid },
      select: { id: true, voteVersion: true },
    });
    if (user) {
      [alignments, follows] = await Promise.all([
        citizenAgentAlignments(user.id, user.voteVersion),
        citizenFollows(user.id),
      ]);
    }
  }

  type Row = {
    agent: ReturnType<typeof toPublicAgent>;
    alignment: number | null;
    engagement: number | null;
    base: BaseAlignment | undefined;
    follow: FollowSlot;
    /** The figure actually printed — what "sort by alignment" must order on. */
    published: number | null;
    /** 0–100 quality index, or null when we could not measure enough of it. */
    quality: number | null;
  };

  let rows: Row[] = agents.map((a) => {
    const agentBase = base.get(a.kid);
    const agentEngagement = engagement.get(a.kid)?.alignment ?? null;
    return {
      agent: toPublicAgent(a),
      alignment: alignments?.get(a.kid)?.alignment ?? null,
      engagement: agentEngagement,
      base: agentBase,
      follow: followSlot(a, session ? follows ?? new Map() : null),
      published: publicReading(agentBase, agentEngagement).value,
      quality: a.qualityScore,
    };
  });

  if (sort === "alignment" && alignments) {
    rows = [...rows].sort((a, b) => (b.alignment ?? -1) - (a.alignment ?? -1));
  } else if (sort === "engagement") {
    rows = [...rows].sort((a, b) => (b.published ?? -1) - (a.published ?? -1));
  } else if (sort === "quality") {
    // −1 for the unmeasured, so they sink instead of being ranked as if they
    // had scored zero (CLAUDE.md §3.3).
    rows = [...rows].sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1));
  }

  // Masthead plate: the bench by office. Counted over the agents already in hand
  // (the query has no `take`, so this is the whole filtered set) rather than in a
  // second round trip, and it follows the filters for the same reason the plate
  // on the themes page does — it describes what is on the screen.
  const byType = new Map<AgentType, number>();
  for (const agent of agents) byType.set(agent.type, (byType.get(agent.type) ?? 0) + 1);
  const officeRows = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      label: agentTypePluralLabel[type],
      value: count,
      color: "var(--color-colonial-500)",
    }));

  return (
    <>
      <PageIntro
        eyebrow="Índice de alinhamento"
        title="Agentes públicos"
        lead="Veja os representantes, siga quem representa você e descubra o seu alinhamento com cada um."
        figure={
          officeRows.length > 0 ? (
            <IndexPlate
              caption="Por cargo"
              note={`${agents.length.toLocaleString("pt-BR")} ${agents.length === 1 ? "agente" : "agentes"}`}
              rows={officeRows}
            />
          ) : null
        }
      >
        {!session ? (
          <ButtonLink href="/login">Entrar para ver meu alinhamento</ButtonLink>
        ) : null}
      </PageIntro>

      <Container className="py-10">
        <FilterBar>
          <Field label="Buscar">
            <Input
              variant="rule"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Nome ou partido"
            />
          </Field>
          <Field label="Tipo">
            <Select variant="rule" name="type" defaultValue={type ?? ""}>
              <option value="">Todos</option>
              {AGENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {agentTypeLabel[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select variant="rule" name="state" defaultValue={state ?? ""}>
              <option value="">Todos</option>
              {BR_STATES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Partido">
            <Select variant="rule" name="party" defaultValue={party ?? ""}>
              <option value="">Todos</option>
              {parties.map((p) => (
                <option key={p.kid} value={p.kid}>
                  {p.acronym ?? p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ordenar por">
            <Select variant="rule" name="sort" defaultValue={sort ?? ""}>
              <option value="">Nome</option>
              {/* The value stays `engagement` (an internal token, and links to
                  it already exist); the label follows what is actually shown. */}
              <option value="engagement">Alinhamento com a base</option>
              <option value="quality">Índice de qualidade</option>
              {session ? <option value="alignment">Seu alinhamento</option> : null}
            </Select>
          </Field>
        </FilterBar>

        {rows.length === 0 ? (
          <p className="border-t border-line py-8 text-sm text-[var(--color-muted)]">
            Nenhum agente encontrado para esta busca.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row, i) => (
              <AgentCard
                key={row.agent.kid}
                agent={row.agent}
                alignment={session ? row.alignment : null}
                engagement={row.engagement}
                base={row.base}
                quality={row.quality}
                follow={row.follow}
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
