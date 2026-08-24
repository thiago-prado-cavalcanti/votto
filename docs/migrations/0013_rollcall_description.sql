-- A descrição da votação, que é o único jeito de separar mérito de rito.
--
-- Uma votação de requerimento — urgência, quebra de interstício, retirada de
-- pauta — não é posição sobre o mérito de nada; é posição sobre o ANDAMENTO, e o
-- andamento é decidido pela linha governo↔oposição quase por definição. Medido
-- em `docs/posicionamento.md`: 58,8% das votações do Plenário da Câmara em 2025
-- são procedimentais pela descrição.
--
-- Não dava para inferir isso do que já havia. `Theme.identifier` não serve
-- porque `proposicoesAfetadas` resolve para o PROJETO DE FUNDO: uma votação de
-- urgência sobre o PL X vira uma posição sobre "PL X", com identificador de
-- mérito. Medido em 24/08/2026 com `--items=policy`: de 339 itens da Câmara,
-- apenas 5 tinham identificador não-substantivo.
--
-- A descrição já vem na resposta de LISTA que `syncVotes` baixa
-- (`CamaraVotacao.descricao`), então gravá-la não custa requisição nenhuma; o
-- histórico é preenchido por `npm run redescribe`, que refaz só as chamadas de
-- lista.
ALTER TABLE "RollCall"
  ADD COLUMN IF NOT EXISTS "description" TEXT;
