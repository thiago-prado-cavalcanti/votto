/**
 * O primeiro acesso — quatro telas que explicam a plataforma, em vez de operá-la.
 *
 * ── Por que explicação, e não o fluxo real ──────────────────────────────────
 *
 * A versão anterior fazia o cidadão votar em cinco projetos de verdade e então
 * lhe mostrava o alinhamento de verdade. A ideia é sedutora e o resultado era
 * ruim, por uma razão que está medida no resto do projeto: com cinco temas em
 * comum, `MIN_ALIGNMENT_BASIS` é alcançado no limite e **dezenas de
 * parlamentares empatam em 100%**. A primeira coisa que a plataforma dizia a
 * alguém era, portanto, um número que ela precisava desmentir na linha seguinte
 * — "empatado com outros 37, vote mais para separá-los".
 *
 * Uma simulação **declarada** explica o mesmo conceito sem prometer precisão que
 * aquele momento não tem. O cidadão sai sabendo o que a plataforma faz e vai
 * votar porque entendeu, não porque foi levado por um número frágil.
 *
 * ── O que isso exige das figuras ────────────────────────────────────────────
 *
 * Se o dado é inventado, ele **tem de parecer inventado** — é a mesma disciplina
 * dos índices, ao contrário. Ninguém real, nenhuma fotografia (os retratos são
 * desenhados), uma sigla que não existe, e uma frase em português no fim de cada
 * tela. As defesas vivem em `OnboardingFigures` e `OnboardingArt`.
 *
 * ── A mecânica ──────────────────────────────────────────────────────────────
 *
 * `?passo=` na URL e nada mais: sem estado de cliente, sem leitura de banco além
 * da sessão. Funciona sem JavaScript, o botão "voltar" do navegador faz o que se
 * espera, e um link para um slide específico abre naquele slide.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui";
import { Reveal } from "@/components/public/motion";
import { getCitizenSession } from "@/lib/auth/session";
import { completeOnboardingAction } from "@/lib/actions/onboarding";
import {
  AlignmentFigure,
  BallotFigure,
  FollowFigure,
  PortraitFigure,
} from "@/components/public/OnboardingFigures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comece por aqui",
  robots: { index: false },
};

/**
 * Os quatro slides, na ordem em que a plataforma faz sentido: o que você faz, o
 * que aparece por causa disso, o que você declara, e o que tudo isso te devolve.
 * Cada um responde a uma pergunta que o anterior levanta.
 */
const SLIDES = [
  {
    key: "votar",
    step: "Votar",
    eyebrow: "O que você faz aqui",
    title: "O primeiro passo é votar.",
    lead: "Só com o seu voto podemos mostrar quem está alinhado com você. São os mesmos projetos que a Câmara e o Senado votam, com o mesmo texto oficial.",
  },
  {
    key: "alinhamento",
    step: "Alinhamento",
    eyebrow: "O que aparece depois",
    title: "Descubra quem vota como você.",
    lead: "Comparamos os seus votos com o registro nominal da Câmara e do Senado, projeto por projeto. Não é opinião nossa: é contagem sobre documento público.",
  },
  {
    key: "seguir",
    step: "Acompanhar",
    eyebrow: "O que muda para eles",
    title: "Acompanhe quem você elegeu.",
    lead: "Acompanhar não é votar de novo. É o que faz o parlamentar saber se está votando como as pessoas que o elegeram pensam — informação para ele, pressão saudável para todos.",
  },
  {
    key: "voce",
    step: "Sobre você",
    eyebrow: "O que você descobre",
    title: "Quanto mais você vota, mais você se conhece.",
    lead: "Cada tema respondido acrescenta uma linha ao seu retrato: com quem você se parece no Congresso, que assuntos te movem, e o quanto você acompanha ou contraria o governo do momento.",
  },
] as const;

type SlideKey = (typeof SLIDES)[number]["key"];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ passo?: string }>;
}) {
  const session = await getCitizenSession();
  if (!session) redirect("/login");

  const { passo } = await searchParams;
  const index = Math.max(
    0,
    SLIDES.findIndex((s) => s.key === passo),
  );
  const slide = SLIDES[index];
  const next = SLIDES[index + 1];
  const previous = SLIDES[index - 1];

  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto max-w-[44rem]">
        <Rail current={index} />

        {/* A chave no `key` reinicia a animação a cada troca de slide: sem ela o
            React reaproveita a árvore e a tela nova aparece já assentada, o que
            faz a navegação parecer um recarregamento e não um avanço. */}
        <Reveal key={slide.key} as="section" variant="fade" className="mt-10">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-600">
            {slide.eyebrow}
          </p>
          <h1 className="mt-3 font-display text-[2.1rem] leading-[1.08] text-navy-900 sm:text-[2.9rem]">
            {slide.title}
          </h1>
          <p className="mt-5 max-w-[44ch] text-[1.05rem] leading-relaxed text-navy-700">
            {slide.lead}
          </p>

          <div className="mt-10">
            {slide.key === "votar" ? <BallotFigure /> : null}
            {slide.key === "alinhamento" ? <AlignmentFigure /> : null}
            {slide.key === "seguir" ? <FollowFigure /> : null}
            {slide.key === "voce" ? <PortraitFigure /> : null}
          </div>

        </Reveal>

        <div className="mt-12 flex items-center justify-between gap-4 border-t border-line pt-6">
          {previous ? (
            <Link
              href={`/comecar?passo=${previous.key}`}
              className="text-sm text-navy-600 transition-colors hover:text-navy-900"
            >
              Voltar
            </Link>
          ) : (
            <span />
          )}

          {next ? (
            <Link
              href={`/comecar?passo=${next.key}`}
              className="inline-flex items-center rounded-card bg-accent-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-600"
            >
              Continuar
            </Link>
          ) : (
            // O fim do percurso é o começo do uso: marca `onboardedAt` e leva
            // para onde se vota de verdade.
            <form action={completeOnboardingAction}>
              <button
                type="submit"
                className="inline-flex items-center rounded-card bg-accent-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-600"
              >
                Começar a votar
              </button>
            </form>
          )}
        </div>
      </div>
    </Container>
  );
}

/**
 * A régua dos quatro slides.
 *
 * Segmentos de tinta e não bolinhas: é a mesma gramática das barras de medida do
 * sistema (6px, esquadria viva), e o nome do passo corrente vem escrito ao lado
 * porque quatro traços sozinhos dizem "quanto falta" e não "do que se trata".
 */
function Rail({ current }: { current: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          {SLIDES[current].step}
        </span>
        <span className="vt-num text-xs text-[var(--color-muted)]">
          {current + 1}/{SLIDES.length}
        </span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {SLIDES.map((s, i) => (
          <div key={s.key} className={`h-1.5 flex-1 ${i <= current ? "bg-navy-900" : "bg-navy-200"}`} />
        ))}
      </div>
    </div>
  );
}

export type { SlideKey };
