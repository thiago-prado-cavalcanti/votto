/**
 * Admin login page — bold split layout with a dark brand panel and a confident
 * form. Rendered outside the guarded panel chrome.
 */
import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Entrar — Admin" };

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent-500/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-colonial-500/20 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-300">
            Painel de controle
          </span>
        </div>
        <div className="relative">
          <h1 className="font-display text-5xl font-extrabold tracking-tight">
            Votto<span className="text-accent-500">.</span>
          </h1>
          <p className="mt-4 max-w-sm text-lg leading-relaxed text-navy-200">
            Gerencie agentes, partidos e pautas com a clareza que a democracia
            exige.
          </p>
        </div>
        <div className="relative text-sm text-navy-300">
          © {new Date().getFullYear()} Votto · Painel administrativo
        </div>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center bg-canvas px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="font-display text-3xl font-extrabold tracking-tight text-navy-900">
              Votto<span className="text-accent-500">.</span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Painel administrativo
            </p>
          </div>

          <div className="mb-7 hidden lg:block">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-navy-900">
              Entrar
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              Acesse o painel com suas credenciais.
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(11,22,34,0.04),0_12px_32px_rgba(11,22,34,0.06)] sm:p-7">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
