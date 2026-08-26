/**
 * As figuras dos quatro slides do primeiro acesso — todas fictícias.
 *
 * ── Como a ficção se declara ────────────────────────────────────────────────
 *
 * Sem selo em cada ficha. Os dados são inventados de ponta a ponta — nomes,
 * sigla, retratos e números —, e uma etiqueta grudada em cada linha só
 * atrapalhava a leitura de telas que precisam ser lidas de relance. O que
 * garante o resto:
 *
 *  - **Ninguém real e nenhuma fotografia.** Os retratos são desenhados
 *    (`OnboardingArt`), pelo motivo documentado lá: uma foto diz "esta pessoa"
 *    com uma força que nenhuma legenda desfaz.
 *  - **Uma sigla que não existe.** "Aurora" não é partido brasileiro, e a marca
 *    é desenhada por nós.
 *
 * Sem frase de aviso no rodapé. Ela existiu por duas versões e foi retirada: o
 * conjunto — retrato desenhado, sigla que não existe, projeto com número 000 —
 * já se apresenta como maquete, e uma legenda repetindo isso em quatro telas
 * seguidas trata o leitor como quem não vê o que está olhando.
 *
 * ── Um padrão de barra, e só um ─────────────────────────────────────────────
 *
 * Toda barra destas telas passa por `Bar`: 6px, esquadria viva, mesma trilha.
 * O pigmento varia em um caso só, e por regra escrita — governismo é tinta, sem
 * a escala de tom, porque ali não existe "melhor" e colorir seria transformar
 * uma contagem em nota (§3.2).
 */
import { Bar } from "@/components/ui/Bar";
import { AreaRadar } from "@/components/public/AreaRadar";
import { AuroraSymbol, PortraitA, PortraitB } from "@/components/public/OnboardingArt";

/** A trilha e o pigmento de toda leitura de alinhamento destas telas. */
const READING = { track: "bg-navy-200", fill: "bg-colonial-500" } as const;

/* ─── 1. A cédula ─────────────────────────────────────────────────────────── */

/**
 * A cédula em tamanho natural, rodando entre três projetos inventados.
 *
 * Mora em `BallotCarousel` porque precisa de estado de cliente — e este arquivo
 * é de servidor, com o radar e as fichas dentro. É a única figura do percurso
 * que mostra a AÇÃO em vez do resultado, e por isso ocupa a largura toda: o §9
 * diz que votar é a coisa mais alta da página, e a tela que ensina a votar não
 * pode contrariar a tela que recebe o voto.
 */
export { BallotCarousel as BallotFigure } from "@/components/public/BallotCarousel";

/* ─── 2. O alinhamento ────────────────────────────────────────────────────── */

function ReadingRow({
  office,
  name,
  meta,
  value,
  art,
}: {
  office: string;
  name: React.ReactNode;
  meta?: string;
  value: number;
  art: React.ReactNode;
}) {
  return (
    // `mx-0` e NÃO `m-0`: a margem padrão do `<figure>` precisa sumir nos lados,
    // mas zerar a vertical mata o `margin-top` que o `space-y` do pai aplica.
    <figure className="mx-0">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
        {office}
      </div>
      <div className="mt-3 flex items-center gap-3.5">
        {art}
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg leading-tight text-navy-900">{name}</div>
          {meta ? <span className="text-xs text-[var(--color-muted)]">{meta}</span> : null}
        </div>
        <span className="vt-num shrink-0 text-[2rem] leading-none text-navy-900">{value}%</span>
      </div>
      <div className="mt-3.5">
        <Bar track={READING.track} segments={[{ key: office, width: value, className: READING.fill }]} />
      </div>
    </figure>
  );
}

export function AlignmentFigure() {
  return (
    // Uma régua só, abrindo o bloco — as três linhas são um objeto, não três.
    //
    // Cada figura trazia a sua, e o resultado era uma cerca: quatro traços de
    // tinta numa tela que tem três leituras. A separação entre elas já é feita
    // pelo respiro e pelo versalete do cargo, que é o suficiente para o olho e
    // custa nada à página.
    <div className="space-y-7 border-t-2 border-navy-900 pt-5">
      <ReadingRow
        office="Deputada federal"
        name="Marina Alencastro"
        meta="Partido Aurora · SP"
        value={84}
        art={<PortraitA size={52} />}
      />
      <ReadingRow
        office="Senador"
        name="Otávio Pimentel"
        meta="Partido Aurora · BA"
        value={71}
        art={<PortraitB size={52} />}
      />
      {/* As três linhas têm a MESMA anatomia: disco, nome em serifa, linha de
          apoio, numeral, barra. A do partido trazia a marca inteira no lugar do
          nome — o que repetia o sol que já está no disco e fazia aquela linha
          parecer de outra família. O símbolo identifica, o nome nomeia, e cada
          um aparece uma vez. */}
      <ReadingRow
        office="Partido"
        name="Partido Aurora"
        meta="31 deputados · 5 senadores"
        value={63}
        // O disco tem 52 e a marca ocupa 90% dele. A sigla extrudada precisa de
        // tamanho para o volume existir: a 32px dentro do mesmo disco ela virava
        // borrão, porque a lateral do sólido some antes da face.
        art={
          <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-accent-50">
            <AuroraSymbol size={47} />
          </div>
        }
      />
    </div>
  );
}

/* ─── 3. Acompanhar quem você elegeu ──────────────────────────────────────── */

/**
 * O slide não mostra o botão: mostra o que o botão produz.
 *
 * A versão anterior desenhava duas fichas com "Acompanhar" ao lado e não
 * explicava nada — um botão não é um argumento. O que torna acompanhar
 * interessante é a **consequência**: os seguidores de um parlamentar viram a
 * base dele, e a leitura publicada na ficha dele passa a ser o quanto os votos
 * dele acompanham o que essa base pensa (§3.1). É esse número que aparece aqui,
 * do ponto de vista do parlamentar, com a contagem de seguidores ao lado.
 *
 * Daí a figura ser uma ficha de agente, e não um formulário do cidadão: o slide
 * responde "o que isso muda para ele", que é a pergunta que a ação levanta.
 */
export function FollowFigure() {
  return (
    <div className="space-y-5">
      <figure className="mx-0 border-t-2 border-navy-900 pt-4">
        <div className="flex items-center gap-3.5">
          <PortraitA size={52} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg leading-tight text-navy-900">
              Marina Alencastro
            </div>
            <span className="text-xs text-[var(--color-muted)]">
              Deputada federal · Partido Aurora · SP
            </span>
          </div>
          <span className="shrink-0 rounded-card border border-navy-900 bg-navy-900 px-4 py-2 text-sm font-medium text-white">
            Acompanhando
          </span>
        </div>

        {/* A consequência, na ficha DELA: é isto que a sua declaração cria. */}
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
              Com a base dela
            </span>
            <span className="vt-num text-[1.6rem] leading-none text-navy-900">76%</span>
          </div>
          <div className="mt-3">
            <Bar
              track={READING.track}
              segments={[{ key: "base", width: 76, className: READING.fill }]}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
            O quanto os votos dela acompanham o que as 4.812 pessoas que a elegeram pensam.
          </p>
        </div>
      </figure>

      <p className="text-sm leading-relaxed text-navy-700">
        Um por cargo, como na urna — um deputado e um senador —, e você pode trocar quando quiser.
        O total de seguidores é público; <strong className="font-medium">quem são, nunca</strong>.
      </p>
    </div>
  );
}

/* ─── 4. O retrato ────────────────────────────────────────────────────────── */

/**
 * Um perfil inventado, com amplitude para o desenho existir.
 *
 * Os valores foram levantados: no conjunto anterior o maior era 71 e o menor 18,
 * então a figura ocupava dois terços do campo e lia como uma mancha no meio do
 * disco. Aqui o pico vai a 88 e o vale a 34 — a mesma variação relativa, num
 * intervalo que preenche a massa. É demonstração: os números não medem ninguém,
 * e o que eles têm de fazer é mostrar a forma que a leitura desenha.
 */
const AREAS = [
  ["saude", "Saúde", 82],
  ["educacao", "Educação e Ciência", 54],
  ["trabalho", "Trabalho", 38],
  ["direitos", "Direitos", 88],
  ["seguranca", "Segurança e Justiça", 46],
  ["economia", "Economia", 64],
  ["gestao", "Gestão pública", 34],
  ["ambiente", "Ambiente", 76],
  ["infraestrutura", "Infraestrutura", 42],
] as const;

export function PortraitFigure() {
  return (
    <div className="grid gap-8 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:items-center">
      <AreaRadar
        title="Exemplo de perfil por área"
        shape="polygon"
        axes={AREAS.map(([key, label, value]) => ({ key, label, value }))}
      />
      <figure className="m-0 border-t-2 border-navy-900 pt-4">
        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          Vota com o governo
        </div>
        <div className="vt-num mt-2 text-[2.4rem] leading-none text-navy-900">41%</div>
        <div className="mt-3.5">
          {/* A única barra destas telas que não usa o pigmento de leitura, e a
              razão é do §3.2: aqui não existe "melhor", então a escala de tom
              transformaria uma contagem em nota. */}
          <Bar track={READING.track} segments={[{ key: "gov", width: 41, className: "bg-navy-900" }]} />
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-[var(--color-muted)]">
          Coincidência com o Executivo — não ideologia. Quem se opõe pela esquerda e quem se opõe
          pela direita aparecem igual aqui.
        </p>
      </figure>
    </div>
  );
}
