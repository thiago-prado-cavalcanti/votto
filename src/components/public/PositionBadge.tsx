/**
 * Small badge showing a positioning profile label (e.g. "Equilibrado").
 * Server-component friendly (no client hooks).
 */
import { Badge } from "@/components/ui";

export function PositionBadge({
  profileLabel,
  basis,
}: {
  profileLabel: string;
  basis?: number;
}) {
  if (basis !== undefined && basis === 0) {
    return <Badge tone="gray">Perfil indisponível</Badge>;
  }
  return <Badge tone="colonial">{profileLabel}</Badge>;
}
