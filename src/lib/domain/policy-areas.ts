/**
 * As nove áreas de política, e como as duas casas caem nelas.
 *
 * ── Para que serve ───────────────────────────────────────────────────────────
 *
 * Duas leituras usam este mapa, e elas têm **denominadores diferentes**:
 *
 *  1. **Concordância por área** — de dois votantes, sobre os temas que ambos
 *     votaram, particionada por área. Roda sobre projetos **votados**: medidos
 *     em 24/08/2026, 228 na Câmara e 365 no Senado.
 *  2. **Distribuição de autoria** — a fatia dos projetos que o parlamentar
 *     **apresentou** em cada área. Roda sobre o acervo inteiro, que é uma ordem
 *     de grandeza maior.
 *
 * A diferença não é detalhe: uma área pode ser robusta numa leitura e escura na
 * outra. `Ciência e Tecnologia` é o caso extremo — **195 projetos apresentados
 * contra 7 votados** na Câmara. O Congresso legisla muito sobre tecnologia e
 * quase nunca a leva a voto nominal. Por isso ela não é área própria aqui: como
 * eixo de concordância ficaria permanentemente vazia.
 *
 * ── Por que nove ─────────────────────────────────────────────────────────────
 *
 * Porque nove é o que o dado sustenta, medido e não estimado. Sobre os projetos
 * votados e classificados, nenhuma das nove fica abaixo do piso de dez em
 * nenhuma das casas:
 *
 *     área             Câmara  Senado          área             Câmara  Senado
 *     Segurança            69      60          Ambiente             38      15
 *     Economia             67     167          Trabalho             34      46
 *     Direitos             59      36          Educação             32      39
 *     Gestão pública       58      64          Saúde                24      44
 *     Infraestrutura       47      30
 *
 * Um painel de quatro classificadores independentes propôs 7 e 9; o que decidiu
 * foi a medição acima. Duas fusões que pareciam necessárias caíram quando
 * medidas: **Saúde com Trabalho** (o cenário que a justificava supunha ×0,6 da
 * pauta e a suposição estava errada) e **Ambiente com Infraestrutura**.
 *
 * ── A regra que gera cada linha, e por que ela é conferível ──────────────────
 *
 * **A redação do rótulo oficial desempata**, não a nossa leitura do assunto. É
 * o que separa dois casos simétricos: `codTema 67` se chama *"**Direito** e
 * Defesa do Consumidor"* e vai para Segurança e Justiça; `codTema 74` se chama
 * *"**Política**, Partidos e Eleições"* e vai para Gestão pública. Quem tiver as
 * listas oficiais na mão confere linha a linha sem precisar concordar com o
 * gosto de ninguém.
 *
 * ── Duas armadilhas medidas, que ninguém deve reintroduzir ───────────────────
 *
 * **Nunca casar o Senado pelo nome da folha.** As folhas ambientais dele se
 * chamam `Proteção aos Animais`, `Mudanças Climáticas`, `Vegetação Nativa` —
 * nenhuma contém a palavra "ambiente". Um casamento por rótulo perdeu **90 dos
 * 125** projetos ambientais em silêncio. O Senado casa pelo **caminho da
 * hierarquia**, sempre, e é por isso que `SENADO_RULES` é uma lista ordenada de
 * prefixos e não um dicionário de rótulos.
 *
 * **`Direitos Humanos e Minorias` não é comparável entre as casas.** Na Câmara é
 * 1.605 ocorrências — 34% de todo o acervo, um guarda-chuva. No Senado o rótulo
 * de nome idêntico vale **29**, porque lá Crianças, Mulheres, PcD, Idosos e
 * Indígenas são recortados em folhas próprias (que este mapa recolhe de volta
 * para `direitos`). O eixo virá denso para deputados e magro para senadores por
 * defeito de fonte, não do mapa: **não comparar esse eixo entre casas sem
 * normalizar pela taxa-base de cada uma**, pela mesma razão que `pooling.ts` não
 * mistura casas e que §3.3 ranqueia dentro da casa.
 *
 * ── O que fica de fora, e o que ainda precisa ficar ──────────────────────────
 *
 * Saem por não serem política pública: homenagens e datas comemorativas
 * (`codTema 72`, e `Honorífico` no Senado) e o rito parlamentar (`codTema 53`, e
 * `Jurídico / Processo / Processo Legislativo`). A distinção é **rito sai,
 * instituição fica**: reforma de CPP é política pública, emenda de redação não.
 *
 * **Falta um filtro que este arquivo não faz.** `Rádio e TV` é 589 dos 2.730
 * processos do Senado — 21,6%, e 96% do ramo Comunicações — e são decretos de
 * outorga e renovação de radiodifusão, ratificados por quase unanimidade. Não
 * são de autoria parlamentar (fora da leitura 2) e não dividem a casa (inertes
 * na leitura 1), mas inflariam `infraestrutura`. O corte é por **tipo de
 * proposição**, não por rótulo, e pertence ao importador.
 */

/** As nove áreas. A chave é interna; `label` é o que a figura imprime. */
export const POLICY_AREAS = [
  { key: "saude", label: "Saúde" },
  { key: "educacao", label: "Educação e Ciência" },
  { key: "trabalho", label: "Trabalho" },
  { key: "direitos", label: "Direitos" },
  { key: "seguranca", label: "Segurança e Justiça" },
  { key: "economia", label: "Economia" },
  { key: "gestao", label: "Gestão pública" },
  { key: "ambiente", label: "Ambiente" },
  { key: "infraestrutura", label: "Infraestrutura" },
] as const;

export type PolicyArea = (typeof POLICY_AREAS)[number]["key"];

/**
 * Câmara: `codTema` → área. `null` é exclusão deliberada.
 *
 * A lista da Câmara é **plana** — um projeto carrega o código inteiro, sem
 * sub-código. Isso torna o mapa reversível por construção, e também fixa o piso
 * de granularidade do esquema: fundir códigos planos é barato, **partir um é
 * impossível**. É por isso que não existe área "Tributos": as duas casas
 * desenham essa fronteira, mas `codTema 70` se chama "Finanças Públicas **e**
 * Orçamento" e é indivisível.
 */
export const CAMARA_AREA_BY_CODE: Readonly<Record<number, PolicyArea | null>> = {
  34: "gestao", // Administração Pública
  35: "educacao", // Arte, Cultura e Religião
  37: "infraestrutura", // Comunicações
  39: "educacao", // Esporte e Lazer
  40: "economia", // Economia
  41: "infraestrutura", // Cidades e Desenvolvimento Urbano
  42: "seguranca", // Direito Civil e Processual Civil — o rótulo diz "Direito"
  43: "seguranca", // Direito Penal e Processual Penal
  44: "direitos", // Direitos Humanos e Minorias — ver a ressalva no docblock
  46: "educacao", // Educação
  48: "ambiente", // Meio Ambiente e Desenvolvimento Sustentável
  51: "ambiente", // Estrutura Fundiária
  52: "trabalho", // Previdência e Assistência Social — código atômico
  53: null, // Processo Legislativo e Atuação Parlamentar — rito
  54: "infraestrutura", // Energia, Recursos Hídricos e Minerais — energia domina
  55: "seguranca", // Relações Internacionais — as duas casas juntam com defesa
  56: "saude", // Saúde
  57: "seguranca", // Defesa e Segurança
  58: "trabalho", // Trabalho e Emprego
  60: "economia", // Turismo
  61: "infraestrutura", // Viação, Transporte e Mobilidade
  62: "educacao", // Ciência, Tecnologia e Inovação — 195 apresentados, 7 votados
  64: "ambiente", // Agricultura, Pecuária, Pesca e Extrativismo
  66: "economia", // Indústria, Comércio e Serviços
  67: "seguranca", // Direito e Defesa do Consumidor — o rótulo diz "Direito"
  68: "gestao", // Direito Constitucional
  70: "economia", // Finanças Públicas e Orçamento
  72: null, // Homenagens e Datas Comemorativas
  74: "gestao", // Política, Partidos e Eleições — o rótulo diz "Política"
  76: "seguranca", // Direito e Justiça
  85: "educacao", // Ciências Exatas e da Terra
  86: "educacao", // Ciências Sociais e Humanas
};

/**
 * Senado: prefixo do **caminho da hierarquia** → área. Primeira regra que casa
 * vence, então **as fugas vêm antes dos padrões de macro-área**.
 *
 * A ordem é a especificação. Seis das dez macro-áreas do Senado descem inteiras;
 * só `Política Social` (28% do acervo, atravessa cinco áreas) não tem padrão
 * possível e é substituída pelo mapa do nível 2.
 */
export const SENADO_RULES: ReadonlyArray<readonly [RegExp, PolicyArea | null]> = [
  // ── Exclusões, primeiro ──────────────────────────────────────────────────
  [/^Honorífico/, null],
  [/^Jurídico \/ Processo \/ Processo Legislativo/, null],

  // ── Fugas: nó cujo assunto a Câmara nomeia noutra área ───────────────────
  [/^Política Social \/ Saúde \/ Saneamento Básico/, "infraestrutura"],
  [/^Economia e Desenvolvimento \/ Agropecuária e Abastecimento/, "ambiente"],
  [/^Economia e Desenvolvimento \/ Política Fundiária/, "ambiente"],
  [/^Infraestrutura \/ Minas e Energia \/ Mineração/, "ambiente"],
  [/^Economia e Desenvolvimento \/ Ciência, Tecnologia e Inform/, "educacao"],
  [/^Jurídico \/ Direito Eleitoral/, "gestao"],
  [/^Jurídico \/ Direitos e Garantias/, "direitos"],
  [/^Jurídico \/ Direito de Trânsito/, "infraestrutura"],
  [/^Jurídico \/ Direito Empresarial/, "economia"],
  [/^Jurídico \/ Direito do Consumidor/, "seguranca"],
  [/^Organização do Estado \/ (Poder Judiciário|Funções Essenciais)/, "seguranca"],

  // ── `Política Social` não tem padrão: mapa do nível 2 ────────────────────
  [/^Política Social \/ Saúde/, "saude"],
  [/^Política Social \/ (Trabalho e Emprego|Previdência Social)/, "trabalho"],
  [
    /^Política Social \/ Proteção Social \/ (Assistência Social|Calamidade|Desenvolvimento Social)/,
    "trabalho",
  ],
  [/^Política Social \/ Proteção Social/, "direitos"],
  [/^Política Social \/ (Educação|Cultura|Desporto)/, "educacao"],
  [/^Política Social \/ (Desenvolvimento Urbano|Habitação)/, "infraestrutura"],

  // ── Macro-áreas que descem inteiras ──────────────────────────────────────
  [/^Meio Ambiente/, "ambiente"],
  [/^Infraestrutura/, "infraestrutura"],
  [/^(Economia e Desenvolvimento|Orçamento Público)/, "economia"],
  [/^(Jurídico|Soberania)/, "seguranca"],
  [/^(Administração Pública|Organização do Estado)/, "gestao"],
];

/**
 * A área de uma classificação da Câmara, pelo código oficial.
 *
 * `undefined` distingue "código que não conhecemos" de `null`, que é "código
 * conhecido e deliberadamente excluído" — a mesma disciplina que separa "não
 * medido" de "medido em zero" no resto do projeto.
 */
export function camaraArea(code: number | null | undefined): PolicyArea | null | undefined {
  if (code == null) return undefined;
  return CAMARA_AREA_BY_CODE[code];
}

/**
 * A área de uma classificação do Senado, pelo caminho da hierarquia.
 *
 * Recebe `hierarchy` e cai para `label` só quando a fonte não publicou caminho —
 * o que acontece com os rótulos "nus", que são o próprio nome da macro-área.
 */
export function senadoArea(
  hierarchy: string | null | undefined,
  label?: string | null,
): PolicyArea | null | undefined {
  const path = hierarchy?.trim() || label?.trim();
  if (!path) return undefined;
  for (const [rx, area] of SENADO_RULES) if (rx.test(path)) return area;
  return undefined;
}
