/**
 * Theme detail page: summary, source articles, live tallies and the vote control.
 * If the citizen already voted, their current choice is highlighted and changeable.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Card, CardBody, Badge } from "@/components/ui";
import { TemperatureBar } from "@/components/public/TemperatureBar";
import { VoteButtons } from "@/components/public/VoteButtons";
import { ShareButton } from "@/components/public/ShareButton";
import { db } from "@/lib/db";
import { PriorityBadge } from "@/components/public/PriorityBadge";
import { OfficialRecord } from "@/components/public/OfficialRecord";
import { ThemeAuthorLine } from "@/components/public/ThemeAuthorLine";
import { Reveal } from "@/components/public/motion";
import { toPublicTheme } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { scopeLabel, houseLabel } from "@/lib/labels";
import { env } from "@/lib/env";
import type { VoteValue } from "@/generated/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kid: string }>;
}): Promise<Metadata> {
  const { kid } = await params;
  const theme = await db.theme.findUnique({
    where: { kid },
    select: { name: true, summary: true, status: true },
  });
  if (!theme || theme.status !== "ACTIVE") return {};
  const description =
    theme.summary || "Vote neste tema e veja o resultado em tempo real no Votto.";
  const ogImage = `${env.appUrl}/api/og/tema/${kid}`;
  return {
    title: theme.name,
    description,
    openGraph: {
      title: `${theme.name} · Votto`,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title: `${theme.name} · Votto`, description, images: [ogImage] },
  };
}

export default async function ThemeDetailPage({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  const { kid } = await params;
  const session = await getCitizenSession();
  const isAuthenticated = Boolean(session);

  const theme = await db.theme.findUnique({
    where: { kid },
    include: {
      articles: true,
      proposer: { include: { party: true } },
      rapporteur: { include: { party: true } },
    },
  });
  if (!theme || theme.status !== "ACTIVE") notFound();

  const dto = toPublicTheme(theme);
  const location = [dto.municipality, dto.state].filter(Boolean).join(" · ");

  let currentVote: VoteValue | null = null;
  if (session) {
    const vote = await db.vote.findUnique({
      where: { cpfHash_themeId: { cpfHash: session.cpfHash, themeId: theme.id } },
      select: { value: true },
    });
    currentVote = vote?.value ?? null;
  }

  return (
    <Container className="py-10">
      <Reveal variant="fade" className="flex items-center justify-between gap-3">
        <Link href="/temas" className="text-sm text-navy-600 hover:text-navy-800">
          ← Voltar para temas
        </Link>
        <ShareButton kind="tema" kid={dto.kid} title={dto.name} variant="button" />
      </Reveal>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <Reveal className="lg:col-span-2" delay={80}>
          <Card>
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="navy">{scopeLabel[dto.scope]}</Badge>
                {dto.house ? <Badge tone="gray">{houseLabel[dto.house]}</Badge> : null}
                <PriorityBadge
                  band={dto.band}
                  urgency={dto.urgency}
                  situation={dto.situation}
                />
                {!dto.inProgress ? <Badge tone="gray">Tramitação encerrada</Badge> : null}
                {location ? (
                  <span className="text-xs text-[var(--color-muted)]">{location}</span>
                ) : null}
              </div>
              {dto.identifier ? (
                <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {dto.identifier}
                </p>
              ) : null}
              <h1 className="mt-1 text-[2.2rem] leading-[1.12] text-navy-900">
                {dto.plainTitle ?? dto.name}
              </h1>

              {/* Plain-language layer, clearly attributed. The official text is
                  never replaced — it follows immediately below. */}
              {dto.plainSummary ? (
                <div className="mt-4 rounded-card border border-line bg-canvas p-4">
                  <p className="text-base leading-relaxed text-navy-800">{dto.plainSummary}</p>
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Resumo em linguagem simples, gerado por IA a partir do texto oficial
                    {dto.aiModel ? ` (${dto.aiModel})` : ""}. O texto oficial está abaixo.
                  </p>
                </div>
              ) : null}

              {dto.summary ? (
                <div className="mt-5">
                  <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                    Ementa oficial
                  </h2>
                  <p className="mt-1.5 text-base font-medium leading-relaxed text-navy-800">
                    {dto.summary}
                  </p>
                </div>
              ) : null}

              <div className="mt-5">
                <ThemeAuthorLine author={dto.author} />
              </div>

              {dto.description ? (
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink">
                  {dto.description.split(/\n{2,}/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : null}

              {dto.viewpoints ? (
                <div className="mt-7">
                  <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                    Pontos de vista sobre o tema
                  </h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        { label: "Visão à esquerda", tone: "negative", text: dto.viewpoints.left },
                        { label: "Visão ao centro", tone: "gray", text: dto.viewpoints.center },
                        { label: "Visão à direita", tone: "navy", text: dto.viewpoints.right },
                      ] as const
                    )
                      .filter((v) => v.text)
                      .map((v) => (
                        <div
                          key={v.label}
                          className="rounded-card border border-line bg-canvas p-3.5"
                        >
                          <Badge tone={v.tone}>{v.label}</Badge>
                          <p className="mt-2 text-xs leading-relaxed text-ink">{v.text}</p>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <OfficialRecord theme={dto} />

              {dto.articles && dto.articles.length > 0 ? (
                <div className="mt-6">
                  <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Documentos e fontes</h2>
                  <ul className="mt-2 space-y-1.5">
                    {dto.articles.map((article) => (
                      <li key={article.kid}>
                        <a
                          href={article.downloadUrl ?? article.originalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-navy-600 underline hover:text-navy-800"
                        >
                          {article.title ?? article.originalUrl}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </Reveal>

        {/* Sidebar: the ballot first, then the result it feeds. */}
        <div className="flex flex-col gap-6">
          <Reveal delay={160}>
            {/* The one card in the system that opens with terracota: on this page
                the ballot is the action, and terracota is what marks an action. */}
            <Card className="overflow-hidden">
              <div className="h-[3px] bg-accent-500" />
              <CardBody>
                <h2 className="text-xl text-navy-900">
                  {currentVote ? "Seu voto" : "Vote neste tema"}
                </h2>
                <p className="mt-1 text-sm leading-snug text-[var(--color-muted)]">
                  {isAuthenticated
                    ? "Sua escolha entra no cálculo do seu alinhamento com agentes e partidos."
                    : "Entre para registrar o seu voto neste tema."}
                </p>
                <VoteButtons
                  className="mt-4"
                  themeKid={dto.kid}
                  isAuthenticated={isAuthenticated}
                  currentValue={currentVote}
                />
              </CardBody>
            </Card>
          </Reveal>

          <Reveal delay={240}>
            <Card>
              <CardBody>
                <h2 className="text-xl text-navy-900">Resultado atual</h2>
                <div className="mt-3">
                  <TemperatureBar
                    yesCount={dto.yesCount}
                    noCount={dto.noCount}
                    absCount={dto.absCount}
                  />
                </div>
              </CardBody>
            </Card>
          </Reveal>
        </div>
      </div>
    </Container>
  );
}
