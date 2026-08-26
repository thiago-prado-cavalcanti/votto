-- Colapsa partidos duplicados: o mesmo partido importado duas vezes sob siglas
-- diferentes pelas duas casas.
--
-- ── O caso concreto ─────────────────────────────────────────────────────────
--
-- A Câmara escreve `PODE` e o Senado escreve `PODEMOS`. As duas concordam no
-- nome completo ("Podemos"), e é por isso que `resolvePartyIdByAcronym` desempata
-- por nome — mas só consulta por nome quando ele DIFERE da sigla. O job de votos
-- do Senado chamava o resolvedor passando a própria sigla no lugar do nome
-- (`upsertPastSenator`, que não tinha o mapa à mão), o que desligava o desempate
-- e criava um segundo partido. Resultado medido em 24/08/2026: 27 deputados num
-- "Podemos" e 3 senadores noutro.
--
-- Não é cosmético. Coesão, alinhamento por partido e o encolhimento empírico de
-- Bayes em `pooling.ts` leem a bancada inteira; com ela partida em duas, os três
-- descrevem partidos que não existem.
--
-- ── Por que uma migration, se o código já se autocura ───────────────────────
--
-- `mergeDuplicateParties()` roda ao fim do sync de partidos das duas casas e
-- resolveria isto — na próxima vez que esse job rodar, o que pode levar uma
-- semana. Uma migration conserta no deploy, que é o procedimento único de
-- atualização (§5), e não deixa o índice publicando uma bancada partida nesse
-- intervalo.
--
-- ── A regra é a mesma dos dois lados ────────────────────────────────────────
--
-- O agrupamento é pelo NOME dobrado, exatamente como `foldName()` em
-- `src/lib/integration/importer.ts`: minúsculas, acentos removidos, só
-- alfanuméricos. `translate()` e não a extensão `unaccent`, pelo mesmo motivo
-- documentado em 0010: `unaccent` não é IMMUTABLE.
--
-- Idempotente: sem duplicados, não faz nada. Sobrevivente é o mais antigo, que é
-- aquele para o qual os `kid` públicos já apontam.

DO $$
DECLARE
  grupo   RECORD;
  vitima  RECORD;
BEGIN
  FOR grupo IN
    SELECT
      regexp_replace(
        translate(lower(coalesce("name", '')),
                  'áàâãäåéèêëíìîïóòôõöúùûüçñý',
                  'aaaaaaeeeeiiiiooooouuuucny'),
        '[^a-z0-9]', '', 'g') AS chave,
      (array_agg("id" ORDER BY "createdAt" ASC, "id" ASC))[1] AS sobrevivente
    FROM "Party"
    GROUP BY 1
    HAVING count(*) > 1 AND regexp_replace(
        translate(lower(coalesce("name", '')),
                  'áàâãäåéèêëíìîïóòôõöúùûüçñý',
                  'aaaaaaeeeeiiiiooooouuuucny'),
        '[^a-z0-9]', '', 'g') <> ''
  LOOP
    FOR vitima IN
      SELECT "id" FROM "Party"
      WHERE "id" <> grupo.sobrevivente
        AND regexp_replace(
              translate(lower(coalesce("name", '')),
                        'áàâãäåéèêëíìîïóòôõöúùûüçñý',
                        'aaaaaaeeeeiiiiooooouuuucny'),
              '[^a-z0-9]', '', 'g') = grupo.chave
    LOOP
      UPDATE "PublicAgent" SET "partyId" = grupo.sobrevivente WHERE "partyId" = vitima.id;
      DELETE FROM "Party" WHERE "id" = vitima.id;
    END LOOP;
  END LOOP;
END $$;

-- O sobrevivente acabou de absorver a bancada do duplicado; sem isto a contagem
-- denormalizada ficaria defasada até o próximo import de agentes.
UPDATE "Party" p
SET "agentCount" = sub.total
FROM (
  SELECT "partyId" AS id, count(*)::int AS total
  FROM "PublicAgent"
  WHERE "partyId" IS NOT NULL AND "inOffice" = true AND "status" = 'ACTIVE'
  GROUP BY "partyId"
) sub
WHERE p."id" = sub.id AND p."agentCount" IS DISTINCT FROM sub.total;

UPDATE "Party" SET "agentCount" = 0
WHERE "agentCount" <> 0
  AND NOT EXISTS (
    SELECT 1 FROM "PublicAgent" a
    WHERE a."partyId" = "Party"."id" AND a."inOffice" = true AND a."status" = 'ACTIVE'
  );
