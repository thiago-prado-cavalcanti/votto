/**
 * Embeddable theme widget: headline + live voting status + "Votar" CTA.
 * Dynamic (force-dynamic) so the tallies are always current inside the iframe.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EmbedShell } from "@/components/public/EmbedShell";
import { TemperatureBar } from "@/components/public/TemperatureBar";
import { scopeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ThemeEmbed({ params }: { params: Promise<{ kid: string }> }) {
  const { kid } = await params;
  const theme = await db.theme.findUnique({
    where: { kid },
    select: { kid: true, name: true, scope: true, yesCount: true, noCount: true, absCount: true, status: true },
  });
  if (!theme || theme.status !== "ACTIVE") notFound();

  return (
    <EmbedShell eyebrow={`Tema · ${scopeLabel[theme.scope]}`} href={`/temas/${theme.kid}`} cta="Votar">
      <h1 className="line-clamp-3 text-lg font-bold leading-snug tracking-tight text-navy-900">
        {theme.name}
      </h1>
      <div className="mt-auto pt-4">
        <TemperatureBar
          yesCount={theme.yesCount}
          noCount={theme.noCount}
          absCount={theme.absCount}
        />
      </div>
    </EmbedShell>
  );
}
