/**
 * Public area layout: header with wordmark, navigation and the citizen
 * login/logout control, plus a simple footer with the project tagline.
 */
import Link from "next/link";
import { Container, ButtonLink } from "@/components/ui";
import { Wordmark } from "@/components/public/Wordmark";
import { NavLinks } from "@/components/public/NavLinks";
import { LogoutButton } from "@/components/public/LogoutButton";
import { Analytics } from "@/components/public/Analytics";
import { SiteHeader } from "@/components/public/SiteHeader";
import { Reveal } from "@/components/public/motion";
import { getCitizenSession } from "@/lib/auth/session";

/** One labelled column of the footer grid: quiet eyebrow over a stack of links. */
function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
        {title}
      </div>
      <div className="mt-3.5 flex flex-col items-start gap-2.5 text-sm">{children}</div>
    </div>
  );
}

/**
 * Footer link: underlined with a faint rule rather than a text-decoration, so it
 * matches the "structure is a 1px rule" language of the rest of the system.
 */
function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "border-b border-navy-50/20 text-navy-300 transition-colors hover:border-accent-500 hover:text-accent-500";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCitizenSession();

  return (
    <div className="flex min-h-screen flex-col">
      <Analytics />
      {/* Warm paper, not white, so the header dissolves into the page instead of
          floating over it; the only edge is a 1px rule — which `SiteHeader` inks
          in as the reader advances, and which condenses once the page has left
          its first screen. */}
      <SiteHeader>
        <Container className="vt-masthead flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Wordmark />
            <div className="hidden sm:block">
              <NavLinks account={Boolean(session)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {session ? (
              <>
                {/* A saudação continua levando a `/voce`, mas já não é o único
                    caminho: "Você" está na fileira nas duas larguras desde que
                    "Sobre" desceu para o rodapé. O que ela faz aqui, e a fileira
                    não faz, é dizer **quem** está logado — que é a pergunta de
                    quem divide o computador com outra pessoa. */}
                <Link
                  href="/voce"
                  className="hidden text-sm text-[var(--color-muted)] transition-colors hover:text-navy-800 sm:inline"
                >
                  Olá,{" "}
                  <span className="font-medium text-navy-800">
                    {session.name.split(" ")[0]}
                  </span>
                </Link>
                <LogoutButton />
              </>
            ) : (
              <ButtonLink href="/login" size="sm">
                Entrar
              </ButtonLink>
            )}
          </div>
        </Container>
        <Container className="block pb-2 sm:hidden">
          <NavLinks account={Boolean(session)} />
        </Container>
      </SiteHeader>

      <main className="flex-1">{children}</main>

      {/* Footer as a colophon: one rule-less top line pairing the logotype with
          the source note, then a column grid. The wordmark and the meta line
          share a baseline row instead of the meta floating against the whole
          block, which is what made the old footer read as misaligned. */}
      <footer className="mt-20 bg-navy-900 text-navy-300">
        <Container className="py-13">
          <Reveal variant="fade" className="flex flex-wrap items-center justify-between gap-4">
            <Wordmark tone="dark" />
            <span className="font-mono text-xs text-navy-500">
              Dados oficiais · votto.online
            </span>
          </Reveal>

          <Reveal
            variant="fade"
            stagger
            step={110}
            className="mt-9 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]"
          >
            <p className="max-w-sm text-base leading-[1.65] text-navy-300">
              Plataforma de escolhas e alinhamentos, construída sobre dados públicos da
              Câmara dos Deputados e do Senado Federal.
            </p>

            <FooterColumn title="Plataforma">
              <FooterLink href="/temas">Temas</FooterLink>
              <FooterLink href="/agentes">Agentes</FooterLink>
              <FooterLink href="/partidos">Partidos</FooterLink>
            </FooterColumn>

            <FooterColumn title="Fontes oficiais">
              <FooterLink href="https://dadosabertos.camara.leg.br" external>
                Câmara dos Deputados
              </FooterLink>
              <FooterLink href="https://legis.senado.leg.br/dadosabertos" external>
                Senado Federal
              </FooterLink>
            </FooterColumn>

            {/* Reachable from every page: Meta and Google both check that the
                privacy policy URL is linked from the site, not just live.
                "Sobre" is now reachable ONLY from here, like "Metodologia": it
                left the header nav so the row would carry only pages a citizen
                acts on. It sits well in this column — it is the long-form answer
                to the same question the legal documents answer in short, so a
                reader who came down here looking for what the platform does with
                them finds it where they already are. Removing this line would
                strand the page.

                "Metodologia" is the appendix to that answer — every formula,
                every constant, every condition under which an index refuses to
                publish — and this line is its ONLY entry point on the site, by
                design: it belongs beside a number for the reader who wants to
                check one, not in a nav bar competing with the pages a citizen
                came to use. Removing it would strand the page. */}
            <FooterColumn title="Transparência">
              <FooterLink href="/sobre">Sobre o projeto</FooterLink>
              <FooterLink href="/metodologia">Metodologia dos índices</FooterLink>
              <FooterLink href="/termos">Termos de Serviço</FooterLink>
              <FooterLink href="/privacidade">Política de Privacidade</FooterLink>
              <FooterLink href="/exclusao-de-dados">Excluir meus dados</FooterLink>
            </FooterColumn>
          </Reveal>
        </Container>
      </footer>
    </div>
  );
}
