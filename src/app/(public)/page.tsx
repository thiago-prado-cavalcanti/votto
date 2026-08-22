/**
 * Public home page: pitch for Votto, headline platform statistics and a
 * "Temas quentes" section with quick voting.
 */
import { Container, ButtonLink } from "@/components/ui";
import { StatStrip } from "@/components/public/StatStrip";
import { SectionHead } from "@/components/public/Section";
import { ThemeRow, ThemeList } from "@/components/public/ThemeRow";
import { RankingTabs, type RankingRow } from "@/components/public/RankingTabs";
import { HeroB } from "@/components/public/HeroB";
import { db } from "@/lib/db";
import { THEME_AUTHOR_INCLUDE, toPublicTheme } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import {
  citizenAgentAlignments,
  citizenPartyAlignments,
  agentElectorateAlignments,
  partyElectorateAlignments,
} from "@/lib/indexes/alignment";
import type { Prisma, VoteValue } from "@/generated/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCitizenSession();
  const isAuthenticated = Boolean(session);

  const [themeCount, agentCount, partyCount, voteCount, hotThemesRaw] = await Promise.all([
    db.theme.count({ where: { status: "ACTIVE" } }),
    db.publicAgent.count({ where: { status: "ACTIVE", inOffice: true } }),
    db.party.count({ where: { status: "ACTIVE" } }),
    db.vote.count({ where: { voterType: "USER" } }),
    db.theme.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ yesCount: "desc" }, { noCount: "desc" }, { absCount: "desc" }],
      take: 30,
      // Same rows as /temas: without this the entry falls back to the bare
      // `proposerName` column — a name with no face, no party and no link —
      // and a theme carried only by a rapporteur shows no one.
      include: THEME_AUTHOR_INCLUDE,
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

  // ─── Alignment ranking (top deputies / senators / parties) ──────────────────
  type AgentWithParty = Prisma.PublicAgentGetPayload<{ include: { party: true } }>;
  const [deputies, senators, allParties] = await Promise.all([
    db.publicAgent.findMany({ where: { status: "ACTIVE", inOffice: true, type: "FEDERAL_DEPUTY" }, include: { party: true } }),
    db.publicAgent.findMany({ where: { status: "ACTIVE", inOffice: true, type: "SENATOR" }, include: { party: true } }),
    db.party.findMany({ where: { status: "ACTIVE" } }),
  ]);

  // Global alignment with the electorate (always) + personal alignment (logged in).
  const [agentEngage, partyEngage] = await Promise.all([
    agentElectorateAlignments(),
    partyElectorateAlignments(),
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

  // Ranking score: personal alignment when logged in, else global alignment.
  const toAgentRow = (a: AgentWithParty): RankingRow => ({
    kid: a.kid,
    name: `${a.firstName} ${a.lastName}`.trim(),
    subtitle: [a.party?.acronym ?? a.party?.name, a.state].filter(Boolean).join(" · ") || "—",
    imageUrl: a.imageUrl,
    alignment: isAuthenticated
      ? agentAlign?.get(a.kid)?.alignment ?? null
      : agentEngage.get(a.kid)?.alignment ?? null,
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
      alignment: isAuthenticated
        ? partyAlign?.get(p.kid)?.alignment ?? null
        : partyEngage.get(p.kid)?.alignment ?? null,
      href: `/partidos/${p.kid}`,
    }))
    .sort(byAlignment)
    .slice(0, 5);

  return (
    <>
      {/* Hero (impactful, with embedded steps) */}
      <HeroB />

      <Container className="py-12">
        {/* Stats — passed as raw numbers so the strip can tally them up. */}
        <StatStrip
          items={[
            { label: "Temas", value: themeCount },
            { label: "Agentes públicos", value: agentCount },
            { label: "Partidos", value: partyCount },
            { label: "Votos de cidadãos", value: voteCount },
          ]}
        />

        {/* Alignment ranking. Each block below reveals itself — `SectionHead`,
            the ranking rows and each theme row own their own arrival, so nothing
            here wraps them in a second one. */}
        <section className="mt-16">
          <SectionHead
            title="Ranking de alinhamento"
            lead={
              isAuthenticated
                ? "Quem mais vota como você — do maior para o menor alinhamento pessoal."
                : "Alinhamento dos representantes com o eleitorado. Entre para ver seu alinhamento pessoal."
            }
            action={
              !isAuthenticated ? (
                <ButtonLink href="/login" size="sm">
                  Entrar para ver meu alinhamento
                </ButtonLink>
              ) : null
            }
          />

          <div className="mt-6">
            <RankingTabs
              tabs={[
                {
                  key: "deputados",
                  label: "Deputados federais",
                  rows: topDeputies,
                  hrefAll: "/agentes?type=FEDERAL_DEPUTY",
                },
                {
                  key: "senadores",
                  label: "Senadores",
                  rows: topSenators,
                  hrefAll: "/agentes?type=SENATOR",
                },
                {
                  key: "partidos",
                  label: "Partidos",
                  rows: topParties,
                  hrefAll: "/partidos",
                  avatarShape: "logo",
                },
              ]}
            />
          </div>
        </section>

        {/* Hot themes */}
        <section className="mt-16">
          <SectionHead
            title="Temas quentes"
            lead="Os temas com maior participação dos cidadãos agora."
            action={
              <ButtonLink href="/temas" variant="ghost" size="sm">
                Ver todos →
              </ButtonLink>
            }
          />

          {hotThemes.length === 0 ? (
            <p className="mt-6 border-t border-line py-8 text-sm text-[var(--color-muted)]">
              Ainda não há temas disponíveis. Volte em breve.
            </p>
          ) : (
            <div className="mt-6">
              <ThemeList>
                {hotThemes.map((theme, i) => (
                  <ThemeRow
                    key={theme.kid}
                    theme={theme}
                    isAuthenticated={isAuthenticated}
                    currentVote={currentVotes.get(theme.kid) ?? null}
                    delay={Math.min(i, 3) * 80}
                  />
                ))}
              </ThemeList>
            </div>
          )}
        </section>
      </Container>
    </>
  );
}
