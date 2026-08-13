-- 0004 — Curated party logos
--
-- Point every party at the curated SVG in `public/logos/partidos/` instead of
-- the Câmara's `.gif`, which is the acronym set in plain type for most parties
-- (and which the Senado does not publish at all).
--
-- Readable mirror of `prisma/migrations/20260812000000_party_logos/`, which is
-- what actually runs: the deploy workflow applies `prisma migrate deploy` before
-- the new image serves traffic, so this reaches production on a plain `git push`
-- and needs no manual step. Run it by hand only to catch up a local database.
--
-- No schema change: `Party.logoUrl` already exists, only its values change.
-- Nothing here is destructive — re-running is a no-op — and future imports keep
-- these values because `upsertParty` applies the same map
-- (`src/lib/integration/party-logos.ts`); this statement only catches up rows
-- that were imported before that map existed.
--
-- Provenance and licence of each file: `docs/logos-partidos.md`.

UPDATE "Party" AS p
   SET "logoUrl"   = m.logo,
       "updatedAt" = NOW()
  FROM (VALUES
    -- acronym as the houses publish it   logo path
    ('AVANTE',            '/logos/partidos/avante.svg'),
    ('CIDADANIA',         '/logos/partidos/cidadania.svg'),
    ('PPS',               '/logos/partidos/cidadania.svg'),        -- renamed to Cidadania
    ('DC',                '/logos/partidos/dc.svg'),
    ('MDB',               '/logos/partidos/mdb.svg'),
    ('PMDB',              '/logos/partidos/mdb.svg'),              -- renamed to MDB
    ('MISSÃO',            '/logos/partidos/missao.svg'),
    ('MISSAO',            '/logos/partidos/missao.svg'),
    ('NOVO',              '/logos/partidos/novo.svg'),
    ('PCDOB',             '/logos/partidos/pcdob.svg'),
    ('PC DO B',           '/logos/partidos/pcdob.svg'),
    ('PDT',               '/logos/partidos/pdt.svg'),
    ('PL',                '/logos/partidos/pl.svg'),
    ('PODE',              '/logos/partidos/pode.svg'),
    ('PODEMOS',           '/logos/partidos/pode.svg'),             -- Senado's spelling
    ('PP',                '/logos/partidos/pp.svg'),
    ('PROGRESSISTAS',     '/logos/partidos/pp.svg'),
    ('PRD',               '/logos/partidos/prd.svg'),
    ('PSB',               '/logos/partidos/psb.svg'),
    ('PSD',               '/logos/partidos/psd.svg'),
    ('PSDB',              '/logos/partidos/psdb.svg'),
    ('PSOL',              '/logos/partidos/psol.svg'),
    ('PT',                '/logos/partidos/pt.svg'),
    ('PV',                '/logos/partidos/pv.svg'),
    ('REDE',              '/logos/partidos/rede.svg'),
    ('REPUBLICANOS',      '/logos/partidos/republicanos.svg'),
    ('PRB',               '/logos/partidos/republicanos.svg'),     -- renamed to Republicanos
    ('SOLIDARIEDADE',     '/logos/partidos/solidariedade.svg'),
    ('SD',                '/logos/partidos/solidariedade.svg'),
    ('UNIÃO',             '/logos/partidos/uniao.svg'),
    ('UNIAO',             '/logos/partidos/uniao.svg'),
    ('UNIÃO BRASIL',      '/logos/partidos/uniao.svg'),
    ('UB',                '/logos/partidos/uniao.svg')
  ) AS m(acronym, logo)
 WHERE upper(btrim(p."acronym")) = m.acronym
   AND p."logoUrl" IS DISTINCT FROM m.logo;

-- Check: every party should now carry a /logos/partidos/ path. Any row still
-- pointing at camara.leg.br (or at NULL) is a party with no curated mark yet —
-- add it to src/lib/integration/party-logos.ts and re-run.
SELECT "acronym", "name", "logoUrl"
  FROM "Party"
 WHERE "logoUrl" IS NULL
    OR "logoUrl" NOT LIKE '/logos/partidos/%'
 ORDER BY "acronym";
