/**
 * Sobre o que o parlamentar trabalha — pela autoria, não pelo voto.
 *
 * Mesma placa da concordância por área, com o **total no lugar dos temas em
 * comum**, e é de propósito que sejam a mesma: são as duas metades da leitura
 * que substituiu o espectro. Ver `src/lib/domain/authorship.ts` para por que a
 * frase é descritiva ("dos 47 projetos que apresentou, 40% são de saúde") e
 * nunca inferencial.
 *
 * ── Coluna única, porque a coluna é de 19rem ────────────────────────────────
 *
 * A ficha é `lg:grid-cols-[1fr_19rem]` e esta placa mora na margem. Ela nasceu
 * com um grid de duas colunas próprio, o que partiu 304px em duas metades de
 * ~150 — figura minúscula, rótulos quebrando em três linhas e a lista espremida.
 * **Uma placa de margem não impõe colunas**; quem decide a largura é a ficha.
 *
 * ── A explicação mora no "?" ────────────────────────────────────────────────
 *
 * O título, a legenda e o rodapé explicavam a leitura inteira ali mesmo, e numa
 * coluna dessa largura o texto ficava mais alto que a figura que ele explicava.
 * Sobra na página só a regra que parece defeito quando não é dita — as fatias
 * somam mais de 100% —; o resto está em `AreaInfo`, ao lado do título.
 *
 * Server component: sem hooks, sem estado.
 */
import { AreaList, AreaRadar } from "@/components/public/AreaRadar";
import type { AuthorshipReading } from "@/lib/domain/authorship";

const fmt = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AreaAuthorshipPlate({
  reading,
  agentName,
}: {
  reading: AuthorshipReading;
  agentName: string;
}) {
  // Sem figura, mas a contagem continua sendo um fato publicável. A frase é o
  // que sobra, e ela é honesta de um jeito que um polígono de três projetos não
  // seria.
  if (!reading.publishable) {
    return (
      <p className="max-w-[52ch] text-sm leading-relaxed text-[var(--color-muted)]">
        {reading.total === 0
          ? `${agentName} não apresentou projetos de lei neste mandato.`
          : `${agentName} apresentou ${fmt(reading.total, "projeto", "projetos")} neste mandato — poucos para desenhar um perfil por área.`}
      </p>
    );
  }

  return (
    <div>
      <figure className="m-0">
        <div>
          <AreaRadar
            title={`Autoria por área de ${agentName}`}
            axes={reading.slices.map((s) => ({
              key: s.area,
              label: s.label,
              // Zero aqui é medido, não ausente: a varredura conta as nove
              // áreas para todo mundo. É o oposto da placa de concordância, onde
              // um eixo sem base tem de ser `null`.
              value: s.share,
            }))}
          />
        </div>

        <figcaption className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
          Fatia dos {reading.total} projetos que apresentou neste mandato. O centro é 0%, o anel
          marca 80%.
        </figcaption>
      </figure>

      <div className="mt-7">
        <AreaList
          rows={reading.slices.map((s) => ({
            key: s.area,
            label: s.label,
            value: s.share,
            note:
              s.count === 0
                ? "nenhum projeto"
                : `${fmt(s.count, "projeto", "projetos")} de ${reading.total}`,
          }))}
        />
        {/* A única coisa que continua na página, porque sem ela a lista parece
            uma soma errada: nove fatias de 102 somando 209. */}
        <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
          Um projeto conta em cada área que toca, então as fatias somam mais de 100%.
        </p>
      </div>
    </div>
  );
}
