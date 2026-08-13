/**
 * Agent detail page: the record of one public agent, set as a document.
 *
 * It opens on a masthead in the same model as the index pages — portrait, name in
 * the display serif, party mark and mandate — carrying the two alignment readings
 * as its figure. That percentage is what the page exists to answer, and filed in
 * a sidebar card below the fold it read as a footnote to the biography.
 *
 * Under it, the two things an agent actually does: the bills they sign as author
 * or rapporteur — the strongest available signal of what a parliamentarian works
 * on, and the one thing a vote record cannot show — and their recent votes, with
 * the positioning chart kept as a margin column.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Badge } from "@/components/ui";
import { RecordIntro, SectionHead } from "@/components/public/Section";
import { ReadingPlate } from "@/components/public/ReadingPlate";
import { IndexPlate } from "@/components/public/IndexPlate";
import { ThemeBriefList, type ThemeBriefItem } from "@/components/public/ThemeBrief";
import { PositioningChart } from "@/components/public/PositioningChart";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { ShareButton } from "@/components/public/ShareButton";
import { Reveal } from "@/components/public/motion";
import { db } from "@/lib/db";
import { toPublicAgent } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { getAgentPosition } from "@/lib/domain/positions";
import { citizenAgentAlignment, agentElectorateAlignments } from "@/lib/indexes/alignment";
import { agentTypeLabel, voteValueLabel } from "@/lib/labels";
import { POSITIONING_AXES } from "@/lib/indexes/positioning";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** How many authored/rapporteured bills the profile prints. */
const AUTHORED_LIMIT = 8;

/** The roll-call record, in the vote pigments — abstention always neutral stone. */
const VOTE_ROWS = [
  { value: "YES" as const, color: "var(--color-vote-yes)" },
  { value: "NO" as const, color: "var(--color-vote-no)" },
  { value: "ABSTENTION" as const, color: "var(--color-vote-abstention)" },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kid: string }>;
}): Promise<Metadata> {
  const { kid } = await params;
  const agent = await db.publicAgent.findUnique({
    where: { kid },
    select: { firstName: true, lastName: true, type: true, status: true },
  });
  if (!agent || agent.status !== "ACTIVE") return {};
  const name = `${agent.firstName} ${agent.lastName}`.trim();
  const description = `Veja o alinhamento com eleitores e o posicionamento de ${name} (${agentTypeLabel[agent.type]}) no Votto.`;
  const ogImage = `${env.appUrl}/api/og/agente/${kid}`;
  return {
    title: name,
    description,
    openGraph: { title: `${name} · Votto`, description, images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `${name} · Votto`, description, images: [ogImage] },
  };
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  const { kid } = await params;
  const session = await getCitizenSession();

  const agent = await db.publicAgent.findUnique({
    where: { kid },
    include: { party: true },
  });
  if (!agent || agent.status !== "ACTIVE") notFound();

  const position = await getAgentPosition(agent.id);
  const engagement = (await agentElectorateAlignments()).get(agent.kid)?.alignment ?? null;

  // The bills this agent signs. Ordered by legislative priority rather than by
  // date: what a profile is asked is "what of theirs is about to be voted", and
  // a purely chronological list buries that under archived proposals.
  const authoredWhere = {
    status: "ACTIVE" as const,
    OR: [{ proposerId: agent.id }, { rapporteurId: agent.id }],
  };

  const [recentVotes, authoredRaw, authoredTotal, voteTally] = await Promise.all([
    db.vote.findMany({
      where: { agentId: agent.id, voterType: "AGENT" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { value: true, theme: { select: { kid: true, name: true, plainTitle: true } } },
    }),
    db.theme.findMany({
      where: authoredWhere,
      orderBy: [{ priority: "desc" }, { lastActionAt: "desc" }],
      take: AUTHORED_LIMIT,
      select: {
        kid: true,
        name: true,
        plainTitle: true,
        identifier: true,
        house: true,
        priority: true,
        situation: true,
        urgency: true,
        proposerId: true,
      },
    }),
    db.theme.count({ where: authoredWhere }),
    db.vote.groupBy({
      by: ["value"],
      where: { agentId: agent.id, voterType: "AGENT" },
      _count: { _all: true },
    }),
  ]);

  const votesByValue = new Map(voteTally.map((row) => [row.value, row._count._all]));
  const totalAgentVotes = voteTally.reduce((sum, row) => sum + row._count._all, 0);

  const authored: ThemeBriefItem[] = authoredRaw.map((theme) => ({
    kid: theme.kid,
    title: theme.plainTitle ?? theme.name,
    identifier: theme.identifier,
    house: theme.house,
    priority: theme.priority,
    situation: theme.situation,
    urgency: theme.urgency,
    // A bill can carry both roles; authorship is the stronger claim, so it wins.
    role: theme.proposerId === agent.id ? "Autor" : "Relator",
  }));

  let alignment: number | null = null;
  let sharedThemes = 0;
  if (session) {
    const user = await db.user.findUnique({
      where: { kid: session.userKid },
      select: { id: true, voteVersion: true },
    });
    if (user) {
      const result = await citizenAgentAlignment(user.id, user.voteVersion, agent.kid);
      alignment = result?.alignment ?? null;
      sharedThemes = result?.sharedThemes ?? 0;
    }
  }

  // The masthead figure is the alignment when there is one to print. Until
  // citizens have voted there is none for anybody, and a masthead whose figure is
  // two apologies is weaker than the plain heading it replaced — so the roll-call
  // record, which exists from the first import, stands in for it.
  const hasReading = engagement !== null || alignment !== null;

  const dto = toPublicAgent(agent);
  const fullName = `${dto.firstName} ${dto.lastName}`.trim();
  const location = [dto.municipality, dto.state].filter(Boolean).join(" · ");
  const initials = `${dto.firstName[0] ?? ""}${dto.lastName[0] ?? ""}`.toUpperCase();

  return (
    <>
      <RecordIntro
        back={
          <>
            <Link href="/agentes" className="text-sm text-navy-600 hover:text-navy-800">
              ← Voltar para agentes
            </Link>
            <ShareButton kind="agente" kid={dto.kid} title={fullName} variant="button" />
          </>
        }
        portrait={
          // A photo is the one thing in the system that is round (design.md §7),
          // set on a hairline so it sits on the paper rather than floating.
          <ImageWithFallback
            src={dto.imageUrl}
            alt={fullName}
            className="h-32 w-32 rounded-full border border-line bg-navy-50 object-cover sm:h-36 sm:w-36"
            fallback={
              <div className="flex h-32 w-32 items-center justify-center rounded-full border border-line bg-navy-100 font-display text-3xl text-navy-700 sm:h-36 sm:w-36">
                {initials}
              </div>
            }
          />
        }
        eyebrow={
          <>
            {agentTypeLabel[dto.type]}
            {location ? ` · ${location}` : ""}
            {dto.inOffice ? "" : " · Mandato encerrado"}
          </>
        }
        title={fullName}
        figure={
          hasReading ? (
            <ReadingPlate
              caption="Alinhamento"
              readings={[
                {
                  label: "Com os eleitores",
                  value: engagement,
                  hint:
                    engagement === null
                      ? "Ainda não há votos de cidadãos suficientes para calcular."
                      : "O quanto os votos deste agente acompanham o conjunto dos cidadãos.",
                },
                {
                  label: "Com você",
                  // Logged out there is nothing to compute against, and the
                  // reading says so with the way in rather than disappearing.
                  value: session ? alignment : null,
                  hint: !session ? (
                    <>
                      <Link href="/login" className="font-medium text-navy-700 hover:text-navy-900">
                        Entre
                      </Link>{" "}
                      para ver o seu alinhamento pessoal.
                    </>
                  ) : alignment === null ? (
                    "Vocês ainda não votaram nos mesmos temas. Vote mais para calcular."
                  ) : (
                    `Baseado em ${sharedThemes} ${sharedThemes === 1 ? "tema em comum" : "temas em comum"}.`
                  ),
                },
              ]}
            />
          ) : totalAgentVotes > 0 ? (
            <div>
              <IndexPlate
                caption="Registro de votos"
                note={`${totalAgentVotes.toLocaleString("pt-BR")} ${totalAgentVotes === 1 ? "votação" : "votações"}`}
                rows={VOTE_ROWS.map((row) => ({
                  label: voteValueLabel[row.value],
                  value: votesByValue.get(row.value) ?? 0,
                  color: row.color,
                }))}
              />
              <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
                {session ? (
                  "Vote nos temas em pauta para calcular o seu alinhamento com este agente."
                ) : (
                  <>
                    <Link href="/login" className="font-medium text-navy-700 hover:text-navy-900">
                      Entre
                    </Link>{" "}
                    e vote nos temas para ver o seu alinhamento com este agente.
                  </>
                )}
              </p>
            </div>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {dto.party ? (
            // The curated mark carries the acronym itself, so the party is
            // printed as a mark; the acronym only stands in for a party that has
            // no curated mark yet. Height only: the marks are built tight in
            // width on a shared canvas height (scripts/build-party-logos.mjs),
            // so a fixed width would pad the element past the mark.
            <ImageWithFallback
              src={dto.party.logoUrl}
              alt={dto.party.acronym ?? dto.party.name}
              className="h-12 w-auto max-w-36 shrink-0 object-contain mix-blend-multiply"
              fallback={
                <span className="text-sm font-medium uppercase tracking-[0.08em] text-navy-700">
                  {dto.party.acronym ?? dto.party.name}
                </span>
              }
            />
          ) : (
            <Badge tone="gray">Sem partido</Badge>
          )}
        </div>

        {dto.description ? (
          <p className="mt-5 max-w-xl text-base leading-relaxed text-navy-700">
            {dto.description}
          </p>
        ) : null}

        {dto.externalUrl ? (
          <p className="mt-5">
            <a
              href={dto.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="border-b border-navy-300 pb-0.5 text-sm text-navy-700 transition-colors hover:border-accent-500 hover:text-accent-600"
            >
              Ficha oficial ↗
            </a>
          </p>
        ) : null}
      </RecordIntro>

      <Container className="py-12">
        <div className="grid gap-14 lg:grid-cols-[1fr_19rem] lg:gap-16">
          {/* ── The record: what the agent proposed, then how they voted ── */}
          <div className="min-w-0">
            <section>
              <SectionHead
                title="Temas de autoria e relatoria"
                lead={
                  authoredTotal > 0
                    ? `${authoredTotal} ${authoredTotal === 1 ? "proposição" : "proposições"} que este agente assina como autor ou relator${
                        authoredTotal > AUTHORED_LIMIT
                          ? `; abaixo, as ${AUTHORED_LIMIT} de maior prioridade na pauta`
                          : ""
                      }.`
                    : undefined
                }
              />
              <div className="mt-6">
                {authored.length === 0 ? (
                  <p className="border-t border-line py-8 text-sm text-[var(--color-muted)]">
                    Nenhuma proposição deste agente foi importada até agora.
                  </p>
                ) : (
                  <ThemeBriefList items={authored} />
                )}
              </div>
            </section>

            <section className="mt-14">
              <SectionHead
                title="Votos recentes"
                lead="Como este agente votou nas últimas votações nominais registradas."
              />
              <div className="mt-6">
                {recentVotes.length === 0 ? (
                  <p className="border-t border-line py-8 text-sm text-[var(--color-muted)]">
                    Este agente ainda não tem votos registrados.
                  </p>
                ) : (
                  <Reveal
                    as="ul"
                    variant="fade"
                    stagger
                    step={70}
                    className="divide-y divide-[var(--color-line)] border-y border-line"
                  >
                    {recentVotes.map((v) => (
                      <li
                        key={v.theme.kid}
                        className="flex items-center justify-between gap-4 py-3.5"
                      >
                        <Link
                          href={`/temas/${v.theme.kid}`}
                          className="text-sm leading-snug text-navy-700 hover:text-navy-900 hover:underline"
                        >
                          {v.theme.plainTitle ?? v.theme.name}
                        </Link>
                        <Badge
                          tone={
                            v.value === "YES" ? "positive" : v.value === "NO" ? "negative" : "gray"
                          }
                          className="shrink-0"
                        >
                          {voteValueLabel[v.value]}
                        </Badge>
                      </li>
                    ))}
                  </Reveal>
                )}
              </div>
            </section>
          </div>

          {/* ── Margin column: where those votes place the agent ────────── */}
          {/* Positioning: the figure and its legend, on the paper itself — no
              card, no rule, no tint. The left↔right BAND that used to head this
              block is gone with the spectrum bar: it reads as a verdict, and the
              maths behind it is only as good as the themes' axis tags, which are
              not filled in yet (CLAUDE.md §11) — it was calling PL centrist. The
              two-axis figure stays because it shows a shape, not a sentence. */}
          <Reveal as="aside" variant="fade" delay={120}>
            <h2 className="text-xl text-navy-900">Posicionamento</h2>
            <div className="mt-4">
              <PositioningChart
                economic={position.economic}
                social={position.social}
                basis={position.basis}
              />
            </div>
            {position.basis > 0 ? (
              <dl className="mt-3 space-y-1 text-xs text-[var(--color-muted)]">
                <div className="flex justify-between">
                  <dt>
                    {POSITIONING_AXES.economic.negative} ↔ {POSITIONING_AXES.economic.positive}
                  </dt>
                  <dd className="font-medium text-navy-800">{position.economic}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>
                    {POSITIONING_AXES.social.negative} ↔ {POSITIONING_AXES.social.positive}
                  </dt>
                  <dd className="font-medium text-navy-800">{position.social}</dd>
                </div>
              </dl>
            ) : null}
          </Reveal>
        </div>
      </Container>
    </>
  );
}
