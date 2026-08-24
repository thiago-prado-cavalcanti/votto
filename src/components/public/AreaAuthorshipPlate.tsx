/**
 * Sobre o que o parlamentar trabalha — pela autoria, não pelo voto.
 *
 * Mesma placa da concordância por área, com o **total no lugar dos temas em
 * comum**, e é de propósito que sejam a mesma: são as duas metades da leitura
 * que substituiu o espectro. Ver `src/lib/domain/authorship.ts` para por que a
 * frase é descritiva ("dos 47 projetos que apresentou, 40% são de saúde") e
 * nunca inferencial.
 *
 * ── O rótulo carrega a leitura ──────────────────────────────────────────────
 *
 * Foi a primeira coisa a dar errado no protótipo da placa irmã: sem título,
 * quem via supunha que o eixo media dedicação ao assunto. Aqui ele **mede**
 * dedicação — e o risco se inverte, porque a mesma figura passa a poder ser
 * lida como concordância. As duas nunca aparecem sem o título que as separa.
 *
 * ── As fatias não somam 100% ────────────────────────────────────────────────
 *
 * `codTema` faz união e um projeto de saneamento é saúde e infraestrutura ao
 * mesmo tempo. O rodapé diz isso, porque um leitor que somar vai chegar a mais
 * de cem e concluir que a conta está errada.
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

  const withCount = reading.slices.filter((s) => s.count > 0).length;

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-center">
      <figure className="m-0">
        <p className="text-[1.05rem] leading-snug text-navy-900">
          Sobre o que {agentName} legisla
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
          Cada eixo é a fatia dos {reading.total} projetos que ele apresentou neste mandato — o que
          ele escolheu propor, não como votou o que os outros propuseram.
        </p>

        <div className="mt-4">
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

        <figcaption className="mt-4 max-w-[46ch] text-xs leading-relaxed text-[var(--color-muted)]">
          O centro é 0% e o anel marca 80%. Um projeto pode tocar mais de uma área — saneamento é
          saúde e infraestrutura —, então as fatias somam mais de 100%.
        </figcaption>
      </figure>

      <div>
        <h3 className="mb-4 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
          Autoria, projeto a projeto
        </h3>
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
        <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
          {fmt(reading.total, "projeto", "projetos")} apresentados neste mandato, em{" "}
          {fmt(withCount, "área", "áreas")}. Contagem da Câmara, não estimativa.
        </p>
      </div>
    </div>
  );
}
