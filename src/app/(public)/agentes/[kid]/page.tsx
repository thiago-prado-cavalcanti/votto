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
import { ThemeBriefList, type ThemeBriefItem } from "@/components/public/ThemeBrief";
import { AreaAgreementPlate } from "@/components/public/AreaAgreementPlate";
import { AreaAuthorshipPlate } from "@/components/public/AreaAuthorshipPlate";
import { PositioningPlate } from "@/components/public/PositioningPlate";
import { GovernismoReading } from "@/components/public/GovernismoReading";
import { QualityPlate } from "@/components/public/QualityPlate";
import { PerformanceInfo } from "@/components/public/PerformanceInfo";
import { AreaInfo } from "@/components/public/AreaInfo";
import { parseQualityPillars } from "@/lib/domain/quality";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { ShareButton } from "@/components/public/ShareButton";
import { FollowButton } from "@/components/public/FollowButton";
import { Reveal } from "@/components/public/motion";
import { db } from "@/lib/db";
import { toPublicAgent } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { getAgentPosition } from "@/lib/domain/positions";
import { governismoReading } from "@/lib/domain/governismo";
import {
  citizenAgentAlignment,
  agentElectorateAlignments,
  agentBaseAlignments,
} from "@/lib/indexes/alignment";
import {
  citizenAgentAreaAgreement,
  type AreaAgreement,
} from "@/lib/indexes/area-alignment";
import { authorshipReading } from "@/lib/domain/authorship";
import { citizenFollows, followSlot } from "@/lib/domain/follows";
import { publicReading, followersNote } from "@/lib/domain/reading";
import { agentTypeLabel, agentTypeProseLabel, voteValueLabel } from "@/lib/labels";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** How many authored/rapporteured bills the profile prints. */
const AUTHORED_LIMIT = 8;

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
  const [electorateMap, baseMap] = await Promise.all([
    agentElectorateAlignments(),
    agentBaseAlignments(),
  ]);
  const engagement = electorateMap.get(agent.kid)?.alignment ?? null;
  // The base wins where there is one; the electorate stands in where there is
  // not. Never both — they answer the same question (`publicReading`).
  const reading = publicReading(baseMap.get(agent.kid), engagement);

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
  let areaAgreement: AreaAgreement[] | null = null;
  let follows: Awaited<ReturnType<typeof citizenFollows>> | null = null;
  if (session) {
    const user = await db.user.findUnique({
      where: { kid: session.userKid },
      select: { id: true, voteVersion: true },
    });
    if (user) {
      const [result, followMap, areas] = await Promise.all([
        citizenAgentAlignment(user.id, user.voteVersion, agent.kid),
        citizenFollows(user.id),
        citizenAgentAreaAgreement(user.id, agent.kid),
      ]);
      alignment = result?.alignment ?? null;
      sharedThemes = result?.sharedThemes ?? 0;
      follows = followMap;
      // Só mostra a figura quando ela tem o que dizer. Um radar em que todos os
      // nove eixos estão sem leitura não é uma leitura vazia — é uma pessoa que
      // ainda não votou o bastante, e a página já diz isso noutro lugar.
      areaAgreement = areas.some((a) => a.agreement !== null) ? areas : null;
    }
  }
  const follow = followSlot(agent, session ? follows ?? new Map() : null);
  const authorship = authorshipReading(agent.authorshipAreas);


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
            <div className="flex items-center gap-2">
              <FollowButton
                agentKid={dto.kid}
                agentName={fullName}
                officeLabel={agentTypeProseLabel[dto.type]}
                slot={follow}
              />
              <ShareButton kind="agente" kid={dto.kid} title={fullName} variant="button" />
            </div>
          </>
        }
        portrait={
          // A photo is the one thing in the system that is round (design.md §7),
          // set on a hairline so it sits on the paper rather than floating.
          <ImageWithFallback
            src={dto.imageUrl}
            alt={fullName}
            // Measured as this page's LCP element, served by the Câmara.
            priority
            className="h-24 w-24 rounded-full border border-line bg-navy-50 object-cover sm:h-32 sm:w-32 lg:h-36 lg:w-36"
            fallback={
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-line bg-navy-100 font-display text-2xl text-navy-700 sm:h-32 sm:w-32 sm:text-3xl lg:h-36 lg:w-36">
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
        // No figure. The masthead is the agent's own record — name, office,
        // party mark, mandate — and nothing else. The index readings live in the
        // margin column beside the record below, where they sit next to the
        // votes they are computed from. They were here, and being here forced
        // the band to the height of whichever column was taller.
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
        {/* On a phone the two columns stack, and the order is reversed on
            purpose: the readings come first. Stacked in source order they
            landed at y=1.988 — nearly three screens down, behind every bill the
            agent has ever signed — so the page a citizen opened to see one
            number opened without it. Explicit placement from `lg` up, because
            auto-placement would otherwise follow `order` and put the margin
            column on the left. */}
        <div className="grid gap-14 lg:grid-cols-[1fr_19rem] lg:gap-16">
          {/* ── The record: what the agent proposed, then how they voted ── */}
          <div className="order-2 min-w-0 lg:order-none lg:col-start-1 lg:row-start-1">
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

          {/* ── Margin column ─────────────────────────────────────────────
              One wrapper, not two grid children. The grid is two columns, so a
              third direct child wraps to column 1 of the next row — which is
              what put the positioning figure under the record instead of beside
              it, and stretched row 1 to the height of the taller column. */}
          <div className="flex flex-col gap-12">
          {/* Positioning: the figure and its legend, on the paper itself — no
              card, no rule, no tint. The left↔right BAND that used to head this
              block is gone with the spectrum bar: it reads as a verdict, and the
              maths behind it is only as good as the themes' axis tags, which are
              not filled in yet (CLAUDE.md §11) — it was calling PL centrist. The
              two-axis figure stays because it shows a shape, not a sentence. */}
          {/* Quality: the composite is in the masthead, so what belongs here is
              what it is made of. The plate prints each pillar's raw figure beside
              its rank on purpose — the rank is a position among peers, and
              printing it alone would assert a difference the data may not hold
              (CLAUDE.md §3.3). */}
          {/* The index readings, beside the record they are computed from.
              `ReadingPlate` sets each one full size — a label, a 2.7rem numeral,
              a bar and a note — which is why it belongs in a column of its own
              rather than in the masthead, where it decided the height of the
              whole band. */}
          <Reveal
            as="aside"
            variant="fade"
            delay={80}
            className="order-1 lg:order-none lg:col-start-2 lg:row-start-1"
          >
            <h2 className="text-xl text-navy-900">Alinhamento</h2>
            <div className="mt-4">
              <ReadingPlate
                caption="Com os eleitores"
                readings={[
                  session
                    ? {
                        label: "Seu alinhamento",
                        value: alignment,
                        hint:
                          alignment === null
                            ? "Vocês ainda não votaram nos mesmos temas. Vote mais para calcular."
                            : `Baseado em ${sharedThemes} ${sharedThemes === 1 ? "tema em comum" : "temas em comum"}.`,
                      }
                    : {
                        label: reading.shortLabel,
                        value: reading.value,
                        hint:
                          reading.value === null ? (
                            <>
                              Ainda não há votos de cidadãos suficientes para calcular.{" "}
                              <Link href="/login" className="font-medium text-navy-700 hover:text-navy-900">
                                Entre
                              </Link>{" "}
                              para ver o seu alinhamento pessoal.
                            </>
                          ) : reading.fromBase ? (
                            `O quanto os votos dele acompanham quem o segue — ${followersNote(reading.followers)}.`
                          ) : (
                            "O quanto os votos deste agente acompanham o conjunto dos cidadãos."
                          ),
                      },
                ]}
              />
              {totalAgentVotes > 0 ? (
                <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
                  {totalAgentVotes.toLocaleString("pt-BR")}{" "}
                  {totalAgentVotes === 1 ? "votação registrada" : "votações registradas"}.
                </p>
              ) : null}
            </div>
          </Reveal>

          {agent.qualityScore !== null ? (
            <Reveal as="aside" variant="fade" delay={100}>
              <h2 className="flex items-center text-xl text-navy-900">
                Performance política
                <PerformanceInfo />
              </h2>
              <div className="mt-4">
                <QualityPlate
                  pillars={parseQualityPillars(agent.qualityPillars)}
                  note={`${agent.qualityScore}/100`}
                />
              </div>
            </Reveal>
          ) : null}

          {areaAgreement ? (
            <Reveal as="aside" variant="fade" delay={110}>
              <h2 className="flex items-center text-xl text-navy-900">
                Alinhamento por área
                <AreaInfo kind="agreement" />
              </h2>
              <div className="mt-4">
                <AreaAgreementPlate areas={areaAgreement} agentName={fullName} />
              </div>
            </Reveal>
          ) : null}

          {/* Pública, ao contrário da placa acima: a autoria é um censo de
              documentos da casa e não depende de quem está lendo. É também a
              leitura que a de cima é confundida com — e tê-las na mesma página,
              cada uma com seu título, é o que separa as duas. */}
          {authorship?.publishable ? (
            <Reveal as="aside" variant="fade" delay={115}>
              <h2 className="flex items-center text-xl text-navy-900">
                Sobre o que legisla
                <AreaInfo kind="authorship" />
              </h2>
              <div className="mt-4">
                <AreaAuthorshipPlate reading={authorship} agentName={fullName} />
              </div>
            </Reveal>
          ) : null}

          <Reveal as="aside" variant="fade" delay={120}>
            <h2 className="text-xl text-navy-900">Posicionamento</h2>
            <div className="mt-4">
              <PositioningPlate
                economic={position.economic}
                social={position.social}
                detail={position.detail}
              />
              {/* Fora da placa, de propósito. A placa mostra os dois eixos, que
                  só existem depois dos três portões do §3.2; esta leitura não
                  depende de nenhum deles e tem de aparecer quando eles barram —
                  que é justamente quando a ficha ficaria sem posição alguma. */}
              <GovernismoReading
                reading={governismoReading(agent.governismo, agent.governismoBase)}
              />
            </div>
          </Reveal>
          </div>
        </div>
      </Container>
    </>
  );
}
