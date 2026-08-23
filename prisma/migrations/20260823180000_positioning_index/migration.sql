-- 0011 — Índice de Posicionamento reconstruído (CLAUDE.md §3.2)
--
-- Três coisas entram:
--
--   1. A leitura por eixo, gravada por agente e por partido, porque o índice
--      virou um LOTE. Pesar um tema pela discriminação que ele teve exige a
--      divisão de toda a casa naquela votação, e encolher um partido em direção
--      à média exige a distribuição de todos os partidos — nada disso se calcula
--      olhando uma pessoa, que é a mesma razão pela qual `metrics:quality` é um
--      job e `Theme.priority` não é.
--
--   2. `governismo` por agente. A primeira dimensão das votações nominais
--      brasileiras é governo↔oposição, não esquerda↔direita (Zucco & Lauderdale,
--      LSQ 36(3), 2011). Sem medir isso não há como afirmar que o eixo econômico
--      não é ela com outro nome — e medido cru, o primeiro componente principal
--      correlaciona −0,96 com governismo e +0,49 com a escala do BLS.
--
--   3. A orientação dos blocos `Governo` e `Oposição` por votação, que é o
--      insumo de (2) e o desconto item a item de (1).
--
-- Todas as colunas são anuláveis e sem default: "não medido" tem de continuar
-- distinguível de "medido em zero", que no eixo econômico é a coordenada de um
-- centrista perfeito.
--
-- Idempotente: pode rodar de novo sem efeito.

ALTER TABLE "PublicAgent"
  ADD COLUMN IF NOT EXISTS "positionEconomic"   INTEGER,
  ADD COLUMN IF NOT EXISTS "positionSocial"     INTEGER,
  ADD COLUMN IF NOT EXISTS "positionDetail"     JSONB,
  ADD COLUMN IF NOT EXISTS "positionComputedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "governismo"         INTEGER;

ALTER TABLE "Party"
  ADD COLUMN IF NOT EXISTS "positionEconomic"   INTEGER,
  ADD COLUMN IF NOT EXISTS "positionSocial"     INTEGER,
  ADD COLUMN IF NOT EXISTS "positionDetail"     JSONB,
  ADD COLUMN IF NOT EXISTS "positionComputedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cohesion"           INTEGER;

ALTER TABLE "RollCall"
  ADD COLUMN IF NOT EXISTS "governmentPosition" "VoteValue",
  ADD COLUMN IF NOT EXISTS "oppositionPosition" "VoteValue";

-- Listas ordenam por posição em SQL, como já fazem por `qualityScore`.
CREATE INDEX IF NOT EXISTS "PublicAgent_positionEconomic_idx"
  ON "PublicAgent" ("positionEconomic");
