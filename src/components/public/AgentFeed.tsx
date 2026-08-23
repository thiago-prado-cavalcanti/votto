"use client";

/**
 * The agents list, continued as the citizen scrolls.
 *
 * Twin of `ThemeFeed`, and it exists for a measured reason: the page rendered
 * all 594 sitting members at once, which was 2.5 MB of HTML on production
 * against 125 KB for the parties list. The server now renders the first page and
 * this appends the rest, so the document the browser parses is a tenth of what
 * it was and the DOM grows only as far as somebody actually scrolls.
 *
 * Degrades to a link. Until the component hydrates — and forever, with
 * JavaScript off — "Ver mais" is an ordinary `?p=` navigation to a page the
 * server renders in full, which is the same address the sentinel would have
 * fetched. Nothing here is the only way to reach a row.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AgentCard } from "@/components/public/AgentCard";
import { loadMoreAgents } from "@/lib/actions/agents";
import type { AgentListQuery, AgentRow } from "@/lib/domain/agent-list";

/** How far ahead of the sentinel to start fetching. */
const PREFETCH_MARGIN = "600px";

/** `true` once mounted on the client, without tripping hydration. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function AgentFeed({
  query,
  startPage,
  initialHasMore,
  isAuthenticated,
  children,
}: {
  query: AgentListQuery;
  /** 1-based index of the page rendered on the server, from `?p=`. */
  startPage: number;
  initialHasMore: boolean;
  isAuthenticated: boolean;
  /** The page rendered on the server. */
  children: React.ReactNode;
}) {
  const [pages, setPages] = useState<AgentRow[][]>([]);
  const [nextPage, setNextPage] = useState(startPage + 1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const ready = useHydrated();
  const sentinel = useRef<HTMLDivElement | null>(null);

  const loadNext = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setFailed(false);
    try {
      const result = await loadMoreAgents(query, nextPage);
      setPages((previous) => [...previous, result.rows]);
      setNextPage(result.page + 1);
      setHasMore(result.hasMore);
    } catch {
      // Kept generic: the citizen can continue by navigating, and the reason
      // belongs in the server log rather than on the page.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [hasMore, loading, nextPage, query]);

  useEffect(() => {
    // A failed page waits for a deliberate retry rather than re-arming over a
    // source that is refusing.
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
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {children}
        {pages.flatMap((rows, pageIndex) =>
          rows.map((row, i) => (
            <AgentCard
              key={row.agent.kid}
              agent={row.agent}
              alignment={isAuthenticated ? row.alignment : null}
              engagement={row.engagement}
              base={row.base}
              quality={row.quality}
              follow={row.follow}
              delay={pageIndex === 0 && i < 3 ? i * 80 : 0}
            />
          )),
        )}
      </div>

      {hasMore ? (
        <div ref={sentinel} className="flex justify-center py-8">
          {!ready || failed ? (
            <div className="text-center">
              {failed ? (
                <p className="mb-3 text-sm text-[var(--color-muted)]">
                  Não foi possível carregar mais agentes. Continue pela página seguinte.
                </p>
              ) : null}
              <Link
                href={moreHref}
                // After a failure this stays a real link on purpose: a server
                // action's id is scoped to the build that produced it, so a tab
                // left open across a release can never reach the new one by
                // retrying in place. Navigating replaces the bundle that broke.
                onClick={
                  ready && !failed
                    ? (event) => {
                        event.preventDefault();
                        void loadNext();
                      }
                    : undefined
                }
                className="inline-flex h-11 items-center rounded-card border border-navy-300 bg-transparent px-5 text-sm font-semibold text-navy-900 transition-colors hover:border-navy-900 hover:bg-navy-100"
              >
                Ver mais agentes
              </Link>
            </div>
          ) : (
            <span className="text-sm text-[var(--color-muted)]">
              {loading ? "Carregando…" : ""}
            </span>
          )}
        </div>
      ) : null}
    </>
  );
}
