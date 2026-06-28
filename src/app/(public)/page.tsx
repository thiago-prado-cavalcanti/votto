/**
 * Public home page: pitch for Votto, headline platform statistics and a
 * "Temas quentes" section with quick voting.
 */
import Link from "next/link";
import { Container, Card, CardBody, ButtonLink, Badge } from "@/components/ui";
import { StatStrip } from "@/components/public/StatStrip";
import { ThemeCard } from "@/components/public/ThemeCard";
import { RankingList, type RankingRow } from "@/components/public/RankingList";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { db } from "@/lib/db";
import { toPublicTheme } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { citizenAgentAlignments, citizenPartyAlignments } from "@/lib/indexes/alignment";
import type { Prisma, VoteValue } from "@/generated/prisma";

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

  // ─── Alignment ranking (top deputies / senators / parties / president) ──────
  type AgentWithParty = Prisma.PublicAgentGetPayload<{ include: { party: true } }>;
  const [deputies, senators, president, allParties] = await Promise.all([
    db.publicAgent.findMany({ where: { status: "ACTIVE", type: "FEDERAL_DEPUTY" }, include: { party: true } }),
    db.publicAgent.findMany({ where: { status: "ACTIVE", type: "SENATOR" }, include: { party: true } }),
    db.publicAgent.findFirst({ where: { status: "ACTIVE", type: "PRESIDENT" }, include: { party: true } }),
    db.party.findMany({ where: { status: "ACTIVE" } }),
  ]);

  let agentAlign: Map<string, { alignment: number | null; sharedThemes: number }> | null = null;
  let partyAlign: Map<string, { alignment: number | null; agents: number }> | null = null;
  if (session) {
    const user = await db.user.findUnique({
      where: { kid: session.userKid },
      select: { id: true, voteVersion: true },
    });
    if (user) {
      [agentAlign, partyAlign] = await Promise.all([
        citizenAgentAlignments(user.id, user.voteVersion),
        citizenPartyAlignments(user.id, user.voteVersion),
      ]);
    }
  }

  const toAgentRow = (a: AgentWithParty): RankingRow => ({
    kid: a.kid,
    name: `${a.firstName} ${a.lastName}`.trim(),
    subtitle: [a.party?.acronym ?? a.party?.name, a.state].filter(Boolean).join(" · ") || "—",
    imageUrl: a.imageUrl,
    alignment: agentAlign?.get(a.kid)?.alignment ?? null,
    href: `/agentes/${a.kid}`,
  });
  const byAlignment = (a: RankingRow, b: RankingRow) =>
    (b.alignment ?? -1) - (a.alignment ?? -1) || a.name.localeCompare(b.name);

  const topDeputies = deputies.map(toAgentRow).sort(byAlignment).slice(0, 10);
  const topSenators = senators.map(toAgentRow).sort(byAlignment).slice(0, 10);
  const topParties: RankingRow[] = allParties
    .map((p) => ({
      kid: p.kid,
      name: p.name,
      subtitle: p.acronym ?? "",
      imageUrl: p.logoUrl,
      alignment: partyAlign?.get(p.kid)?.alignment ?? null,
      href: `/partidos/${p.kid}`,
    }))
    .sort(byAlignment)
    .slice(0, 5);
  const presidentRow = president ? toAgentRow(president) : null;

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

        {/* Alignment ranking */}
        <section className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-navy-900">
                Ranking de alinhamento
              </h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {isAuthenticated
                  ? "Quem mais vota como você — do maior para o menor alinhamento."
                  : "Entre para ver, em ordem, quem mais vota como você."}
              </p>
            </div>
            {!isAuthenticated ? (
              <ButtonLink href="/login" size="sm">
                Entrar para ver meu ranking
              </ButtonLink>
            ) : null}
          </div>

          {/* President highlight */}
          {presidentRow ? (
            <Card className="mt-6 overflow-hidden">
              <CardBody className="flex items-center gap-4 bg-navy-900 text-white sm:gap-5">
                <ImageWithFallback
                  src={presidentRow.imageUrl}
                  alt={presidentRow.name}
                  className="h-16 w-16 rounded-2xl object-cover"
                  fallback={
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-lg font-extrabold text-white">
                      {presidentRow.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                    </div>
                  }
                />
                <div className="min-w-0 flex-1">
                  <Badge tone="accent">Presidente</Badge>
                  <Link href={presidentRow.href} className="mt-1.5 block">
                    <p className="truncate font-display text-xl font-extrabold">{presidentRow.name}</p>
                  </Link>
                  <p className="truncate text-sm text-navy-300">{presidentRow.subtitle}</p>
                </div>
                <div className="text-right">
                  {isAuthenticated && presidentRow.alignment !== null ? (
                    <>
                      <div className="font-display text-3xl font-extrabold text-accent-500">
                        {presidentRow.alignment}%
                      </div>
                      <div className="text-xs text-navy-300">alinhamento</div>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-navy-300">Entre para ver</span>
                  )}
                </div>
              </CardBody>
            </Card>
          ) : null}

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <RankingList
              title="Top 10 deputados federais"
              rows={topDeputies}
              hrefAll="/agentes?type=FEDERAL_DEPUTY"
              loggedIn={isAuthenticated}
            />
            <RankingList
              title="Top 10 senadores"
              rows={topSenators}
              hrefAll="/agentes?type=SENATOR"
              loggedIn={isAuthenticated}
            />
          </div>

          <div className="mt-5">
            <RankingList
              title="Top 5 partidos"
              rows={topParties}
              hrefAll="/partidos"
              loggedIn={isAuthenticated}
              avatarShape="square"
            />
          </div>
        </section>

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
