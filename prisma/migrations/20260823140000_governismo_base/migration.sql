-- 0012 — Denominador do governismo (CLAUDE.md §3.2)
--
-- `PublicAgent.governismo` guarda a fatia das votações em que o agente votou
-- com a orientação do bloco `Governo`, mas não guardava sobre quantas. Sem o
-- denominador a leitura não pode ser publicada: "78%" e "78% de 312 votações"
-- são afirmações diferentes, e só a segunda é conferível. É a mesma regra que a
-- performance política já segue ao imprimir "92% · 312 de 340 votações".
--
-- Anulável e sem default, como as outras colunas de índice: "não medido" tem de
-- continuar distinguível de "medido em zero" — e zero, aqui, é uma oposição
-- perfeita, que é uma afirmação forte sobre uma pessoa nomeada.
--
-- Idempotente: pode rodar de novo sem efeito.

ALTER TABLE "PublicAgent"
  ADD COLUMN IF NOT EXISTS "governismoBase" INTEGER;
