/**
 * Party detail page: identity, aggregate left↔right positioning (spectrum bar +
 * two-axis chart), the citizen's alignment (when logged in) and the party's
 * agents.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Card, CardBody, AlignmentMeter } from "@/components/ui";
import { PositioningPlate } from "@/components/public/PositioningPlate";
import { AgentCard } from "@/components/public/AgentCard";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { ShareButton } from "@/components/public/ShareButton";
import { Reveal } from "@/components/public/motion";
import { db } from "@/lib/db";
import { toPublicParty, toPublicAgent } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { getPartyPosition } from "@/lib/domain/positions";
import { partyQualityScores } from "@/lib/domain/quality";
import {
  citizenAgentAlignments,
  citizenPartyAlignments,
  partyElectorateAlignments,
  partyBaseAlignments,
  agentElectorateAlignments,
  agentBaseAlignments,
} from "@/lib/indexes/alignment";
import { citizenFollows, followSlot } from "@/lib/domain/follows";
import { publicReading } from "@/lib/domain/reading";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kid: string }>;
}): Promise<Metadata> {
  const { kid } = await params;
  const party = await db.party.findUnique({
    where: { kid },
    select: { name: true, acronym: true, status: true },
  });
  if (!party || party.status !== "ACTIVE") return {};
  const label = party.acronym ? `${party.name} (${party.acronym})` : party.name;
  const description = `Veja o alinhamento com eleitores e o posicionamento do ${label} no Votto.`;
  const ogImage = `${env.appUrl}/api/og/partido/${kid}`;
  return {
    title: party.name,
    description,
    openGraph: { title: `${party.name} · Votto`, description, images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `${party.name} · Votto`, description, images: [ogImage] },
  };
}

export default async function PartyDetailPage({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  const { kid } = await params;
  const session = await getCitizenSession();

  const party = await db.party.findUnique({ where: { kid } });
  if (!party || party.status !== "ACTIVE") notFound();

  const position = await getPartyPosition(party.id);
  const [partyElectorate, partyBase, agentElectorate, agentBase, partyQuality] = await Promise.all([
    partyElectorateAlignments(),
    partyBaseAlignments(),
    agentElectorateAlignments(),
    agentBaseAlignments(),
    partyQualityScores(),
  ]);
  const engagement = partyElectorate.get(party.kid)?.alignment ?? null;
  const quality = partyQuality.get(party.kid) ?? null;
  // The base wins where there is one; the electorate stands in where there is
  // not (`publicReading`) — the same rule the cards and the records follow.
  const reading = publicReading(partyBase.get(party.kid), engagement);

  const agents = await db.publicAgent.findMany({
    where: { partyId: party.id, status: "ACTIVE", inOffice: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: { party: true },
  });

  // Alignment (party-level + per agent) for logged-in citizens.
  let partyAlignment: number | null = null;
  let agentAlignments: Map<string, { alignment: number | null; sharedThemes: number }> | null =
    null;
  let follows: Awaited<ReturnType<typeof citizenFollows>> | null = null;
  if (session) {
    const user = await db.user.findUnique({
      where: { kid: session.userKid },
      select: { id: true, voteVersion: true },
    });
    if (user) {
      const [parties, agentsMap, followMap] = await Promise.all([
        citizenPartyAlignments(user.id, user.voteVersion),
        citizenAgentAlignments(user.id, user.voteVersion),
        citizenFollows(user.id),
      ]);
      partyAlignment = parties.get(party.kid)?.alignment ?? null;
      agentAlignments = agentsMap;
      follows = followMap;
    }
  }

  const dto = toPublicParty(party);
  const acronym = dto.acronym ?? dto.name.slice(0, 3).toUpperCase();

  return (
    <Container className="py-10">
      <Reveal variant="fade" className="flex items-center justify-between gap-3">
        <Link href="/partidos" className="text-sm text-navy-600 hover:text-navy-800">
          ← Voltar para partidos
        </Link>
        <ShareButton kind="partido" kid={dto.kid} title={dto.name} variant="button" />
      </Reveal>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        {/* Identity + agents. Each column arrives as a stack: the cards inside it
            settle one after the other, and the meters and charts they hold are
            armed by the same reveal (see the motion block in globals.css). */}
        <Reveal variant="fade" stagger step={130} delay={80} className="lg:col-span-2">
          <Card>
            <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {/* Same free-standing treatment as the list card, one size up:
                  height only, width left to the mark. */}
              <ImageWithFallback
                src={dto.logoUrl}
                alt={acronym}
                className="h-16 w-auto max-w-52 shrink-0 object-contain mix-blend-multiply"
                fallback={
                  <div className="flex h-16 shrink-0 items-center font-display text-2xl leading-none text-navy-700">
                    {acronym}
                  </div>
                }
              />
              <div className="flex-1">
                <h1 className="text-[1.9rem] leading-tight text-navy-900">{dto.name}</h1>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  {acronym} · {dto.agentCount} {dto.agentCount === 1 ? "agente" : "agentes"}
                </p>
                {dto.description ? (
                  <p className="mt-4 text-sm leading-relaxed text-ink">{dto.description}</p>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card className="mt-6">
            <CardBody>
              <h2 className="text-xl text-navy-900">
                Agentes do partido ({agents.length})
              </h2>
              {agents.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Nenhum agente ativo neste partido.
                </p>
              ) : (
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  {agents.map((a, i) => (
                    <AgentCard
                      key={a.kid}
                      agent={toPublicAgent(a)}
                      alignment={session ? agentAlignments?.get(a.kid)?.alignment ?? null : null}
                      engagement={agentElectorate.get(a.kid)?.alignment ?? null}
                      base={agentBase.get(a.kid)}
                      follow={followSlot(a, session ? follows ?? new Map() : null)}
                      delay={(i % 2) * 80}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </Reveal>

        {/* Sidebar: alignment + positioning */}
        <Reveal variant="fade" stagger step={130} delay={200} className="flex flex-col gap-6">
          <Card>
            <CardBody>
              <h2 className="text-xl text-navy-900">Alinhamento</h2>

              {/* Global alignment (always shown) */}
              <div className="mt-3">
                {reading.value !== null ? (
                  <>
                    <AlignmentMeter value={reading.value} label={reading.label} />
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
                      {reading.fromBase
                        ? `O quanto os agentes do partido acompanham quem os segue — ${reading.followers.toLocaleString("pt-BR")} ${reading.followers === 1 ? "pessoa" : "pessoas"}.`
                        : "O quanto os agentes do partido acompanham o conjunto dos cidadãos."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    Ainda não há votos de cidadãos suficientes para calcular o alinhamento.
                  </p>
                )}
              </div>

              {/* Quality: the mean of the bench's scores. Under the alignment
                  readings because it answers a different question — not who the
                  party agrees with, but how its members exercise their mandates.
                  Omitted, never zeroed, when none of them could be measured. */}
              {quality !== null ? (
                <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                  <AlignmentMeter value={quality} label="Performance política" />
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Média da performance dos agentes do partido em exercício: assiduidade,
                    projetos apresentados e relatados, e custo político.
                  </p>
                </div>
              ) : null}

              {/* Personal alignment (logged-in citizens) */}
              {session ? (
                <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                  {partyAlignment !== null ? (
                    <>
                      <AlignmentMeter value={partyAlignment} label="Seu alinhamento" />
                      <p className="mt-2 text-xs text-[var(--color-muted)]">
                        Média do seu alinhamento com os agentes do partido.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--color-muted)]">
                      Vote em mais temas para calcular o seu alinhamento com este partido.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                  <p className="text-xs text-[var(--color-muted)]">
                    <Link href="/login" className="font-medium text-navy-700 hover:text-navy-900">
                      Entre
                    </Link>{" "}
                    para ver o seu alinhamento pessoal.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Same as the agent page: figure on the paper, no card and no band —
              see the note there. */}
          <div>
            <h2 className="text-xl text-navy-900">Posicionamento</h2>
            <div className="mt-4">
              <PositioningPlate
                economic={position.economic}
                social={position.social}
                detail={position.detail}
                party={position.party}
              />
            </div>
          </div>
        </Reveal>
      </div>
    </Container>
  );
}
