/**
 * Onde o cidadão concorda com um parlamentar, área a área.
 *
 * A figura é `AreaRadar` — a mesma que a autoria usa, e o desenho vive lá
 * justamente porque desenhar duas vezes o mesmo polígono é o jeito mais
 * confiável de as duas leituras divergirem sem ninguém notar.
 *
 * ── Coluna única, e a explicação no "?" ─────────────────────────────────────
 *
 * A ficha é `lg:grid-cols-[1fr_23rem]` e esta placa mora na margem: impor um
 * grid próprio partia 304px em duas metades de ~150. A explicação — inclusive a
 * interpretação errada que ela precisa desarmar, a de que o eixo mede dedicação
 * ao assunto — foi para `AreaInfo`, ao lado do título. Numa coluna dessa largura
 * ela ficava mais alta que a figura que explicava.
 *
 * ── Uma pétala, não duas ────────────────────────────────────────────────────
 *
 * A forma convencional de comparar seria sobrepor "quanto cada um votou SIM" por
 * área. Medida sobre os mesmos temas, ela **converge falsamente**: dois deputados
 * de polos opostos votam SIM em 50% e 61% dos projetos de ambiente — quase
 * idênticos — e concordam em 11%. Votam sim na mesma frequência em projetos
 * diferentes. Ver `area-alignment.ts`.
 *
 * ── Eixo sem leitura não vira zero ──────────────────────────────────────────
 *
 * Uma área abaixo do piso é `null`, e desenhá-la no centro afirmaria
 * concordância zero. `AreaRadar` marca a ausência fora da forma. **É a diferença
 * de espécie entre esta placa e a de autoria**, onde zero é medido: lá a
 * varredura conta as nove áreas para todo mundo, aqui um eixo pode simplesmente
 * não ter projetos em comum.
 *
 * Server component: sem hooks, sem estado.
 */
import { AreaList, AreaRadar } from "@/components/public/AreaRadar";
import type { AreaAgreement } from "@/lib/indexes/area-alignment";

export function AreaAgreementPlate({
  areas,
  agentName,
}: {
  areas: AreaAgreement[];
  agentName: string;
}) {
  const totalThemes = areas.reduce((max, a) => Math.max(max, a.sharedThemes), 0);

  return (
    // A régua de 2px é a gramática de placa do sistema — `IndexPlate`,
    // `QualityPlate`, `ReadingPlate` e `PositioningPlate` abrem todas com ela.
    // Estas duas nasceram sem, e na coluna marginal a diferença aparece: as
    // seções vizinhas começam com um traço de tinta e estas começavam no vazio.
    <div className="border-t-2 border-navy-900 pt-5">
      <figure className="m-0">
        <div>
          <AreaRadar
            title={`Concordância por área com ${agentName}`}
            axes={areas.map((a) => ({ key: a.area, label: a.label, value: a.agreement }))}
          />
        </div>

        <figcaption className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
          Projetos em que você e {agentName} votaram igual. O centro é 0%, o anel marca 80%; eixo
          tracejado é área com poucos projetos em comum.
        </figcaption>
      </figure>

      <div className="mt-7">
        <AreaList
          rows={areas.map((a) => ({
            key: a.area,
            label: a.label,
            value: a.agreement,
            note:
              a.sharedThemes === 0
                ? "nenhum projeto em comum"
                : `${a.sharedThemes} ${a.sharedThemes === 1 ? "projeto" : "projetos"} em comum`,
          }))}
        />
        {totalThemes > 0 ? null : (
          <p className="mt-4 text-xs text-[var(--color-muted)]">
            Vocês ainda não votaram nos mesmos projetos.
          </p>
        )}
      </div>
    </div>
  );
}
