/**
 * Admin login page — split layout with an ink brand panel and a plain form.
 * Rendered outside the guarded panel chrome.
 *
 * The panel is flat ink: the blurred aurora orbs it used to carry belong to the
 * old scheme, and the paper grain is the whole ornament budget now
 * (docs/design.md).
 */
import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Entrar — Admin" };

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section className="hidden flex-col justify-between bg-navy-900 p-12 text-navy-50 lg:flex">
        <div>
          <span className="inline-flex items-center gap-2 rounded-[2px] border border-navy-50/15 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-accent-300">
            Painel de controle
          </span>
        </div>
        <div>
          <hr className="mb-6 h-[3px] w-14 border-0 bg-navy-50/80" />
          <h1 className="font-display text-5xl">
            Votto<span className="text-accent-500">.</span>
          </h1>
          <p className="mt-4 max-w-sm text-lg leading-relaxed text-navy-200">
            Gerencie agentes, partidos e pautas com a clareza que a democracia
            exige.
          </p>
        </div>
        <div className="text-sm text-navy-300">
          © {new Date().getFullYear()} Votto · Painel administrativo
        </div>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center bg-canvas px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="font-display text-3xl text-navy-900">
              Votto<span className="text-accent-500">.</span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Painel administrativo
            </p>
          </div>

          <div className="mb-7 hidden lg:block">
            <h2 className="font-display text-3xl text-navy-900">
              Entrar
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              Acesse o painel com suas credenciais.
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface p-6 sm:p-7">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
