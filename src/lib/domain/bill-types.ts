/**
 * Que tipo de proposição uma votação nominal decidiu, a partir do identificador.
 *
 * ── Por que isto entra no índice de posicionamento ───────────────────────────
 *
 * Uma votação de **requerimento** — urgência, quebra de interstício, retirada de
 * pauta, adiamento — não é uma posição sobre o mérito de nada. É uma posição
 * sobre o *andamento*, e no Brasil o andamento é decidido pela linha
 * governo↔oposição quase por definição: quem quer que o projeto ande vota
 * urgência, quem não quer vota contra, independentemente do que o projeto diz.
 *
 * Enquanto a matriz vinha só dos temas que a IA classificara, isso não aparecia:
 * ela já marcava `scoreable: false` nesses casos. Ao soltar o filtro de tag para
 * o estimador de recuperação (que não precisa de tag para nada), a Câmara foi de
 * 217 para 339 itens e os 122 novos nunca passaram por classificador nenhum.
 * `docs/posicionamento.md` mede **58,8% das votações do Plenário da Câmara em
 * 2025 como procedimentais por descrição**, então é uma fatia grande o bastante
 * para diluir o eixo.
 *
 * ── O que este filtro alcança, e o que não ───────────────────────────────────
 *
 * Alcança a votação cujo objeto resolvido é o próprio requerimento — que é o
 * caso comum, porque `proposicoesAfetadas` aponta para o REQ. **Não alcança** a
 * votação procedimental cujo objeto é o projeto de fundo (destaques votados em
 * globo, por exemplo): essa continua entrando como se fosse posição sobre o
 * mérito. É filtro parcial, e o número de itens descartados é impresso para que
 * o tamanho do que sobra seja visível.
 */

/**
 * Tipos que carregam política, e não andamento.
 *
 * Mesma lista que `POLICY_TYPES` em `src/lib/integration/camara.ts` usa para
 * decidir o que vale importar, aqui pelo mesmo motivo e aplicada ao outro
 * extremo do pipeline. `PLV` e `PLN` entram porque são lei convertida e crédito
 * orçamentário — mérito, não rito.
 */
export const POLICY_BILL_TYPES: readonly string[] = [
  "PL",
  "PLP",
  "PEC",
  "MPV",
  "PDL",
  "PLV",
  "PLN",
  // Nome antigo do decreto legislativo na Câmara, ainda presente no acervo.
  "PDC",
  // Senado: mesma ideia, vocabulário próprio.
  "PLS",
  "PLC",
  "PDS",
  "PRS",
] as const;

/**
 * O tipo no começo de um identificador — `"PL 3085/2026"` → `"PL"`.
 *
 * Devolve `null` quando o identificador não começa por uma sigla, o que inclui o
 * caso `"Proposição 12345"` que os importadores usam quando a fonte não publica
 * identificação. Um tema assim **não** é admitido: não dá para afirmar que ele é
 * mérito, e admitir por omissão é como o rito entrou aqui em primeiro lugar.
 */
export function billType(identifier: string | null | undefined): string | null {
  const match = /^\s*([A-Za-zÀ-ÿ]{2,4})\s*[\s.º°-]*\d/.exec(identifier ?? "");
  return match ? match[1].toUpperCase() : null;
}

/** Se a proposição decide política e não andamento. */
export function isPolicyBill(identifier: string | null | undefined): boolean {
  const type = billType(identifier);
  return type !== null && POLICY_BILL_TYPES.includes(type);
}
