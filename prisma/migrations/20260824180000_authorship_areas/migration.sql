-- O perfil de autoria por área: o que o parlamentar escolhe trabalhar (§3.4).
--
-- Coluna JSON e não tabela, pela mesma razão que `qualityPillars` é JSON: o
-- conjunto de áreas é um registro que pode mudar, e nada aqui é ordenável em
-- SQL — o perfil é uma forma, não uma nota. Retunar o mapa de áreas passa a ser
-- um recálculo e não uma migration.
--
-- Por que a leitura existe: votar é reagir à pauta que a Mesa montou, apresentar
-- é escolha da pessoa. Medido em 24/08/2026, a distribuição de VOTOS por área
-- varia ±5 pontos entre os 623 deputados — praticamente a mesma para todos,
-- porque é a pauta. A distribuição de AUTORIA é o traço que sobra.
--
-- Forma: { "total": 111, "byArea": { "saude": 12, "ambiente": 4, ... } }
-- `total` é o denominador e viaja junto, pela regra de §3.3: "40%" e "40% de 47
-- projetos" são afirmações diferentes.
ALTER TABLE "PublicAgent"
  ADD COLUMN IF NOT EXISTS "authorshipAreas"     JSONB,
  ADD COLUMN IF NOT EXISTS "authorshipComputedAt" TIMESTAMP(3);
