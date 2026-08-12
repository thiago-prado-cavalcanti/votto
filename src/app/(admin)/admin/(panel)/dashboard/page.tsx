/**
 * Admin dashboard: high-level counts and a short list of recent themes.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { Stat, Card, CardBody, Badge } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { scopeLabel } from "@/lib/labels";
import { isAiEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [users, parties, agents, themes, votes, recentThemes] = await Promise.all([
    db.user.count(),
    db.party.count(),
    db.publicAgent.count(),
    db.theme.count(),
    db.vote.count(),
    db.theme.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { kid: true, name: true, scope: true, status: true, createdAt: true },
    }),
  ]);

  const aiEnabled = isAiEnabled();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visão geral da plataforma Votto."
        action={
          aiEnabled ? (
            <Badge tone="positive">IA ativada</Badge>
          ) : (
            <Badge tone="neutral">IA desativada</Badge>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Cidadãos" value={users.toLocaleString("pt-BR")} />
        <Stat label="Partidos" value={parties.toLocaleString("pt-BR")} />
        <Stat label="Agentes públicos" value={agents.toLocaleString("pt-BR")} />
        <Stat label="Temas" value={themes.toLocaleString("pt-BR")} />
        <Stat label="Votos" value={votes.toLocaleString("pt-BR")} />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-xl text-navy-900">
            Temas recentes
          </h2>
          <Link
            href="/admin/temas"
            className="text-sm font-semibold text-accent-700 hover:text-accent-600"
          >
            Ver todos →
          </Link>
        </div>
        <Card>
          <CardBody className="p-0">
            {recentThemes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
                Nenhum tema cadastrado ainda.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {recentThemes.map((t) => (
                  <li key={t.kid}>
                    <Link
                      href={`/admin/temas/${t.kid}`}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-navy-50/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {scopeLabel[t.scope]} ·{" "}
                          {t.createdAt.toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
