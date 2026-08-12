/**
 * Official record panel for an imported theme.
 *
 * Everything here is reproduced verbatim from the originating house — identifier,
 * procedural regime, current situation, subject classification and dates — and
 * links back to the source page. That traceability is the point: a citizen must
 * be able to check that what Votto shows is what the Câmara or the Senado
 * actually published (CLAUDE.md §8, "provenance & trust").
 *
 * Renders nothing for manually created themes, which have no official record.
 */
import { Badge } from "@/components/ui";
import { houseLabel } from "@/lib/labels";
import type { PublicTheme } from "@/lib/dto";

/** Format an ISO timestamp as `dd/MM/yyyy`, or null when absent. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** One label/value row. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] sm:w-40">
        {label}
      </dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export function OfficialRecord({ theme }: { theme: PublicTheme }) {
  const presented = formatDate(theme.presentedAt);
  const lastAction = formatDate(theme.lastActionAt);
  const hasRecord =
    theme.identifier || theme.house || theme.situation || theme.urgency || theme.externalUrl;
  if (!hasRecord) return null;

  return (
    <section className="mt-7 rounded-card border border-line bg-canvas p-4">
      {/* A filing label, not a headline: sans small caps, like the stamp on a
          government folder. */}
      <h2 className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        Ficha oficial
      </h2>

      <dl className="mt-3 flex flex-col gap-2.5">
        {theme.identifier ? <Row label="Identificação">{theme.identifier}</Row> : null}
        {theme.house ? <Row label="Casa">{houseLabel[theme.house]}</Row> : null}
        {theme.situation ? <Row label="Situação">{theme.situation}</Row> : null}
        {theme.urgency && theme.urgency !== theme.situation ? (
          <Row label="Regime de tramitação">{theme.urgency}</Row>
        ) : null}
        {presented ? <Row label="Apresentação">{presented}</Row> : null}
        {lastAction ? <Row label="Última movimentação">{lastAction}</Row> : null}

        {theme.classifications.length > 0 ? (
          <Row label="Classificação">
            <span className="flex flex-wrap gap-1.5">
              {theme.classifications.map((c) => (
                <Badge key={c.label} tone={c.primary ? "navy" : "gray"}>
                  <span title={c.hierarchy ?? undefined}>{c.label}</span>
                </Badge>
              ))}
            </span>
          </Row>
        ) : null}
      </dl>

      {theme.externalUrl ? (
        <a
          href={theme.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-navy-600 underline hover:text-navy-800"
        >
          Ver a tramitação completa na fonte oficial →
        </a>
      ) : null}
    </section>
  );
}
