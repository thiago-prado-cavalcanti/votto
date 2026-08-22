/**
 * Themes list, set as an order paper: one hairline-separated entry per active
 * theme, with tallies and the quick-vote panel on the right. Supports search by
 * title/code, scope/state/house filters and three orderings — one GET form, so
 * every control narrows the same query and the URL stays the state.
 *
 * The default ordering is legislative priority, not citizen engagement: once the
 * official importers are running, most themes have no citizen votes yet, so
 * ranking by engagement would bury exactly the bills that are about to be voted.
 *
 * The list does not end at the first sixty bills. The page renders one page on
 * the server — in the HTML, for the reader without JavaScript and for the first
 * paint — and `ThemeFeed` continues it as the citizen scrolls. `?p=` addresses a
 * page directly, which is what the "Ver mais temas" link uses when there is no
 * JavaScript to intercept it.
 *
 * The query itself lives in `src/lib/domain/theme-list.ts`, shared with the
 * server action that appends: two translations of the same filters would be two
 * chances for the appended rows to answer a different question than the ones
 * already on screen.
 */
import { Container, Field, Select, Input } from "@/components/ui";
import { PageIntro } from "@/components/public/Section";
import { IndexPlate } from "@/components/public/IndexPlate";
import { FilterBar } from "@/components/public/FilterBar";
import { ThemeRow } from "@/components/public/ThemeRow";
import { ThemeFeed } from "@/components/public/ThemeFeed";
import { db } from "@/lib/db";
import { getCitizenSession } from "@/lib/auth/session";
import { scopeLabel, houseLabel, BR_STATES } from "@/lib/labels";
import {
  THEME_ORDERINGS,
  loadThemePage,
  themeListWhere,
  themeOnlyOpen,
  themeOrdering,
  themeVotesFor,
  type ThemeListQuery,
  type ThemeOrdering,
} from "@/lib/domain/theme-list";
import {
  PRIORITY_BAND_RANGES,
  priorityBandLabel,
  type PriorityBand,
} from "@/lib/domain/priority";
import type { Scope, House } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const SCOPES = Object.keys(scopeLabel) as Scope[];
const HOUSES = Object.keys(houseLabel) as House[];

/** Pigment of each priority band in the masthead plate: hot ink → cold paper. */
const BAND_COLOR: Record<PriorityBand, string> = {
  URGENT: "var(--color-negative)",
  HIGH: "var(--color-ochre)",
  NORMAL: "var(--color-navy-600)",
  LOW: "var(--color-navy-300)",
};

export default async function ThemesPage({
  searchParams,
}: {
  searchParams: Promise<ThemeListQuery & { p?: string }>;
}) {
  const params = await searchParams;
  const { scope, state, house, q, order, open, p } = params;
  const query: ThemeListQuery = { scope, state, house, q, order, open };

  const session = await getCitizenSession();
  const isAuthenticated = Boolean(session);
  const ordering: ThemeOrdering = themeOrdering(order);
  const onlyOpen = themeOnlyOpen(open);

  const where = themeListWhere(query);

  // The masthead plate counts the WHOLE match, not the page of it that happens
  // to be printed, so it describes the query the citizen just made. Four indexed
  // counts on `priority`.
  const [page, bandCounts] = await Promise.all([
    loadThemePage(query, Number(p) || 1),
    Promise.all(
      PRIORITY_BAND_RANGES.map((range) =>
        db.theme.count({
          where: {
            ...where,
            priority: { gte: range.min, ...(range.max === undefined ? {} : { lt: range.max }) },
          },
        }),
      ),
    ),
  ]);

  const matchedThemes = bandCounts.reduce((sum, n) => sum + n, 0);
  const currentVotes = session
    ? await themeVotesFor(session.cpfHash, page.themes.map((t) => t.kid))
    : {};

  return (
    <>
      <PageIntro
        eyebrow="Pauta legislativa"
        title="Temas em pauta"
        lead="Vote nos temas que a Câmara e o Senado colocaram em votação. Cada voto ajuda a medir o alinhamento com seus representantes."
        figure={
          matchedThemes > 0 ? (
            <IndexPlate
              caption="Por prioridade"
              note={`${matchedThemes.toLocaleString("pt-BR")} ${matchedThemes === 1 ? "tema" : "temas"}`}
              rows={PRIORITY_BAND_RANGES.map((range, i) => ({
                label: priorityBandLabel[range.band],
                value: bandCounts[i],
                color: BAND_COLOR[range.band],
              }))}
            />
          ) : null
        }
      />

      <Container className="py-10">
        <FilterBar>
          <Field label="Buscar">
            <Input
              variant="rule"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Título ou PL 3085/2026"
            />
          </Field>
          <Field label="Ordenar por">
            <Select variant="rule" name="order" defaultValue={ordering}>
              {(Object.keys(THEME_ORDERINGS) as ThemeOrdering[]).map((key) => (
                <option key={key} value={key}>
                  {THEME_ORDERINGS[key].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Casa legislativa">
            <Select variant="rule" name="house" defaultValue={house ?? ""}>
              <option value="">Todas</option>
              {HOUSES.map((h) => (
                <option key={h} value={h}>
                  {houseLabel[h]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Abrangência">
            <Select variant="rule" name="scope" defaultValue={scope ?? ""}>
              <option value="">Todas</option>
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {scopeLabel[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select variant="rule" name="state" defaultValue={state ?? ""}>
              <option value="">Todos</option>
              {BR_STATES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Situação">
            <Select variant="rule" name="open" defaultValue={onlyOpen ? "1" : "0"}>
              <option value="1">Somente em tramitação</option>
              <option value="0">Incluir encerrados</option>
            </Select>
          </Field>
        </FilterBar>

        {page.themes.length === 0 ? (
          <p className="border-t border-line py-8 text-sm text-[var(--color-muted)]">
            Nenhum tema encontrado para esta busca.
          </p>
        ) : (
          <ThemeFeed
            query={query}
            startPage={page.page}
            initialHasMore={page.hasMore}
            isAuthenticated={isAuthenticated}
          >
            {page.themes.map((theme, i) => (
              <ThemeRow
                key={theme.kid}
                theme={theme}
                isAuthenticated={isAuthenticated}
                currentVote={currentVotes[theme.kid] ?? null}
                // Only the first screenful is offset; past that the scroll itself
                // is the stagger and a growing delay would just feel sluggish.
                delay={Math.min(i, 3) * 80}
              />
            ))}
          </ThemeFeed>
        )}
      </Container>
    </>
  );
}
