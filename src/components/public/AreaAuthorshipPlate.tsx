/**
 * "Propostas": sobre o que o parlamentar trabalha, pela autoria e não pelo voto.
 *
 * O nome é o **denominador**, que é como esta leitura se defende: conta o que a
 * pessoa protocolou (`idDeputadoAutor`), e nada mais. Relatoria fica de fora de
 * propósito — relatar é encargo distribuído pela Casa, não escolha —, e por isso
 * o recorte é diferente do da lista "Temas de autoria e relatoria" na mesma
 * ficha. "Proposta" e não "projeto" porque PDL não é projeto de lei.
 *
 * "Tendências" foi considerado e recusado: afirma disposição latente ("ele tende
 * a…"), que é justamente a leitura inferencial que esta placa recusa, e em
 * português sugere movimento no tempo — quando isto é um censo parado de um
 * mandato.
 *
 * Mesma placa da concordância por área, com o **total no lugar dos temas em
 * comum**, e é de propósito que sejam a mesma: são as duas metades da leitura
 * que substituiu o espectro. Ver `src/lib/domain/authorship.ts` para por que a
 * frase é descritiva ("dos 47 projetos que apresentou, 40% são de saúde") e
 * nunca inferencial.
 *
 * ── Coluna única, porque a coluna é estreita ────────────────────────────────
 *
 * A ficha é `lg:grid-cols-[1fr_23rem]` e esta placa mora na margem. Ela nasceu
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
      <p className="max-w-[52ch] border-t-2 border-navy-900 pt-5 text-sm leading-relaxed text-[var(--color-muted)]">
        {reading.total === 0
          ? `${agentName} não apresentou propostas neste mandato.`
          : `${agentName} apresentou ${fmt(reading.total, "proposta", "propostas")} neste mandato — poucas para desenhar um perfil por área.`}
      </p>
    );
  }

  return (
    // A régua de 2px é a gramática de placa do sistema — `IndexPlate`,
    // `QualityPlate`, `ReadingPlate` e `PositioningPlate` abrem todas com ela.
    // Estas duas nasceram sem, e na coluna marginal a diferença aparece: as
    // seções vizinhas começam com um traço de tinta e estas começavam no vazio.
    <div className="border-t-2 border-navy-900 pt-5">
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
          Fatia das {reading.total} propostas que apresentou neste mandato. O centro é 0%, o
          anel marca 80%.
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
                ? "nenhuma"
                : `${fmt(s.count, "proposta", "propostas")} de ${reading.total}`,
          }))}
        />
        {/* A única coisa que continua na página, porque sem ela a lista parece
            uma soma errada: nove fatias de 102 somando 209. */}
        <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
          Uma proposta conta em cada área que toca, então as fatias somam mais de 100%.
        </p>
      </div>
    </div>
  );
}
