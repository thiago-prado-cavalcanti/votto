/**
 * Onde o cidadão concorda com um parlamentar, área a área.
 *
 * A figura é `AreaRadar` — a mesma que a autoria usa, e o desenho vive lá
 * justamente porque desenhar duas vezes o mesmo polígono é o jeito mais
 * confiável de as duas leituras divergirem sem ninguém notar.
 *
 * ── O título não é decoração ────────────────────────────────────────────────
 *
 * Sem ele o leitor supõe que o eixo mede *dedicação ao assunto*, e não
 * concordância — foi o que aconteceu com a primeira pessoa que viu o protótipo.
 * O subtítulo nomeia a interpretação errada de propósito: nomear é o que a
 * desarma, e desde que `AreaAuthorshipPlate` existe a leitura suposta virou uma
 * página de verdade, a um clique de distância.
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
    <div className="grid gap-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-center">
      <figure className="m-0">
        <p className="text-[1.05rem] leading-snug text-navy-900">
          Onde você concorda com {agentName}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
          Cada eixo é a fatia dos projetos daquela área em que vocês votaram igual — não o quanto
          ele se dedica ao assunto.
        </p>

        <div className="mt-4">
          <AreaRadar
            title={`Concordância por área com ${agentName}`}
            axes={areas.map((a) => ({ key: a.area, label: a.label, value: a.agreement }))}
          />
        </div>

        <figcaption className="mt-4 max-w-[46ch] text-xs leading-relaxed text-[var(--color-muted)]">
          O centro é 0% e o anel marca 80%. Um eixo tracejado é uma área com poucos projetos em
          comum — sem leitura, e não zero.
        </figcaption>
      </figure>

      <div>
        <h3 className="mb-4 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
          Concordância, projeto a projeto
        </h3>
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
