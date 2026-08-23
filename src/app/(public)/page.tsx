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
  agentBaseAlignments,
  partyBaseAlignments,
} from "@/lib/indexes/alignment";
import { partyQualityScores } from "@/lib/domain/quality";
import { publicReading } from "@/lib/domain/reading";
import type { Prisma, VoteValue } from "@/generated/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCitizenSession();
  const isAuthenticated = Boolean(session);

  const [themeCount, agentCount, partyCount, voteCount, hotThemesRaw] = await Promise.all([
    // O acervo inteiro, tramitando ou encerrado. `/temas` mostra só o que ainda
    // pode ser votado por padrão, então o número dela é menor — e é a placa
    // daquela página que declara a diferença e oferece o histórico, em vez de os
    // dois números se contradizerem em silêncio.
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

  // The published reading (base first, electorate as fallback) + the personal
  // alignment when somebody is logged in.
  const [agentEngage, partyEngage, agentBase, partyBase, partyQuality] = await Promise.all([
    agentElectorateAlignments(),
    partyElectorateAlignments(),
    agentBaseAlignments(),
    partyBaseAlignments(),
    partyQualityScores(),
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

  // Ranking score: personal alignment when logged in, else the published
  // reading — the agent's own base where they have one, the electorate where
  // they do not (`publicReading`).
  // Every row carries all three readings. Which of them become columns, and
  // which one ranks the table, is the table's decision — a visitor who is not
  // logged in has no personal alignment, and until citizens have voted there is
  // no base reading either, so a ranking that printed only "Alinhamento" was
  // printing a column of dashes.
  const toAgentRow = (a: AgentWithParty): RankingRow => ({
    kid: a.kid,
    name: `${a.firstName} ${a.lastName}`.trim(),
    subtitle: [a.party?.acronym ?? a.party?.name, a.state].filter(Boolean).join(" · ") || "—",
    imageUrl: a.imageUrl,
    href: `/agentes/${a.kid}`,
    quality: a.qualityScore,
    base: publicReading(agentBase.get(a.kid), agentEngage.get(a.kid)?.alignment ?? null).value,
    personal: isAuthenticated ? agentAlign?.get(a.kid)?.alignment ?? null : null,
  });

  // Ranked here only to decide WHICH ten make the cut; the table re-sorts by
  // whichever reading the citizen picks. Performance is the cut-off because it
  // is the one that exists logged out.
  //
  // **Só performance, nunca caindo para o alinhamento.** A versão anterior era
  // `y.quality ?? y.base ?? -1`, que troca de grandeza no meio da comparação:
  // performance política e alinhamento são os dois 0–100, então o `??` não
  // reclama, e um agente sem performance medida com 95% de alinhamento passa na
  // frente de um com 80 de performance. O defeito ficou invisível enquanto
  // ninguém tinha votado — sem cidadãos, `base` é null para todos e a expressão
  // se reduz a `quality ?? -1`. Bastou o primeiro voto para os 44 agentes sem
  // performance medida saltarem ao topo de um ranking de performance.
  //
  // Sem medida vai para o fim, que é o que "não medido" significa numa lista
  // ordenada por essa medida.
  const topBy = (rows: RankingRow[], n: number) =>
    [...rows]
      .sort((x, y) => (y.quality ?? -1) - (x.quality ?? -1) || x.name.localeCompare(y.name))
      .slice(0, n);

  const topDeputies = topBy(deputies.map(toAgentRow), 10);
  const topSenators = topBy(senators.map(toAgentRow), 10);
  const topParties = topBy(
    allParties.map((p) => ({
      kid: p.kid,
      name: p.name,
      subtitle: p.acronym ?? "",
      imageUrl: p.logoUrl,
      href: `/partidos/${p.kid}`,
      quality: partyQuality.get(p.kid) ?? null,
      base: publicReading(partyBase.get(p.kid), partyEngage.get(p.kid)?.alignment ?? null).value,
      personal: isAuthenticated ? partyAlign?.get(p.kid)?.alignment ?? null : null,
    })),
    // Ten, like the two benches above it: the tabs are read side by side and a
    // shorter table reads as "there are fewer parties", which is not the point
    // the cut is making.
    10,
  );

  return (
    <>
      {/* Hero (impactful, with embedded steps) */}
      <HeroB />

      <Container className="py-12">
        {/* Stats — passed as raw numbers so the strip can tally them up. */}
        <StatStrip
          items={[
            { label: "Temas no acervo", value: themeCount },
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
            title="Ranking"
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
              isAuthenticated={isAuthenticated}
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
