/**
 * Theme detail page: summary, source articles, live tallies and the vote control.
 * If the citizen already voted, their current choice is highlighted and changeable.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Card, CardBody, Badge } from "@/components/ui";
import { TemperatureBar } from "@/components/public/TemperatureBar";
import { VoteButtons } from "@/components/public/VoteButtons";
import { db } from "@/lib/db";
import { toPublicTheme } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import { scopeLabel } from "@/lib/labels";
import type { VoteValue } from "@/generated/prisma";

export const dynamic = "force-dynamic";

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
    include: { articles: true },
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
      <Link href="/temas" className="text-sm text-navy-600 hover:text-navy-800">
        ← Voltar para temas
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="navy">{scopeLabel[dto.scope]}</Badge>
                {location ? (
                  <span className="text-xs text-[var(--color-muted)]">{location}</span>
                ) : null}
              </div>
              <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-navy-900">
                {dto.name}
              </h1>
              {dto.summary ? (
                <p className="mt-4 text-base font-medium leading-relaxed text-navy-800">
                  {dto.summary}
                </p>
              ) : null}

              {dto.description ? (
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink">
                  {dto.description.split(/\n{2,}/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : null}

              {dto.viewpoints ? (
                <div className="mt-7">
                  <h2 className="text-sm font-semibold text-navy-900">
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
                          className="rounded-xl border border-line bg-canvas p-3.5"
                        >
                          <Badge tone={v.tone}>{v.label}</Badge>
                          <p className="mt-2 text-xs leading-relaxed text-ink">{v.text}</p>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              {dto.articles && dto.articles.length > 0 ? (
                <div className="mt-6">
                  <h2 className="text-sm font-semibold text-navy-900">Documentos e fontes</h2>
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
        </div>

        {/* Sidebar: tallies + vote */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardBody>
              <h2 className="text-lg font-semibold text-navy-900">Resultado atual</h2>
              <div className="mt-3">
                <TemperatureBar
                  yesCount={dto.yesCount}
                  noCount={dto.noCount}
                  absCount={dto.absCount}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="text-lg font-semibold text-navy-900">Seu voto</h2>
              {!isAuthenticated ? (
                <p className="mb-3 text-sm text-[var(--color-muted)]">
                  Entre para registrar o seu voto neste tema.
                </p>
              ) : null}
              <div className="mt-2">
                <VoteButtons
                  themeKid={dto.kid}
                  isAuthenticated={isAuthenticated}
                  currentValue={currentVote}
                />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </Container>
  );
}
