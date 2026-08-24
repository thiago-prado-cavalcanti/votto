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

// ─── O que a votação decidiu, pela descrição ─────────────────────────────────

/**
 * Objetos de votação que são **rito**, não mérito.
 *
 * Vêm da forma real das descrições da Câmara, que são a *frase de resultado* e
 * não um rótulo de tipo — `"Aprovado o Requerimento nº 4.491/2024, dos Senhores
 * Líderes, que solicita a quebra de interstício de 5 sessões"`. O que decide é o
 * **objeto**, e ele vem logo depois do verbo.
 *
 * `Redação Final` entra porque é formalidade de texto já aprovado, e na prática
 * `MIN_DISCRIMINATION` já a descartaria por ser quase sempre unânime — mas
 * classificá-la é mais honesto que deixá-la passar por acidente aritmético.
 */
const PROCEDURAL_OBJECTS = [
  "requerimento",
  "prefer[êe]ncia",
  "reda[çc][ãa]o final",
  "inters[tí]cio",
  "quest[ãa]o de ordem",
  "invers[ãa]o de pauta",
  "adiamento",
  "urg[êe]ncia",
  "retirada de pauta",
  "encerramento da discuss[ãa]o",
  "prorroga[çc][ãa]o da sess[ãa]o",
];

/**
 * Ancorado no COMEÇO da frase, e a âncora é o ponto todo.
 *
 * `isDeliberativeSession` é o precedente: um `includes` ingênuo deixou passar 59
 * sessões solenes porque `"Sessão Não Deliberativa Solene"` contém
 * `"Deliberativa"`. Aqui o risco simétrico é um projeto **sobre** requerimentos,
 * ou um substitutivo cuja ementa cite urgência — casos em que a palavra aparece
 * longe do verbo.
 *
 * Por isso: verbo de resultado, depois no máximo ~40 caracteres (que acomodam
 * `", em segundo turno,"` e afins), e só então o objeto. Um `"Aprovado o
 * Substitutivo ao Projeto de Lei nº 1.822, de 2024, adotado pelo relator…"` não
 * casa, e um `"Aprovada a preferência"` casa.
 */
const PROCEDURAL_RE = new RegExp(
  String.raw`^\s*(?:aprovad|rejeitad|retirad|prejudicad|mantid)[oa]s?\b[^.]{0,40}?\b(?:` +
    PROCEDURAL_OBJECTS.join("|") +
    String.raw`)\b`,
  "i",
);

/**
 * Se a votação decidiu **andamento** e não conteúdo.
 *
 * Uma votação de requerimento não é posição sobre o mérito de nada, e no Brasil
 * o andamento se decide pela linha governo↔oposição quase por definição: quem
 * quer que o projeto ande vota urgência e quem não quer vota contra,
 * independentemente do que o projeto diz. `docs/posicionamento.md` mede **58,8%
 * das votações do Plenário da Câmara em 2025** como procedimentais.
 *
 * **Descrição ausente devolve `false`** — "não sei" não é "é rito". Descartar por
 * omissão apagaria todo o histórico ainda não preenchido por `npm run
 * redescribe`, que é o oposto do que se quer.
 *
 * `"Mantido o texto"` é MÉRITO: é voto de destaque, sobre qual dispositivo
 * sobrevive. Foi o caso que mais me fez errar ao adivinhar o vocabulário antes
 * de olhar as descrições reais.
 */
export function isProceduralVote(description: string | null | undefined): boolean {
  if (!description) return false;
  return PROCEDURAL_RE.test(description);
}
