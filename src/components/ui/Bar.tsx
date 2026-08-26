/**
 * A barra de medida — uma só, para todo o sistema.
 *
 * ── Por que ela existe ──────────────────────────────────────────────────────
 *
 * Havia sete, escritas à mão em sete arquivos, e elas tinham divergido em três
 * alturas (6px, 7px, 8px) e três arredondamentos (nenhum, `rounded-[2px]`,
 * `rounded-r-[4px]`). Nenhuma dessas diferenças significava coisa alguma: eram o
 * resultado de cada placa ter sido escrita num dia diferente. Numa página que
 * empilha quatro leituras numa coluna, a variação aparece — o leitor compara
 * formas, e formas diferentes sugerem grandezas diferentes.
 *
 * ── O formato é fixo; a cor, não ────────────────────────────────────────────
 *
 * Altura e cantos são a **gramática**: 6px, esquadria viva. Papel dobra, não
 * arredonda (§9), e uma medida com cantos redondos parece pílula de painel de
 * controle, não régua de documento. A cor é **semântica** e varia de propósito —
 * tinta para governismo, pigmento de voto para a cédula, a escala de tom para
 * alinhamento —, porque ali a diferença quer dizer alguma coisa.
 *
 * ── Segmentos, e não uma barra por opção ────────────────────────────────────
 *
 * A cédula precisa de três fatias contíguas separadas por uma dobra de 1px; as
 * demais leituras têm uma fatia só. É a mesma barra: uma leitura simples é o
 * caso de um segmento. Manter as duas formas no mesmo componente é o que garante
 * que a cédula e o índice fiquem com a mesma espessura.
 */
import type { CSSProperties } from "react";

/** 6px. A altura de toda barra de medida do sistema. */
export const BAR_HEIGHT = "h-1.5";

export interface BarSegment {
  /** Chave estável para a lista. */
  key: string;
  /** Largura em porcentagem da trilha, 0–100. */
  width: number;
  /** Cor CSS do preenchimento. Use `className` para cor vinda do tema. */
  color?: string;
  /** Classe de fundo, quando a cor é um token do Tailwind (`bg-navy-900`). */
  className?: string;
}

export function Bar({
  segments,
  /** Classe de fundo da trilha vazia. */
  track = "bg-navy-200",
  /** `true` insere a dobra de 1px entre segmentos — a cédula usa. */
  divided = false,
  /** Anima a partir da esquerda quando o bloco entra (`.vt-grow`). */
  grow = true,
  /**
   * Vai no elemento que CRESCE, não na trilha — é ele que carrega o `--vt-d`,
   * e `.vt-grow` é um `scaleX` a partir da esquerda: aplicado ao invólucro,
   * arrasta os segmentos junto, que é o comportamento certo tanto para uma
   * leitura simples quanto para a cédula de três fatias.
   */
  style,
}: {
  segments: BarSegment[];
  track?: string;
  divided?: boolean;
  grow?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={`${BAR_HEIGHT} w-full overflow-hidden ${track}`}>
      <div
        className={`${grow ? "vt-grow " : ""}flex h-full w-full${divided ? " gap-px" : ""}`}
        style={style}
      >
        {segments.map((s) => (
          <div
            key={s.key}
            className={s.className}
            style={{ width: `${Math.max(0, Math.min(100, s.width))}%`, background: s.color }}
          />
        ))}
      </div>
    </div>
  );
}
