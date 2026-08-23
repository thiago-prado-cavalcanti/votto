/**
 * Alinhamento com o governo, na ficha de um agente.
 *
 * Publica sozinho e sem portão, o que é o ponto: os três testes do §3.2 decidem
 * se os eixos esquerda↔direita podem ser afirmados, e enquanto eles não passam a
 * ficha ficava sem nenhuma leitura de posição. Esta não depende deles porque não
 * é uma inferência — é a contagem das votações em que o parlamentar seguiu a
 * orientação do bloco `Governo`, publicada pela própria casa.
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
import {
  describeGovernismo,
  GOVERNISMO_POLES,
  type GovernismoReading as Reading,
} from "@/lib/domain/governismo";

export function GovernismoReading({ reading }: { reading: Reading | null }) {
  if (!reading) {
    return (
      <p className="border-t border-line py-3 text-xs text-[var(--color-muted)]">
        Sem leitura: a casa não publica orientação de bancada nas votações deste
        mandato, ou não houve votações suficientes para medir.
      </p>
    );
  }

  return (
    <div className="border-t border-line py-3">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-xs text-[var(--color-muted)]">
          {GOVERNISMO_POLES.low} ↔ {GOVERNISMO_POLES.high}
        </dt>
        <dd className="vt-num text-[1.05rem] leading-none text-navy-900">{reading.value}%</dd>
      </div>

      {/* Barra em tinta, sem pigmento de voto: isto não é um placar de sim/não,
          e usar as cores da cédula sugeriria um julgamento que não existe aqui. */}
      <div className="mt-2 h-1 w-full bg-[var(--color-line)]">
        <div
          className="h-full bg-navy-900"
          style={{ width: `${reading.value}%` }}
          role="presentation"
        />
      </div>

      <p className="mt-1.5 text-[0.7rem] leading-relaxed text-[var(--color-muted)]">
        {describeGovernismo(reading)}
      </p>

      <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--color-muted)]">
        Mede apoio ao Executivo, <strong className="font-medium text-ink">não ideologia</strong>:
        quem se opõe pela esquerda e quem se opõe pela direita aparecem igual aqui.
      </p>
    </div>
  );
}
