/**
 * Badge that renders an EntityStatus in PT-BR with the appropriate tone.
 */
import { Badge } from "@/components/ui";
import type { EntityStatus } from "@/generated/prisma";

export function StatusBadge({ status }: { status: EntityStatus }) {
  return status === "ACTIVE" ? (
    <Badge tone="positive">Ativo</Badge>
  ) : (
    <Badge tone="negative">Bloqueado</Badge>
  );
}
