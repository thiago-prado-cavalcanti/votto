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
import { AgentFeed } from "@/components/public/AgentFeed";
import { SortHeader } from "@/components/public/SortHeader";
import { agentDirection, agentSort, loadAgentPage } from "@/lib/domain/agent-list";
import { db } from "@/lib/db";
import { getCitizenSession } from "@/lib/auth/session";
import { agentTypeLabel, agentTypePluralLabel, BR_STATES } from "@/lib/labels";
import type { AgentType } from "@/generated/prisma";

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
    dir?: string;
    p?: string;
  }>;
}) {
  const { q, type, state, party, sort, dir, p } = await searchParams;
  const query = { q, type, state, party, sort, dir };
  const session = await getCitizenSession();

  const viewer = session
    ? await db.user.findUnique({
        where: { kid: session.userKid },
        select: { id: true, voteVersion: true },
      })
    : null;

  // One page of rows, not the whole bench. The ordering still needs every row
  // (three of the four sorts come from cached index maps, not from columns), but
  // only a page of them is rendered into the document — see `agent-list.ts`.
  const [page, parties] = await Promise.all([
    loadAgentPage(
      query,
      Number(p) || 1,
      viewer ? { userId: viewer.id, voteVersion: viewer.voteVersion } : null,
    ),
    db.party.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { kid: true, name: true, acronym: true },
    }),
  ]);
  const rows = page.rows;
  const activeSort = agentSort(sort);
  const activeDir = agentDirection(dir, activeSort);

  // A reading is offered only where it has something to say: the personal one
  // needs a session, the others need the data to exist at all. That is what
  // keeps the header from offering an ordering that would rank nothing.
  const sortOptions = [
    // Name is always offered: it is the one ordering that never depends on data
    // having arrived, and it is the default for the same reason.
    { key: "name", label: "Nome", has: true },
    { key: "quality", label: "Performance política", has: rows.some((r) => r.quality !== null) },
    {
      key: "personal",
      label: "Alinhamento com você",
      has: Boolean(session) && rows.some((r) => r.alignment !== null),
    },
    { key: "base", label: "Alinhamento com a base", has: rows.some((r) => r.published !== null) },
  ]
    .filter((o) => o.has)
    .map(({ key, label }) => ({
      key,
      label,
      // Built here rather than in the component: a server component cannot pass
      // a function across to a client one. Clicking the option already in force
      // turns the arrow over; clicking another starts it descending.
      href: `?${new URLSearchParams({
        ...(Object.fromEntries(
          Object.entries({ q, type, state, party }).filter(([, v]) => v),
        ) as Record<string, string>),
        sort: key,
        // Re-clicking turns the arrow over; a fresh choice starts where that
        // reading is usually read — A→Z for the name, top-down for an index.
        dir:
          key === activeSort
            ? activeDir === "asc"
              ? "desc"
              : "asc"
            : key === "name"
              ? "asc"
              : "desc",
      }).toString()}`,
    }));

  // Masthead plate: the bench by office. Counted over the whole filtered set
  // (`page.byType`), not over the slice — it is the shape of what the filters
  // selected, and it must not shrink as the reader scrolls.
  const officeRows = page.byType
    .map(({ type, count }) => ({
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
              // The whole filtered set, not the slice on screen.
              note={`${page.total.toLocaleString("pt-BR")} ${page.total === 1 ? "agente" : "agentes"}`}
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
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
        </FilterBar>

        {/* Ordering is a header of the list, not a filter: the filters say which
            agents, this says which reading ranks them. Anchors rather than
            buttons because the server paginates — page two has to agree with
            page one, so the choice lives in the URL. */}
        {sortOptions.length > 1 ? (
          // Pulled flush against the filter bar, whose `mb-10` would otherwise
          // leave an empty band between the fields and this row.
          <SortHeader
            options={sortOptions}
            active={activeSort}
            direction={activeDir}
            className="-mt-10 mb-8"
          />
        ) : null}

        {rows.length === 0 ? (
          <p className="border-t border-line py-8 text-sm text-[var(--color-muted)]">
            Nenhum agente encontrado para esta busca.
          </p>
        ) : (
          <AgentFeed
            query={query}
            startPage={page.page}
            initialHasMore={page.hasMore}
            isAuthenticated={Boolean(session)}
          >
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
          </AgentFeed>
        )}
      </Container>
    </>
  );
}
