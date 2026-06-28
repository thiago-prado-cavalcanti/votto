/**
 * Agent detail page: photo, party, description, positioning (both axes with pole
 * labels + profile), alignment (for logged-in citizens) and the agent's recent
 * theme votes.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Card, CardBody, Badge, AlignmentMeter } from "@/components/ui";
import { PositionBadge } from "@/components/public/PositionBadge";
import { PositioningChart } from "@/components/public/PositioningChart";
import { db } from "@/lib/db";
import { toPublicAgent } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { getAgentPosition } from "@/lib/domain/positions";
import { citizenAgentAlignment } from "@/lib/indexes/alignment";
import { agentTypeLabel, voteValueLabel } from "@/lib/labels";
import { POSITIONING_AXES } from "@/lib/indexes/positioning";

export const dynamic = "force-dynamic";

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

  const recentVotes = await db.vote.findMany({
    where: { agentId: agent.id, voterType: "AGENT" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { value: true, theme: { select: { kid: true, name: true } } },
  });

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

  const dto = toPublicAgent(agent);
  const fullName = `${dto.firstName} ${dto.lastName}`.trim();
  const location = [dto.municipality, dto.state].filter(Boolean).join(" · ");
  const initials = `${dto.firstName[0] ?? ""}${dto.lastName[0] ?? ""}`.toUpperCase();

  return (
    <Container className="py-10">
      <Link href="/agentes" className="text-sm text-navy-600 hover:text-navy-800">
        ← Voltar para agentes
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        {/* Profile */}
        <div className="lg:col-span-2">
          <Card>
            <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-start">
              {dto.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dto.imageUrl}
                  alt={fullName}
                  className="h-24 w-24 rounded-2xl object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-navy-100 text-2xl font-semibold text-navy-700">
                  {initials}
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-2xl font-bold tracking-tight text-navy-900">{fullName}</h1>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  {agentTypeLabel[dto.type]}
                  {location ? ` · ${location}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {dto.party ? (
                    <Badge tone="navy">{dto.party.acronym ?? dto.party.name}</Badge>
                  ) : (
                    <Badge tone="gray">Sem partido</Badge>
                  )}
                  <PositionBadge profileLabel={position.profileLabel} basis={position.basis} />
                </div>
                {dto.description ? (
                  <p className="mt-4 text-sm leading-relaxed text-ink">{dto.description}</p>
                ) : null}
              </div>
            </CardBody>
          </Card>

          {/* Recent votes */}
          <Card className="mt-6">
            <CardBody>
              <h2 className="text-lg font-semibold text-navy-900">Votos recentes</h2>
              {recentVotes.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Este agente ainda não tem votos registrados.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--color-line)]">
                  {recentVotes.map((v) => (
                    <li
                      key={v.theme.kid}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <Link
                        href={`/temas/${v.theme.kid}`}
                        className="text-sm text-navy-700 hover:text-navy-900"
                      >
                        {v.theme.name}
                      </Link>
                      <Badge
                        tone={
                          v.value === "YES"
                            ? "positive"
                            : v.value === "NO"
                              ? "negative"
                              : "neutral"
                        }
                      >
                        {voteValueLabel[v.value]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Sidebar: positioning + alignment */}
        <div className="flex flex-col gap-6">
          {session ? (
            <Card>
              <CardBody>
                <h2 className="text-lg font-semibold text-navy-900">Seu alinhamento</h2>
                {alignment !== null ? (
                  <div className="mt-3">
                    <AlignmentMeter value={alignment} />
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
                      Baseado em {sharedThemes}{" "}
                      {sharedThemes === 1 ? "tema em comum" : "temas em comum"}.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--color-muted)]">
                    Vocês ainda não votaram nos mesmos temas. Vote mais para calcular o
                    alinhamento.
                  </p>
                )}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardBody>
              <h2 className="text-lg font-semibold text-navy-900">Posicionamento</h2>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Perfil: <span className="font-medium text-navy-800">{position.profileLabel}</span>
              </p>
              <div className="mt-3">
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
            </CardBody>
          </Card>
        </div>
      </div>
    </Container>
  );
}
