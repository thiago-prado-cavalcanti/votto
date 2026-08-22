-- Search over agents, parties and themes.
--
-- The public lists needed a search box that answers the way a citizen types.
-- Two things stood between a plain `ILIKE '%…%'` and that:
--
-- 1. **Accents.** Nobody types `José Guimarães`; they type `jose guimaraes`.
--    An ILIKE against the stored name finds nothing, which reads to the citizen
--    as "this person is not on Votto".
--
-- 2. **Fields, plural.** A name lives in two columns, so `silva junior` matches
--    neither on its own. A bill is findable by its official title, by the
--    plain-language title the AI wrote, or by its official code — three columns,
--    and any OR over them is three index-less scans instead of one.
--
-- Both are answered by one folded haystack column per table, and it is a
-- GENERATED ... STORED column rather than something the application maintains.
-- That is the load-bearing choice here: `Theme.name` is written by the
-- importers, `Theme.plainTitle` by the AI pass, and both by the admin CRUD —
-- three write paths for one derived value, which is exactly the shape that
-- drifts. Postgres computes it, so it cannot. `src/lib/domain/search.ts` holds
-- the JavaScript mirror of the same folding, applied to the *query*; the two are
-- changed together or matching silently breaks.
--
-- `translate()` rather than the `unaccent` extension: unaccent is not IMMUTABLE
-- (it depends on a dictionary file), so a generated column cannot call it. An
-- explicit character map is immutable, and the alphabet it has to cover is
-- Portuguese.
--
-- The GIN trigram index is what makes the resulting `LIKE '%token%'` an index
-- scan. Note that a token under three characters cannot use it (a trigram is
-- three characters); those still match correctly, by scan. That is the accepted
-- cost of letting somebody search a party by `pt`.
--
-- Idempotent: re-running is a no-op.

-- ── Extension ────────────────────────────────────────────────────────────────
-- Wrapped, because CREATE EXTENSION needs privileges a managed instance may
-- withhold. A missing index degrades the search to a table scan; it does not
-- make it wrong, and it must not fail the deploy that carries it. The WARNING
-- below carries the statement to run by hand if that happens.

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
  RAISE WARNING 'pg_trgm unavailable: search works but scans. Run "CREATE EXTENSION pg_trgm;" as superuser, then re-run this migration.';
END $$;

-- ── Theme ────────────────────────────────────────────────────────────────────
-- The identifier goes in twice: as written ("pl 3085/2026") and with its
-- punctuation stripped ("pl30852026"), so all of `PL 3085/2026`, `3085/2026`
-- and `pl3085` reach the same bill.

ALTER TABLE "Theme" ADD COLUMN IF NOT EXISTS "searchText" TEXT
  GENERATED ALWAYS AS (
    btrim(regexp_replace(
      translate(
        lower(
          coalesce("name", '') || ' ' ||
          coalesce("plainTitle", '') || ' ' ||
          coalesce("identifier", '') || ' ' ||
          regexp_replace(coalesce("identifier", ''), '[^A-Za-z0-9]', '', 'g')
        ),
        'áàâãäåéèêëíìîïóòôõöúùûüçñý',
        'aaaaaaeeeeiiiiooooouuuucny'
      ),
      '\s+', ' ', 'g'))
  ) STORED;

-- ── PublicAgent ──────────────────────────────────────────────────────────────
-- The party is NOT folded in here: a generated column may only read its own
-- row, and copying it would mean a party rename had to cascade across the whole
-- bench. The agents search matches `Party."searchText"` through the relation
-- instead, so a rename is live the moment Postgres regenerates one row.

ALTER TABLE "PublicAgent" ADD COLUMN IF NOT EXISTS "searchText" TEXT
  GENERATED ALWAYS AS (
    btrim(regexp_replace(
      translate(
        lower(coalesce("firstName", '') || ' ' || coalesce("lastName", '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñý',
        'aaaaaaeeeeiiiiooooouuuucny'
      ),
      '\s+', ' ', 'g'))
  ) STORED;

-- ── Party ────────────────────────────────────────────────────────────────────
-- Acronym first: it is what people search a party by, and it is the party's
-- identity across houses (CLAUDE.md §8).

ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "searchText" TEXT
  GENERATED ALWAYS AS (
    btrim(regexp_replace(
      translate(
        lower(coalesce("acronym", '') || ' ' || coalesce("name", '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñý',
        'aaaaaaeeeeiiiiooooouuuucny'
      ),
      '\s+', ' ', 'g'))
  ) STORED;

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Created through EXECUTE so the `gin_trgm_ops` opclass is only resolved when
-- the extension is actually there; without it the statement would fail to parse.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Theme_searchText_idx" ON "Theme" USING GIN ("searchText" gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "PublicAgent_searchText_idx" ON "PublicAgent" USING GIN ("searchText" gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Party_searchText_idx" ON "Party" USING GIN ("searchText" gin_trgm_ops)';
  END IF;
END $$;
