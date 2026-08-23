/**
 * Parties list: active parties with their agent count and (for logged-in
 * citizens) their alignment meter. Sortable by alignment (when logged in),
 * number of agents, or name.
 */
import { Container, ButtonLink } from "@/components/ui";
import { PageIntro } from "@/components/public/Section";
import { IndexPlate } from "@/components/public/IndexPlate";
import { PartyCard } from "@/components/public/PartyCard";
import { SortHeader } from "@/components/public/SortHeader";
import { db } from "@/lib/db";
import { toPublicParty } from "@/lib/dto";
import { getCitizenSession } from "@/lib/auth/session";
import {
  citizenPartyAlignments,
  partyElectorateAlignments,
  partyBaseAlignments,
  type BaseAlignment,
} from "@/lib/indexes/alignment";
import { partyQualityScores } from "@/lib/domain/quality";
import { publicReading } from "@/lib/domain/reading";

export const dynamic = "force-dynamic";

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const { sort, dir } = await searchParams;
  const session = await getCitizenSession();

  const parties = await db.party.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
  });


  // The published reading: the combined bases of the party's agents, falling
  // back to the electorate where none of them is followed yet.
  const [engagement, base, quality] = await Promise.all([
    partyElectorateAlignments(),
    partyBaseAlignments(),
    partyQualityScores(),
  ]);

  // Alignment for logged-in citizens.
  let alignments: Map<string, { alignment: number | null; agents: number }> | null = null;
  if (session) {
    const user = await db.user.findUnique({
      where: { kid: session.userKid },
      select: { id: true, voteVersion: true },
    });
    if (user) {
      alignments = await citizenPartyAlignments(user.id, user.voteVersion);
    }
  }

  type Row = {
    party: ReturnType<typeof toPublicParty>;
    alignment: number | null;
    quality: number | null;
    engagement: number | null;
    base: BaseAlignment | undefined;
    /** The figure actually printed — what the ranking must order on. */
    published: number | null;
  };

  let rows: Row[] = parties.map((p) => {
    const partyBase = base.get(p.kid);
    const partyEngagement = engagement.get(p.kid)?.alignment ?? null;
    return {
      party: toPublicParty(p),
      alignment: alignments?.get(p.kid)?.alignment ?? null,
      quality: quality.get(p.kid) ?? null,
      engagement: partyEngagement,
      base: partyBase,
      published: publicReading(partyBase, partyEngagement).value,
    };
  });

  // The same four orderings as the agents list, and the same rules: name is the
  // default because it never waits on data, and a party we could not measure
  // sinks in BOTH directions rather than being handed back as "the worst".
  const PARTY_SORTS: Record<string, (r: (typeof rows)[number]) => number | null> = {
    quality: (r) => r.quality,
    personal: (r) => r.alignment,
    base: (r) => r.published,
  };
  // `engagement`/`alignment` are the older tokens; links to them are already in
  // circulation, and the URL is a contract with whoever shared one.
  const requested = sort === "engagement" ? "base" : sort === "alignment" ? "personal" : sort;
  const activeSort = requested && requested in PARTY_SORTS ? requested : "name";
  const activeDir: "asc" | "desc" =
    dir === "asc" || dir === "desc" ? dir : activeSort === "name" ? "asc" : "desc";
  const descending = activeDir === "desc";
  const byName = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    a.party.name.localeCompare(b.party.name, "pt-BR");

  if (activeSort === "name") {
    rows = [...rows].sort((a, b) => (descending ? -byName(a, b) : byName(a, b)));
  } else {
    const pick = PARTY_SORTS[activeSort];
    rows = [...rows].sort((a, b) => {
      const x = pick(a);
      const y = pick(b);
      if (x === null && y === null) return byName(a, b);
      if (x === null) return 1;
      if (y === null) return -1;
      return (descending ? y - x : x - y) || byName(a, b);
    });
  }

  const sortOptions = [
    { key: "name", label: "Nome", has: true },
    { key: "quality", label: "Performance política", has: rows.some((r) => r.quality !== null) },
    {
      key: "personal",
      label: "Alinhamento com você",
      has: Boolean(session) && rows.some((r) => r.alignment !== null),
    },
    { key: "base", label: "Alinhamento com a base", has: rows.some((r) => r.published !== null) },
  ]
    .filter((o) => o.has)
    .map(({ key, label }) => ({
      key,
      label,
      href: `?sort=${key}&dir=${
        key === activeSort ? (activeDir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc"
      }`,
    }));

  // Masthead plate: the five largest benches. A party list is read as a balance
  // of forces before it is read alphabetically, and the headcount is the one
  // figure that is available for every party today (the positioning index needs
  // themes tagged with dimensions, which most still lack). Terracota marks the
  // leader, as in the home ranking.
  const benchRows = [...parties]
    .sort((a, b) => b.agentCount - a.agentCount)
    .slice(0, 5)
    .filter((p) => p.agentCount > 0)
    .map((p, i) => ({
      label: p.acronym ?? p.name,
      value: p.agentCount,
      color: i === 0 ? "var(--color-accent-500)" : "var(--color-navy-800)",
    }));

  return (
    <>
      <PageIntro
        eyebrow="Bancadas e alinhamento"
        title="Partidos"
        lead="Tamanho de bancada e, ao entrar, o seu alinhamento com cada partido."
        figure={
          benchRows.length > 0 ? (
            <IndexPlate
              caption="Maiores bancadas"
              note={`${parties.length.toLocaleString("pt-BR")} ${parties.length === 1 ? "partido" : "partidos"}`}
              rows={benchRows}
            />
          ) : null
        }
      >
        {!session ? (
          <ButtonLink href="/login">Entrar para ver meu alinhamento</ButtonLink>
        ) : null}
      </PageIntro>

      <Container className="py-10">
        {/* No filter bar here: this list has nothing to filter by, only to
            order. So the sort header takes its place and carries the rules the
            bar would have — on /agentes it hugs the filter instead, which
            already closes with one. */}
        {sortOptions.length > 1 ? (
          <SortHeader
            options={sortOptions}
            active={activeSort}
            direction={activeDir}
            className="mb-10 border-y border-line"
          />
        ) : null}

        {rows.length === 0 ? (
          <p className="border-t border-line py-8 text-sm text-[var(--color-muted)]">
            Nenhum partido cadastrado.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row, i) => (
              <PartyCard
                key={row.party.kid}
                party={row.party}
                alignment={session ? row.alignment : null}
                engagement={row.engagement}
                base={row.base}
                quality={row.quality}
                // Cards sharing a row arrive left to right; each row of the grid
                // still waits for its own scroll position.
                delay={(i % 3) * 80}
              />
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
