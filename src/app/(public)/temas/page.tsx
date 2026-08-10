/**
 * Themes list: active themes with temperature/tallies, house and priority badges
 * and a quick-vote control. Supports search, scope/state/house filters and three
 * orderings.
 *
 * The default ordering is legislative priority, not citizen engagement: once the
 * official importers are running, most themes have no citizen votes yet, so
 * ranking by engagement would bury exactly the bills that are about to be voted.
 */
import { Container, Card, CardBody, Field, Select, Input, Button } from "@/components/ui";
import { ThemeCard } from "@/components/public/ThemeCard";
import { db } from "@/lib/db";
import { toPublicTheme } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { scopeLabel, houseLabel, BR_STATES } from "@/lib/labels";
import { themeTemperature } from "@/lib/domain/theme";
import type { Scope, House, Prisma, VoteValue } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const SCOPES = Object.keys(scopeLabel) as Scope[];
const HOUSES = Object.keys(houseLabel) as House[];

/** Available orderings, with the SQL that implements each. */
const ORDERINGS = {
  priority: {
    label: "Prioridade na pauta",
    orderBy: [{ priority: "desc" }, { lastActionAt: "desc" }] as Prisma.ThemeOrderByWithRelationInput[],
  },
  recent: {
    label: "Movimentação mais recente",
    orderBy: [{ lastActionAt: "desc" }, { priority: "desc" }] as Prisma.ThemeOrderByWithRelationInput[],
  },
  engagement: {
    label: "Mais votados no Votto",
    orderBy: [{ yesCount: "desc" }, { noCount: "desc" }] as Prisma.ThemeOrderByWithRelationInput[],
  },
} as const;

type Ordering = keyof typeof ORDERINGS;

export default async function ThemesPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    state?: string;
    house?: string;
    q?: string;
    order?: string;
    open?: string;
  }>;
}) {
  const { scope, state, house, q, order, open } = await searchParams;
  const session = await getCitizenSession();
  const isAuthenticated = Boolean(session);

  const ordering: Ordering = order && order in ORDERINGS ? (order as Ordering) : "priority";
  const onlyOpen = open !== "0";

  const where: Prisma.ThemeWhereInput = { status: "ACTIVE" };
  if (scope && SCOPES.includes(scope as Scope)) where.scope = scope as Scope;
  if (state) where.state = state;
  if (house && HOUSES.includes(house as House)) where.house = house as House;
  if (onlyOpen) where.inProgress = true;
  if (q) {
    // Match the popular name, the official identifier ("PL 3085/2026") and the
    // one-line summary, so a citizen can search either way.
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { identifier: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ];
  }

  const themesRaw = await db.theme.findMany({
    where,
    orderBy: ORDERINGS[ordering].orderBy,
    take: 60,
    include: {
      proposer: { include: { party: true } },
      rapporteur: { include: { party: true } },
    },
  });

  const themes = themesRaw.map(toPublicTheme);
  // Engagement ordering is refined in memory: the temperature curve is
  // logarithmic, so raw tallies alone don't reproduce it.
  if (ordering === "engagement") {
    themes.sort((a, b) => themeTemperature(b) - themeTemperature(a));
  }

  let currentVotes = new Map<string, VoteValue>();
  if (session) {
    const themeKids = themes.map((t) => t.kid);
    const votes = await db.vote.findMany({
      where: { cpfHash: session.cpfHash, voterType: "USER", theme: { kid: { in: themeKids } } },
      select: { value: true, theme: { select: { kid: true } } },
    });
    currentVotes = new Map(votes.map((v) => [v.theme.kid, v.value]));
  }

  return (
    <Container className="py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-navy-900">Temas</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Vote nos temas em pauta. Cada voto ajuda a medir o alinhamento com seus
          representantes.
        </p>
      </header>

      {/* Filters */}
      <Card className="mb-8">
        <CardBody>
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Buscar">
              <Input name="q" defaultValue={q ?? ""} placeholder="Nome, ementa ou PL 3085/2026" />
            </Field>
            <Field label="Ordenar por">
              <Select name="order" defaultValue={ordering}>
                {(Object.keys(ORDERINGS) as Ordering[]).map((key) => (
                  <option key={key} value={key}>
                    {ORDERINGS[key].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Casa legislativa">
              <Select name="house" defaultValue={house ?? ""}>
                <option value="">Todas</option>
                {HOUSES.map((h) => (
                  <option key={h} value={h}>
                    {houseLabel[h]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Abrangência">
              <Select name="scope" defaultValue={scope ?? ""}>
                <option value="">Todas</option>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {scopeLabel[s]}
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
            <Field label="Situação">
              <Select name="open" defaultValue={onlyOpen ? "1" : "0"}>
                <option value="1">Somente em tramitação</option>
                <option value="0">Incluir encerrados</option>
              </Select>
            </Field>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <Button type="submit" variant="outline" className="w-full sm:w-auto">
                Filtrar
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {themes.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-muted)]">
              Nenhum tema encontrado para os filtros selecionados.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => (
            <ThemeCard
              key={theme.kid}
              theme={theme}
              isAuthenticated={isAuthenticated}
              currentVote={currentVotes.get(theme.kid) ?? null}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
