/**
 * Themes list: active themes with temperature/tallies, scope badge and a
 * quick-vote control. Supports filtering by scope/state and search by name.
 */
import { Container, Card, CardBody, Field, Select, Input, Button } from "@/components/ui";
import { ThemeCard } from "@/components/public/ThemeCard";
import { db } from "@/lib/db";
import { toPublicTheme } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { scopeLabel, BR_STATES } from "@/lib/labels";
import { themeTemperature } from "@/lib/domain/theme";
import type { Scope, Prisma, VoteValue } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const SCOPES = Object.keys(scopeLabel) as Scope[];

export default async function ThemesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; state?: string; q?: string }>;
}) {
  const { scope, state, q } = await searchParams;
  const session = await getCitizenSession();
  const isAuthenticated = Boolean(session);

  const where: Prisma.ThemeWhereInput = { status: "ACTIVE" };
  if (scope && SCOPES.includes(scope as Scope)) where.scope = scope as Scope;
  if (state) where.state = state;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const themesRaw = await db.theme.findMany({
    where,
    orderBy: [{ yesCount: "desc" }, { noCount: "desc" }],
    take: 60,
  });

  // Sort by temperature (engagement) desc.
  const themes = themesRaw
    .map(toPublicTheme)
    .sort((a, b) => themeTemperature(b) - themeTemperature(a));

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
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Buscar">
              <Input name="q" defaultValue={q ?? ""} placeholder="Nome do tema" />
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
            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full">
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
