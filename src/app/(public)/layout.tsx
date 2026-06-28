/**
 * Public area layout: header with wordmark, navigation and the citizen
 * login/logout control, plus a simple footer with the project tagline.
 */
import { Container, ButtonLink } from "@/components/ui";
import { Wordmark } from "@/components/public/Wordmark";
import { NavLinks } from "@/components/public/NavLinks";
import { LogoutButton } from "@/components/public/LogoutButton";
import { getCitizenSession } from "@/lib/auth/session";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCitizenSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Wordmark />
            <div className="hidden sm:block">
              <NavLinks />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {session ? (
              <>
                <span className="hidden text-sm text-[var(--color-muted)] sm:inline">
                  Olá,{" "}
                  <span className="font-medium text-navy-800">
                    {session.name.split(" ")[0]}
                  </span>
                </span>
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
          <NavLinks />
        </Container>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-line bg-surface">
        <Container className="flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
          <div>
            <Wordmark />
            <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">
              Sua voz no centro da democracia. Vote nos temas que importam e descubra
              quão alinhados estão os seus representantes.
            </p>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Votto — democracia direta e medição de alinhamento político.
          </p>
        </Container>
      </footer>
    </div>
  );
}
