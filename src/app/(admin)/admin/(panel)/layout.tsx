/**
 * Guarded admin panel layout: requires an authenticated admin and renders the
 * dark "control room" sidebar + topbar chrome around all panel pages.
 */
import { requireAdmin } from "@/lib/auth/guards";
import { Sidebar } from "@/components/admin/Sidebar";
import { LogoutButton } from "@/components/admin/LogoutButton";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const initials = getInitials(session.name);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-navy-950/40 bg-navy-900 lg:flex">
          <div className="border-b border-white/5 px-5 py-5">
            <div className="font-display text-2xl font-extrabold tracking-tight text-white">
              Votto<span className="text-accent-500">.</span>
            </div>
            <div className="mt-0.5 text-xs font-medium uppercase tracking-widest text-navy-300">
              Painel administrativo
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-5">
            <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-navy-400">
              Navegação
            </div>
            <Sidebar />
          </div>
          <div className="border-t border-white/5 px-5 py-4 text-xs text-navy-400">
            Acesso restrito · Votto
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="font-display text-lg font-extrabold tracking-tight text-navy-900 lg:hidden">
              Votto<span className="text-accent-500">.</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-sm font-semibold text-navy-900">{session.name}</div>
                <div className="text-xs text-[var(--color-muted)]">{roleLabel(session.role)}</div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white"
                aria-hidden
              >
                {initials}
              </div>
              <LogoutButton />
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

/** Map an admin role string to its PT-BR label. */
function roleLabel(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super administrador";
    case "EDITOR":
      return "Editor";
    case "VIEWER":
      return "Visualizador";
    default:
      return role;
  }
}

/** Derive up to two uppercase initials from a name for the avatar badge. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
