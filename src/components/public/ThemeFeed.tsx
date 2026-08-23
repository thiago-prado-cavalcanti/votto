"use client";

/**
 * The themes list as a continuous order paper: the first page arrives rendered
 * on the server, and the rest is drawn in as the citizen reaches the foot of it.
 *
 * The first page is passed as `children`, already rendered — not as data this
 * component maps. That is the load-bearing choice: an order paper of sixty bills
 * is the page's content, and it must be in the HTML for a reader without
 * JavaScript, for the crawler, and for the first paint. Only the continuation is
 * this component's business.
 *
 * **The link is the mechanism, not the fallback.** What renders on the server is
 * an ordinary `<a href="?p=2">`, which works with no JavaScript at all — the
 * next sixty bills arrive as a new page, the way a printed record is turned. The
 * observer below only takes that link's place once it can honour it, so nothing
 * is ever offered that cannot be delivered.
 *
 * Failures are shown, never swallowed: a page that could not be loaded says so
 * and offers the link again, because a sentinel that silently stops looks
 * exactly like the end of the list.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ThemeRow, ThemeList } from "@/components/public/ThemeRow";
import { loadMoreThemes } from "@/lib/actions/themes";
import type { ThemeListQuery } from "@/lib/domain/theme-list";
import type { PublicTheme } from "@/lib/dto";
import type { VoteValue } from "@/generated/prisma";

/** How far ahead of the fold the next page starts loading. */
const PREFETCH_MARGIN = "800px";

/** Nothing to subscribe to: the store's only "change" is hydration itself. */
const noSubscribe = () => () => {};

/**
 * Whether this render is the hydrated client one.
 *
 * `useSyncExternalStore` rather than a mount effect: React reads the server
 * snapshot (`false`) while rendering the HTML and the client one (`true`) once
 * hydrated, in one pass and with no cascading render — which is exactly the
 * question being asked, and the reason the link is what ships in the markup.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

export function ThemeFeed({
  query,
  startPage,
  initialHasMore,
  isAuthenticated,
  children,
}: {
  /** The list's filter/order state, as it sits in the URL. */
  query: ThemeListQuery;
  /** 1-based index of the page rendered on the server, from `?p=`. */
  startPage: number;
  /** Whether the server-rendered page is followed by another one. */
  initialHasMore: boolean;
  isAuthenticated: boolean;
  /** The page rendered on the server. */
  children: React.ReactNode;
}) {
  const [pages, setPages] = useState<Array<{ themes: PublicTheme[]; votes: Record<string, VoteValue> }>>([]);
  const [nextPage, setNextPage] = useState(startPage + 1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Until the component has hydrated, the link is the only thing that works — so
  // the link is the only thing shown.
  const ready = useHydrated();
  const sentinel = useRef<HTMLDivElement | null>(null);

  const loadNext = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setFailed(false);
    try {
      const result = await loadMoreThemes(query, nextPage);
      setPages((previous) => [...previous, { themes: result.themes, votes: result.votes }]);
      setNextPage(result.page + 1);
      setHasMore(result.hasMore);
    } catch {
      // Kept generic on purpose: the citizen can retry, and the reason belongs
      // in the server log rather than on the order paper.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [hasMore, loading, nextPage, query]);

  useEffect(() => {
    // A failed page waits for a deliberate retry: re-arming the observer over a
    // source that is refusing would hammer it all the way down the page.
    if (!ready || !hasMore || failed) return;
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadNext();
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, hasMore, failed, loadNext]);

  const moreHref = `?${new URLSearchParams({
    ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)),
    p: String(nextPage),
  }).toString()}`;

  return (
    <>
      <ThemeList>
        {children}
        {pages.flatMap((page, pageIndex) =>
          page.themes.map((theme, i) => (
            <ThemeRow
              key={theme.kid}
              theme={theme}
              isAuthenticated={isAuthenticated}
              currentVote={page.votes[theme.kid] ?? null}
              // Only the first rows of an appended page are offset; past that the
              // scroll itself is the stagger, exactly as on the server-rendered page.
              delay={pageIndex === 0 && i < 4 ? i * 80 : 0}
            />
          )),
        )}
      </ThemeList>

      {hasMore ? (
        <div ref={sentinel} className="flex justify-center py-8">
          {!ready || failed ? (
            <div className="text-center">
              {failed ? (
                <p className="mb-3 text-sm text-[var(--color-muted)]">
                  Não foi possível carregar mais temas. Continue pela página seguinte.
                </p>
              ) : null}
              <Link
                href={moreHref}
                onClick={
                  // Once mounted, the same link continues in place instead of
                  // reloading the document — EXCEPT after a failure, where it
                  // stays a real link on purpose.
                  //
                  // The failure this recovers from is a deploy: a server
                  // action's id is scoped to the build that produced it, so a
                  // tab left open across a release calls an id the new build no
                  // longer has. Retrying in place would then fail forever,
                  // because the stale bundle can never reach the new action.
                  // Navigating loads a fresh document, which both serves the
                  // page and replaces the bundle that broke.
                  ready && !failed
                    ? (event) => {
                        event.preventDefault();
                        void loadNext();
                      }
                    : undefined
                }
                className="inline-flex h-11 items-center rounded-card border border-navy-300 bg-transparent px-5 text-sm font-semibold text-navy-900 transition-colors hover:border-navy-900 hover:bg-navy-100"
              >
                {failed ? "Tentar de novo" : "Ver mais temas"}
              </Link>
            </div>
          ) : (
            <p
              className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]"
              role="status"
              aria-live="polite"
            >
              {loading ? "Carregando mais temas…" : "Role para ver mais"}
            </p>
          )}
        </div>
      ) : (
        <p className="py-8 text-center text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
          Fim da pauta
        </p>
      )}
    </>
  );
}
