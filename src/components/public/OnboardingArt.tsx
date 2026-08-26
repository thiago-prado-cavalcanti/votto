/**
 * Os retratos e a marca partidária das telas de exemplo — desenhados, não
 * fotografados.
 *
 * ── Por que ilustração ──────────────────────────────────────────────────────
 *
 * Duas razões, e a segunda é a que decide. A primeira: um monograma de iniciais
 * lê como formulário meio preenchido, e estas telas são a primeira impressão do
 * produto. A segunda: **uma fotografia diz "esta pessoa" com uma força que
 * nenhuma legenda desfaz.** Num site onde o parlamentar de verdade aparece com o
 * retrato que a Câmara publica, um rosto fotográfico ao lado de "84% de
 * alinhamento" seria lido como um deputado real — e a tela inteira existe para
 * explicar a leitura, não para atribuí-la a alguém.
 *
 * O desenho resolve os dois: tem presença humana e se declara desenho.
 *
 * ── A gramática ────────────────────────────────────────────────────────────
 *
 * Papel e pigmento, como o resto: fundo em tom quente, silhueta em tinta
 * chapada, sem gradiente e sem sombra. Cada figura difere em recorte de cabelo,
 * ombro e cor, o bastante para serem duas pessoas e não duas cópias.
 */

/* ─── Retratos ────────────────────────────────────────────────────────────── */

interface PortraitProps {
  /** Diâmetro em px. */
  size?: number;
  className?: string;
}

/**
 * Retrato A — cabelo longo, ombros largos, colorway pinho.
 * Usado na ficha da deputada.
 */
export function PortraitA({ size = 56, className }: PortraitProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Retrato ilustrado"
    >
      <circle cx="32" cy="32" r="32" fill="#dbe6e1" />
      {/* O recorte impede que os ombros vazem do disco. */}
      <clipPath id="pa-clip">
        <circle cx="32" cy="32" r="32" />
      </clipPath>
      <g clipPath="url(#pa-clip)">
        {/* Ombros e tronco */}
        <path d="M6 64c0-13.5 11.6-20 26-20s26 6.5 26 20z" fill="#1f4a41" />
        {/* Gola, para o tronco não virar um bloco */}
        <path d="M25 45.5 32 53l7-7.5-3.2-2.2h-7.6z" fill="#eef3f0" />
        {/* Pescoço */}
        <path d="M26.5 36h11v10.5a5.5 5.5 0 0 1-11 0z" fill="#c98f63" />
        {/* Rosto */}
        <ellipse cx="32" cy="27" rx="11" ry="13" fill="#dda87c" />
        {/* Cabelo: calota mais mecha nos dois lados */}
        <path d="M32 10c8.8 0 13.4 5.7 13.4 13.6 0 3.4-.7 6.2-1.6 8.4l-2.2-9.2c-4.2 1.6-13.6 2-19 .2l-1.8 9c-1-2.2-1.7-5-1.7-8.4C19.1 15.7 23.2 10 32 10z" fill="#2b2620" />
        <path d="M20.4 25.5c-1.8 6.4-1.4 12.6.6 18.2l-3.6 1.2c-2.2-6.6-2.2-13.6.4-20.2zM43.6 25.5c1.8 6.4 1.4 12.6-.6 18.2l3.6 1.2c2.2-6.6 2.2-13.6-.4-20.2z" fill="#2b2620" />
        {/* Traços: dois olhos e uma boca, o mínimo para haver um rosto */}
        <circle cx="27.6" cy="26.5" r="1.35" fill="#2b2620" />
        <circle cx="36.4" cy="26.5" r="1.35" fill="#2b2620" />
        <path d="M29.4 32.6c1.6 1.2 3.6 1.2 5.2 0" stroke="#2b2620" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

/**
 * Retrato B — cabelo curto, barba, colorway terracota.
 * Usado na ficha do senador.
 */
export function PortraitB({ size = 56, className }: PortraitProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Retrato ilustrado"
    >
      <circle cx="32" cy="32" r="32" fill="#f4e3cc" />
      <clipPath id="pb-clip">
        <circle cx="32" cy="32" r="32" />
      </clipPath>
      <g clipPath="url(#pb-clip)">
        <path d="M6 64c0-13.5 11.6-20 26-20s26 6.5 26 20z" fill="#7d4a2e" />
        {/* Camisa e gravata: dá idade e formalidade sem caricatura */}
        <path d="M24.6 45.2 32 52l7.4-6.8-3.4-2h-8z" fill="#fbf3e8" />
        <path d="M32 52l2.6-4.2h-5.2z" fill="#b4552f" />
        <path d="M26.5 36h11v10.5a5.5 5.5 0 0 1-11 0z" fill="#a86a44" />
        <ellipse cx="32" cy="27" rx="11" ry="12.6" fill="#bd8154" />
        {/* Barba curta */}
        <path d="M21.4 27.5c0 8.6 4.6 13.2 10.6 13.2s10.6-4.6 10.6-13.2c0 5-4.8 6.8-10.6 6.8s-10.6-1.8-10.6-6.8z" fill="#3a322a" />
        {/* Cabelo curto */}
        <path d="M32 11.4c7.6 0 12.2 4.6 12.2 11.4 0 1.8-.2 3.4-.6 4.8-1.4-4.6-4-6.6-6-7-3.2-.6-8.4-.4-11.4 1.4-2 1.2-3.4 3-4.2 5.6-.4-1.4-.6-3-.6-4.8 0-6.8 4.6-11.4 10.6-11.4z" fill="#3a322a" />
        <circle cx="27.6" cy="26.2" r="1.35" fill="#2b2620" />
        <circle cx="36.4" cy="26.2" r="1.35" fill="#2b2620" />
      </g>
    </svg>
  );
}

/* ─── A marca do partido ──────────────────────────────────────────────────── */

/**
 * "PA · Partido Aurora" — sigla desenhada, oblíqua, com extrusão chapada.
 *
 * ── Por que ela não segue a tipografia do Votto ─────────────────────────────
 *
 * O sistema não tem peso 700 e esta marca é pesada de propósito: marca de
 * partido não segue a tipografia do site que a hospeda — as curadas em
 * `public/logos/partidos/` são cada uma no lettering do próprio partido, e é por
 * isso que a plataforma nunca imprime a sigla ao lado delas. Uma marca que
 * obedecesse ao sistema do Votto pareceria um rótulo do Votto.
 *
 * A extrusão chapada foi tentada e retirada: **cor sólida**, sem segunda face e
 * sem sombra, que é a regra do §9 e é também o que sobrevive a 26px — o volume
 * fechava o olho do A justamente no tamanho em que a marca mais aparece.
 *
 * ── O que a pesquisa sustentou ──────────────────────────────────────────────
 *
 * Três frentes de pesquisa convergiram em "partido é sigla, não ícone": no
 * Brasil manda a cédula (vota-se na sigla, e o PSOL de Ziraldo é praticamente só
 * lettering); nas legendas novas o logo do Volt **são** as quatro letras e o
 * Renaissance é o monograma "RE". A brecha que sobra para uma sigla inventada é
 * o **pigmento terroso** — os laranjas ocupados, REDE #f05921 e NOVO #f3702b,
 * são bem mais saturados que a terracota.
 *
 * ── O desenho ───────────────────────────────────────────────────────────────
 *
 * Letras em `path`, não em fonte: peso e inclinação precisam ser exatos e não
 * podem depender de o Newsreader ter um itálico 800 carregado. Construção
 * geométrica de flat design — hastes retas, bojo em semicírculo, sem modulação
 * de traço —, inclinadas 12°, em terracota chapada.
 */

const AURORA_TERRACOTA = "#b4552f";
/** A lateral do sólido: a tinta do sistema. */
const AURORA_SOMBRA = "#17150f";

/**
 * As duas letras, em coordenadas de 0–96 na horizontal e 0–90 na vertical.
 *
 * `fill-rule: evenodd` faz os contraformes: o olho do P e o triângulo do A são
 * subcaminhos dentro do mesmo `path`, e não formas brancas por cima — o que
 * mantém a marca correta sobre qualquer fundo.
 */
function AuroraLetters({ fill }: { fill: string }) {
  return (
    <g fill={fill} fillRule="evenodd">
      {/* P — haste reta e bojo em semicírculo. */}
      <path d="M0 8h34a19 19 0 0 1 0 38H18v36H0V8Zm18 15v13h14a6.5 6.5 0 0 0 0-13H18Z" />
      {/* A — duas diagonais, travessa e o olho triangular. */}
      <path d="M76 8h18l24 74H98l-4.2-14H72.4L68 82H49L76 8Zm7 22-6.2 21h12.6L83 30Z" transform="translate(-6 0)" />
    </g>
  );
}

/**
 * A projeção isométrica canônica: a face esquerda do cubo.
 *
 * `rotate(-30) skewX(30) scale(1 .864)` — o 0,864 é cos(30°), que achata a
 * vertical. Sobe para a direita, que é o gesto certo para um partido chamado
 * Aurora.
 */
const ISO = "rotate(-30) skewX(30) scale(1 0.864)";

/** Profundidade do corpo, em unidades do desenho. */
const DEPTH = 17;
/**
 * Passo do varrido. Precisa ser ≤ 1 para as cópias se encavalarem: a 1,4 aparece
 * uma serrilha nas diagonais do A, que é justamente onde a extrusão é mais
 * visível.
 */
const STEP = 0.85;

/**
 * A sigla extrudada.
 *
 * ── Como o volume é feito ───────────────────────────────────────────────────
 *
 * Extrude é **geometria**, não sombra: são as faces laterais que ligam a face de
 * trás à da frente. Em SVG isso se resolve varrendo a silhueta — a união de N
 * cópias deslocadas ao longo do vetor de profundidade **é** o sólido varrido —,
 * e o resultado é exato, sem depender de filtro nem de biblioteca 3D.
 *
 * O deslocamento acontece FORA da transformação isométrica, em espaço de tela:
 * dentro dela o vetor sairia inclinado junto e o volume descolaria da letra.
 *
 * ── Face em pigmento, corpo em tinta ────────────────────────────────────────
 *
 * Terracota na frente, tinta na lateral: os dois valores que o sistema já usa em
 * todo o resto, no maior contraste possível — que é o que faz o volume ler a
 * 26px, onde uma lateral de terracota escurecida virava um borrão do mesmo tom.
 *
 * Sobre fundo escuro isso se inverte: a face vira papel e o corpo assume a
 * terracota, porque uma lateral de tinta sobre tinta não existe.
 */
function AuroraSolid({ tone }: { tone: "ink" | "paper" }) {
  const face = tone === "paper" ? "#fcfaf6" : AURORA_TERRACOTA;
  const body = tone === "paper" ? AURORA_TERRACOTA : AURORA_SOMBRA;
  const steps = Math.round(DEPTH / STEP);

  return (
    <>
      {Array.from({ length: steps }, (_, k) => (
        <g key={k} transform={`translate(0 ${((k + 1) * STEP).toFixed(2)})`}>
          <g transform={ISO}>
            <AuroraLetters fill={body} />
          </g>
        </g>
      ))}
      <g transform={ISO}>
        <AuroraLetters fill={face} />
      </g>
    </>
  );
}

/** Só a sigla. É o que vai dentro do disco da ficha. */
export function AuroraSymbol({
  size = 28,
  tone = "ink",
  className,
}: {
  size?: number;
  tone?: "ink" | "paper";
  className?: string;
}) {
  return (
    // O `viewBox` é a caixa REAL do desenho depois da projeção e da extrusão,
    // medida no navegador (`svg.getBBox()` na RAIZ — chamá-lo no grupo devolve a
    // caixa antes da transformação dele). Sem isso a marca encolhe dentro do
    // disco quadrado, porque o SVG encaixa pela dimensão maior.
    <svg width={size} height={size} viewBox="9 -44 169 118" className={className} aria-hidden>
      <g transform="translate(6 12)">
        <AuroraSolid tone={tone} />
      </g>
    </svg>
  );
}

export function AuroraMark({
  height = 40,
  tone = "ink",
  className,
}: {
  height?: number;
  tone?: "ink" | "paper";
  className?: string;
}) {
  const ink = tone === "paper" ? "#fcfaf6" : "#17150f";
  return (
    <svg
      width={height * 3.6}
      height={height}
      viewBox="9 -44 372 118"
      className={className}
      role="img"
      aria-label="Partido Aurora"
    >
      <g transform="translate(6 12)">
        <AuroraSolid tone={tone} />
      </g>
      <text
        x="196"
        y="-2"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontSize="26"
        fontWeight="700"
        letterSpacing="4"
        fill={ink}
      >
        PARTIDO
      </text>
      <text
        x="196"
        y="-2"
        dy="30"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontSize="26"
        fontWeight="700"
        letterSpacing="4"
        fill={ink}
      >
        AURORA
      </text>
    </svg>
  );
}
