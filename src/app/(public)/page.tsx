/**
 * Public home page: pitch for Votto, headline platform statistics and a
 * "Temas quentes" section with quick voting.
 */
import { Container, Card, CardBody, ButtonLink, Badge } from "@/components/ui";
import { StatStrip } from "@/components/public/StatStrip";
import { ThemeCard } from "@/components/public/ThemeCard";
import { db } from "@/lib/db";
import { toPublicTheme } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import type { VoteValue } from "@/generated/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCitizenSession();
  const isAuthenticated = Boolean(session);

  const [themeCount, agentCount, partyCount, voteCount, hotThemesRaw] = await Promise.all([
    db.theme.count({ where: { status: "ACTIVE" } }),
    db.publicAgent.count({ where: { status: "ACTIVE" } }),
    db.party.count({ where: { status: "ACTIVE" } }),
    db.vote.count({ where: { voterType: "USER" } }),
    db.theme.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ yesCount: "desc" }, { noCount: "desc" }, { absCount: "desc" }],
      take: 30,
    }),
  ]);

  // Order by total engagement (votes) desc and keep the top 6.
  const hotThemes = hotThemesRaw
    .map(toPublicTheme)
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .slice(0, 6);

  // Citizen's existing votes on the displayed themes (to highlight current choice).
  let currentVotes = new Map<string, VoteValue>();
  if (session) {
    const themeKids = hotThemes.map((t) => t.kid);
    const votes = await db.vote.findMany({
      where: { cpfHash: session.cpfHash, voterType: "USER", theme: { kid: { in: themeKids } } },
      select: { value: true, theme: { select: { kid: true } } },
    });
    currentVotes = new Map(votes.map((v) => [v.theme.kid, v.value]));
  }

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-colonial-500/30 blur-3xl" />
        </div>
        <Container className="relative py-20 sm:py-28">
          <div className="max-w-3xl">
            <Badge tone="accent">Democracia direta</Badge>
            <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.03] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Sua voz no <span className="text-accent-500">centro</span> da democracia.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-navy-200 sm:text-xl">
              O Votto é um complemento à democracia representativa: os cidadãos votam
              diretamente nos temas que importam, e a plataforma mede o quanto cada
              agente público e partido está alinhado com você.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/temas" size="lg">
                Votar nos temas
              </ButtonLink>
              <ButtonLink
                href="/agentes"
                size="lg"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:border-white hover:bg-white/10"
              >
                Ver agentes
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-12">
        {/* Stats */}
        <StatStrip
          items={[
            { label: "Temas", value: themeCount.toLocaleString("pt-BR") },
            { label: "Agentes públicos", value: agentCount.toLocaleString("pt-BR") },
            { label: "Partidos", value: partyCount.toLocaleString("pt-BR") },
            { label: "Votos de cidadãos", value: voteCount.toLocaleString("pt-BR") },
          ]}
        />

        {/* How it works */}
        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            {
              n: "1",
              title: "Vote nos temas",
              body: "Manifeste-se em projetos de lei e pautas reais com um Sim, Não ou Abstenção.",
            },
            {
              n: "2",
              title: "Medimos o alinhamento",
              body: "Comparamos seus votos com os dos agentes públicos e partidos.",
            },
            {
              n: "3",
              title: "Decida melhor",
              body: "Descubra quem realmente representa as suas posições.",
            },
          ].map((step) => (
            <Card key={step.n}>
              <CardBody>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-500 font-display text-lg font-extrabold text-navy-900">
                  {step.n}
                </span>
                <h3 className="mt-4 text-lg font-bold text-navy-900">{step.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--color-muted)]">{step.body}</p>
              </CardBody>
            </Card>
          ))}
        </section>

        {/* Hot themes */}
        <section className="mt-14">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-navy-900">Temas quentes</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Os temas com maior engajamento dos cidadãos agora.
              </p>
            </div>
            <ButtonLink href="/temas" variant="ghost" size="sm">
              Ver todos
            </ButtonLink>
          </div>

          {hotThemes.length === 0 ? (
            <Card className="mt-6">
              <CardBody>
                <p className="text-sm text-[var(--color-muted)]">
                  Ainda não há temas disponíveis. Volte em breve.
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {hotThemes.map((theme) => (
                <ThemeCard
                  key={theme.kid}
                  theme={theme}
                  isAuthenticated={isAuthenticated}
                  currentVote={currentVotes.get(theme.kid) ?? null}
                />
              ))}
            </div>
          )}
        </section>
      </Container>
    </>
  );
}
