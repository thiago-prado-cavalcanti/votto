/**
 * Create a new theme (optionally with articles).
 */
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/PageHeader";
import { ThemeForm } from "@/components/admin/ThemeForm";
import { isAiEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo tema" };

export default function NewThemePage() {
  return (
    <div>
      <PageHeader title="Novo tema" description="Cadastre uma nova pauta para votação." />
      <ThemeForm aiEnabled={isAiEnabled()} />
    </div>
  );
}
