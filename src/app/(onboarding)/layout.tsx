/**
 * A casca do primeiro acesso — deliberadamente sem o site em volta.
 *
 * ── Por que um grupo de rota, e não uma condição no layout público ──────────
 *
 * O percurso é uma tarefa de cinco itens com começo e fim, e o menu superior é
 * um convite permanente a abandoná-la: cada palavra ali é uma saída lateral que
 * não devolve ninguém para onde parou. Tirar a navegação é o que transforma a
 * página num passo a passo em vez de mais uma seção do site.
 *
 * Feito com um grupo de rota (`(onboarding)`) porque é o mecanismo do Next para
 * exatamente isto: a URL continua `/comecar`, e o layout público simplesmente
 * não envolve mais esta árvore. A alternativa — condicionar o cabeçalho ao
 * caminho dentro do layout público — obrigaria um layout de servidor a conhecer
 * a rota corrente, e deixaria a regra escrita longe da página que ela governa.
 *
 * Sobra o mínimo para não parecer uma página órfã: a marca à esquerda, que diz
 * onde a pessoa está, e uma única saída à direita, que avisa antes de sair.
 */
import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { Wordmark } from "@/components/public/Wordmark";
import { Analytics } from "@/components/public/Analytics";
import { ExitOnboarding } from "@/components/public/ExitOnboarding";

export const metadata: Metadata = {
  robots: { index: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Analytics />
      {/* Uma faixa, não um cabeçalho: mesma altura do site para a troca não dar
          solavanco, fechada pelo mesmo filete de tinta — e vazia no meio. */}
      <div className="border-b border-line">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Wordmark />
          <ExitOnboarding />
        </Container>
      </div>

      <main className="flex-1">{children}</main>
    </div>
  );
}
