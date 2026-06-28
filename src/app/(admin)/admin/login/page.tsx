/**
 * Admin login page — bare, centered, outside the guarded panel chrome.
 */
import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Entrar — Admin" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-tight text-navy-900">Votto</div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Painel administrativo</p>
        </div>
        <Card>
          <CardBody>
            <LoginForm />
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
