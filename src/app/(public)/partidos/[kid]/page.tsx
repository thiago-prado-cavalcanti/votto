/**
 * Party detail page: identity, aggregate left↔right positioning (spectrum bar +
 * two-axis chart), the citizen's alignment (when logged in) and the party's
 * agents.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Card, CardBody, AlignmentMeter } from "@/components/ui";
import { PositionBadge } from "@/components/public/PositionBadge";
import { PositioningChart } from "@/components/public/PositioningChart";
import { SpectrumBar } from "@/components/public/SpectrumBar";
import { AgentCard } from "@/components/public/AgentCard";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { db } from "@/lib/db";
import { toPublicParty, toPublicAgent } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { getPartyPosition, getAgentPosition } from "@/lib/domain/positions";
import {
  citizenAgentAlignments,
  citizenPartyAlignments,
  partyElectorateAlignments,
} from "@/lib/indexes/alignment";

export const dynamic = "force-dynamic";

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
  const engagement = (await partyElectorateAlignments()).get(party.kid)?.alignment ?? null;

  const agents = await db.publicAgent.findMany({
    where: { partyId: party.id, status: "ACTIVE" },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: { party: true },
  });
  const agentPositions = await Promise.all(agents.map((a) => getAgentPosition(a.id)));

  // Alignment (party-level + per agent) for logged-in citizens.
  let partyAlignment: number | null = null;
  let agentAlignments: Map<string, { alignment: number | null; sharedThemes: number }> | null =
    null;
  if (session) {
    const user = await db.user.findUnique({
      where: { kid: session.userKid },
      select: { id: true, voteVersion: true },
    });
    if (user) {
      const [parties, agentsMap] = await Promise.all([
        citizenPartyAlignments(user.id, user.voteVersion),
        citizenAgentAlignments(user.id, user.voteVersion),
      ]);
      partyAlignment = parties.get(party.kid)?.alignment ?? null;
      agentAlignments = agentsMap;
    }
  }

  const dto = toPublicParty(party);
  const acronym = dto.acronym ?? dto.name.slice(0, 3).toUpperCase();

  return (
    <Container className="py-10">
      <Link href="/partidos" className="text-sm text-navy-600 hover:text-navy-800">
        ← Voltar para partidos
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        {/* Identity + agents */}
        <div className="lg:col-span-2">
          <Card>
            <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <ImageWithFallback
                src={dto.logoUrl}
                alt={acronym}
                className="h-20 w-20 rounded-2xl border-2 border-navy-200 bg-navy-50 object-contain p-1.5"
                fallback={
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-navy-900 text-lg font-extrabold text-white">
                    {acronym}
                  </div>
                }
              />
              <div className="flex-1">
                <h1 className="text-2xl font-bold tracking-tight text-navy-900">{dto.name}</h1>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  {acronym} · {dto.agentCount} {dto.agentCount === 1 ? "agente" : "agentes"}
                </p>
                <div className="mt-3">
                  <PositionBadge
                    profileLabel={position.profileLabel}
                    profileKey={position.profileKey}
                    basis={position.basis}
                  />
                </div>
                {dto.description ? (
                  <p className="mt-4 text-sm leading-relaxed text-ink">{dto.description}</p>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card className="mt-6">
            <CardBody>
              <h2 className="text-lg font-semibold text-navy-900">
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
                      profileLabel={agentPositions[i].profileLabel}
                      profileKey={agentPositions[i].profileKey}
                      profileBasis={agentPositions[i].basis}
                      alignment={session ? agentAlignments?.get(a.kid)?.alignment ?? null : null}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Sidebar: alignment + positioning */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardBody>
              <h2 className="text-lg font-semibold text-navy-900">Alinhamento</h2>

              {/* Global alignment (always shown) */}
              <div className="mt-3">
                {engagement !== null ? (
                  <>
                    <AlignmentMeter value={engagement} label="Alinhamento com eleitores" />
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
                      O quanto os agentes do partido acompanham o conjunto dos cidadãos.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    Ainda não há votos de cidadãos suficientes para o alinhamento com eleitores.
                  </p>
                )}
              </div>

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

          <Card>
            <CardBody>
              <h2 className="text-lg font-semibold text-navy-900">Posicionamento</h2>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Posição:{" "}
                <span className="font-medium text-navy-800">{position.profileLabel}</span>
              </p>
              {position.basis > 0 ? (
                <div className="mt-3">
                  <SpectrumBar spectrum={position.spectrum} basis={position.basis} />
                </div>
              ) : null}
              <div className="mt-4">
                <PositioningChart
                  economic={position.economic}
                  social={position.social}
                  basis={position.basis}
                />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </Container>
  );
}
