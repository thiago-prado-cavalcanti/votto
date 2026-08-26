/**
 * Alinhamento com o governo, na ficha de um agente.
 *
 * Publica sozinho e sem portão, o que é o ponto: os três testes do §3.2 decidem
 * se os eixos esquerda↔direita podem ser afirmados, e enquanto eles não passam a
 * ficha ficava sem nenhuma leitura de posição. Esta não depende deles porque não
 * é uma inferência — é a contagem das votações em que o parlamentar seguiu a
 * orientação do bloco `Governo`, publicada pela própria casa.
 *
 * ── Por que ela lidera a seção ──────────────────────────────────────────────
 *
 * Enquanto os eixos não passam nos portões, esta **é** a leitura de posição da
 * ficha — não um complemento dela. Vinha impressa em corpo pequeno abaixo de um
 * aviso de ausência, o que invertia os papéis: a coisa que a plataforma mede
 * aparecia como rodapé da coisa que ela não mede. Agora ocupa a placa inteira,
 * na mesma gramática de `ReadingPlate` (régua de 2px, versalete, numeral serifado
 * grande).
 *
 * **Com uma diferença deliberada: o numeral não muda de cor.** `ReadingPlate`
 * tinge o número pela escala de tom, porque ali mais é melhor. Aqui não existe
 * melhor — 80% e 20% são posições, não notas —, e pigmentar seria a mesma
 * acusação que a proibição de faixas e adjetivos existe para evitar.
 *
 * Três decisões de apresentação, e cada uma responde a um jeito de mentir:
 *
 * - **Sem faixa e sem adjetivo.** Nada de "governista" — palavra carregada, que
 *   transformaria uma contagem numa acusação. O que se mostra é o número.
 * - **O denominador ao lado, sempre.** "78%" e "78% de 312 votações" são
 *   afirmações diferentes; imprimir só a primeira é afirmar a segunda. Mesma
 *   disciplina da performance política.
 * - **A ressalva impressa, não escondida num tooltip.** Oposição pela esquerda e
 *   pela direita marcam igual aqui, e quem lê tem direito de saber disso na
 *   mesma tela em que lê o número — senão a página deixa o leitor concluir
 *   "ideologia" por conta própria, que é o erro que o índice se recusou a
 *   cometer na matemática.
 *
 * Server-component friendly (sem hooks de cliente).
 */
import { Bar } from "@/components/ui/Bar";
import {
  describeGovernismo,
  GOVERNISMO_POLES,
  type GovernismoReading as Reading,
} from "@/lib/domain/governismo";

export function GovernismoReading({ reading }: { reading: Reading | null }) {
  if (!reading) {
    return (
      <figure className="border-t-2 border-navy-900">
        <figcaption className="pb-3 pt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          {GOVERNISMO_POLES.high}
        </figcaption>
        <p className="border-t border-line py-4 text-sm leading-relaxed text-[var(--color-muted)]">
          A casa não publica orientação de bancada nas votações deste mandato, ou não houve
          votações suficientes para medir.
        </p>
      </figure>
    );
  }

  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="pb-3 pt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
        {GOVERNISMO_POLES.high}
      </figcaption>

      <div className="border-t border-line py-4">
        <div className="vt-num vt-fade text-[2.7rem] leading-none text-navy-900">
          {reading.value}%
        </div>

        {/* Barra em tinta, sem pigmento de voto: isto não é um placar de sim/não,
            e usar as cores da cédula sugeriria um julgamento que não existe aqui. */}
        <div className="mt-3">
          <Bar
            track="bg-[var(--color-line)]"
            segments={[{ key: "gov", width: reading.value, className: "bg-navy-900" }]}
          />
        </div>

        <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
          {describeGovernismo(reading)}
        </p>

        <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
          Mede apoio ao Executivo, <strong className="font-medium text-ink">não ideologia</strong>:
          quem se opõe pela esquerda e quem se opõe pela direita aparecem igual aqui.
        </p>
      </div>
    </figure>
  );
}
