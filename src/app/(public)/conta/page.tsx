/**
 * The citizen's account: who represents them, and how to change it.
 *
 * Deliberately thin. The platform keeps almost nothing about a citizen — first
 * and last name, and that is the point (CLAUDE.md §5) — so an account page that
 * tried to look like a profile would be padding. What it does own is the one
 * thing the citizen decided and can undo: the declarations of representation.
 *
 * The offices are printed as slots, filled or empty, rather than as a list of
 * what happens to exist. A ballot has a line for every office whether or not you
 * marked it, and reading the empty lines is how the citizen discovers there is a
 * senator to follow as well as a deputy.
 */
import Link from "next/link";
import { Container } from "@/components/ui";
import { PageIntro, SectionHead } from "@/components/public/Section";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { FollowButton } from "@/components/public/FollowButton";
import { Reveal } from "@/components/public/motion";
import { db } from "@/lib/db";
import { requireCitizen } from "@/lib/auth/guards";
import { citizenAgentAlignments } from "@/lib/indexes/alignment";
import { agentTypeLabel, agentTypeProseLabel } from "@/lib/labels";
import type { AgentType } from "@/generated/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sua conta",
  // Nothing here is for anybody but the citizen; keep it out of every index.
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const session = await requireCitizen();

  const user = await db.user.findUnique({
    where: { kid: session.userKid },
    select: { id: true, firstName: true, voteVersion: true },
  });
  if (!user) {
    // The session outlived the record (erasure, or a wiped database). Nothing
    // to show, and no reason to crash the page over it.
    return (
      <PageIntro
        eyebrow="Sua conta"
        title="Conta não encontrada"
        lead="Entre novamente para continuar."
      />
    );
  }

  const [follows, offices, alignments, voteCount] = await Promise.all([
    db.agentFollow.findMany({
      where: { userId: user.id },
      select: {
        type: true,
        agent: {
          select: {
            kid: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
            state: true,
            inOffice: true,
            party: { select: { name: true, acronym: true, logoUrl: true } },
          },
        },
      },
    }),
    // Which offices exist to be followed at all. Derived rather than hard-coded,
    // so the page grows with the imports instead of printing five empty slots
    // for chambers whose data has not landed yet.
    db.publicAgent.groupBy({
      by: ["type"],
      where: { status: "ACTIVE", inOffice: true },
      _count: { _all: true },
    }),
    citizenAgentAlignments(user.id, user.voteVersion),
    db.vote.count({ where: { userId: user.id, voterType: "USER" } }),
  ]);

  const followByType = new Map(follows.map((f) => [f.type, f]));
  // Every office with agents to choose from, plus any office already declared
  // (a mandate can end without the declaration going with it).
  const slots = [
    ...new Set<AgentType>([...offices.map((o) => o.type), ...followByType.keys()]),
  ].sort((a, b) => agentTypeLabel[a].localeCompare(agentTypeLabel[b], "pt-BR"));

  return (
    <>
      <PageIntro
        eyebrow="Sua conta"
        title={`Olá, ${user.firstName}`}
        lead={
          voteCount > 0
            ? `Você já votou em ${voteCount.toLocaleString("pt-BR")} ${voteCount === 1 ? "tema" : "temas"}. Aqui você vê e muda quem representa você.`
            : "Aqui você vê e muda quem representa você. Vote nos temas para calcular o seu alinhamento."
        }
      />

      <Container className="py-12">
        <SectionHead
          title="Quem eu acompanho"
          lead="Um agente por cargo, como na urna. Para trocar, deixe de seguir e escolha outro."
        />

        <Reveal
          as="ul"
          variant="fade"
          stagger
          step={80}
          className="mt-6 divide-y divide-[var(--color-line)] border-y border-line"
        >
          {slots.map((type) => (
            <OfficeSlot
              key={type}
              type={type}
              follow={followByType.get(type)}
              alignment={
                followByType.has(type)
                  ? alignments.get(followByType.get(type)!.agent.kid)?.alignment ?? null
                  : null
              }
            />
          ))}
        </Reveal>

        {slots.length === 0 ? (
          <p className="border-t border-line py-8 text-sm text-[var(--color-muted)]">
            Nenhum agente público foi importado até agora.
          </p>
        ) : null}
      </Container>
    </>
  );
}

/** One line of the ballot: the office, and whoever the citizen put on it. */
function OfficeSlot({
  type,
  follow,
  alignment,
}: {
  type: AgentType;
  follow?: {
    agent: {
      kid: string;
      firstName: string;
      lastName: string;
      imageUrl: string | null;
      state: string | null;
      inOffice: boolean;
      party: { name: string; acronym: string | null; logoUrl: string | null } | null;
    };
  };
  alignment: number | null;
}) {
  const office = agentTypeLabel[type];

  if (!follow) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div>
          <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
            {office}
          </div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Você ainda não acompanha ninguém neste cargo.
          </p>
        </div>
        <Link
          href={`/agentes?type=${type}`}
          className="text-sm font-medium text-accent-600 transition-colors hover:text-accent-500"
        >
          Escolher
        </Link>
      </li>
    );
  }

  const { agent } = follow;
  const fullName = `${agent.firstName} ${agent.lastName}`.trim();
  const initials = `${agent.firstName[0] ?? ""}${agent.lastName[0] ?? ""}`.toUpperCase();

  return (
    <li className="flex flex-wrap items-center gap-4 py-5">
      <ImageWithFallback
        src={agent.imageUrl}
        alt={fullName}
        className="h-12 w-12 shrink-0 rounded-full border border-line bg-navy-50 object-cover"
        fallback={
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-navy-100 text-xs font-semibold text-navy-700">
            {initials}
          </div>
        }
      />

      <div className="min-w-0 flex-1">
        <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
          {office}
        </div>
        <Link href={`/agentes/${agent.kid}`} className="group">
          <h3 className="mt-0.5 truncate text-lg text-navy-900 group-hover:underline">
            {fullName}
          </h3>
        </Link>
        <p className="text-xs text-[var(--color-muted)]">
          {[agent.party?.acronym ?? agent.party?.name, agent.state].filter(Boolean).join(" · ") ||
            "Sem partido"}
          {agent.inOffice ? "" : " · Mandato encerrado"}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {alignment !== null ? (
          <div className="text-right">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
              Seu alinhamento
            </div>
            <div className="vt-num text-lg text-navy-900">{alignment}%</div>
          </div>
        ) : null}
        <FollowButton
          agentKid={agent.kid}
          agentName={fullName}
          officeLabel={agentTypeProseLabel[type]}
          slot={{ kind: "following" }}
        />
      </div>
    </li>
  );
}
