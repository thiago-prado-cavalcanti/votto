/**
 * Guarded admin panel layout: requires an authenticated admin and renders the
 * sidebar + topbar chrome around all panel pages.
 */
import { requireAdmin } from "@/lib/auth/guards";
import { Sidebar } from "@/components/admin/Sidebar";
import { LogoutButton } from "@/components/admin/LogoutButton";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col bg-navy-900 p-4 lg:flex">
          <div className="mb-6 px-3.5 py-2">
            <div className="text-xl font-semibold tracking-tight text-white">Votto</div>
            <div className="text-xs text-navy-200">Painel administrativo</div>
          </div>
          <Sidebar />
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
            <div className="lg:hidden text-lg font-semibold text-navy-900">Votto</div>
            <div className="ml-auto flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-navy-900">{session.name}</div>
                <div className="text-xs text-[var(--color-muted)]">{roleLabel(session.role)}</div>
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
