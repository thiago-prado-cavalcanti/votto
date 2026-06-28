"use client";

/**
 * Row actions (edit/block/delete) for a party, bound to the party's kid.
 */
import { RowActions } from "@/components/admin/RowActions";
import { togglePartyStatusAction, deletePartyAction } from "@/lib/actions/admin/parties";
import type { EntityStatus } from "@/generated/prisma";

export function PartyRowActions({ partyKid, status }: { partyKid: string; status: EntityStatus }) {
  return (
    <RowActions
      editHref={`/admin/partidos/${partyKid}`}
      status={status}
      onToggle={() => togglePartyStatusAction(partyKid)}
      onDelete={() => deletePartyAction(partyKid)}
      deleteLabel="Excluir este partido? Esta ação não pode ser desfeita."
    />
  );
}
