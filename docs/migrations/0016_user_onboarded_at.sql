-- O estado do primeiro acesso guiado.
--
-- Coluna e não claim de sessão: "já mostramos isto" precisa sobreviver ao
-- logout e à troca de aparelho. Guardado na sessão, o onboarding reapareceria a
-- cada entrada e deixaria de ser um convite para virar um anúncio.
--
-- NULL é "ainda não passou por ele", e é por isso que é uma data anulável e não
-- um booleano: a data responde também "quando", que é o que permite medir
-- conclusão sem uma segunda coluna. Quem dispensa o fluxo também recebe a marca
-- — dispensar é uma resposta, e insistir seria não tê-la ouvido.
--
-- Nenhum backfill: todo cidadão já cadastrado fica com NULL e será convidado uma
-- vez. É o comportamento desejado, não um efeito colateral.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardedAt" TIMESTAMP(3);
