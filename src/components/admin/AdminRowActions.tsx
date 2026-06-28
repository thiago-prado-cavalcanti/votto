"use client";

/**
 * Row actions (edit/block/delete) for an administrator, bound to its kid.
 */
import { RowActions } from "@/components/admin/RowActions";
import { toggleAdminStatusAction, deleteAdminAction } from "@/lib/actions/admin/admins";
import type { EntityStatus } from "@/generated/prisma";

export function AdminRowActions({ adminKid, status }: { adminKid: string; status: EntityStatus }) {
  return (
    <RowActions
      editHref={`/admin/administradores/${adminKid}`}
      status={status}
      onToggle={() => toggleAdminStatusAction(adminKid)}
      onDelete={() => deleteAdminAction(adminKid)}
      deleteLabel="Excluir este administrador? Esta ação não pode ser desfeita."
    />
  );
}
