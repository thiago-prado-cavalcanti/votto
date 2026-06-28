"use client";

/**
 * Client-side row action buttons for admin list tables: edit link,
 * block/unblock toggle, and delete (with confirmation). All mutations run via
 * server actions passed in by the parent server component.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ButtonLink, Button } from "@/components/ui";
import type { EntityStatus } from "@/generated/prisma";

interface ActionResult {
  ok: boolean;
  message?: string;
}

export function RowActions({
  editHref,
  status,
  onToggle,
  onDelete,
  deleteLabel = "Excluir este registro?",
}: {
  editHref: string;
  status: EntityStatus;
  onToggle: () => Promise<ActionResult>;
  onDelete: () => Promise<ActionResult>;
  deleteLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function handleToggle() {
    startTransition(async () => {
      const res = await onToggle();
      if (res.message) window.alert(res.message);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm(deleteLabel)) return;
    startTransition(async () => {
      const res = await onDelete();
      if (res.message) window.alert(res.message);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <ButtonLink href={editHref} variant="outline" size="sm">
        Editar
      </ButtonLink>
      <Button variant="ghost" size="sm" onClick={handleToggle} disabled={pending}>
        {status === "ACTIVE" ? "Bloquear" : "Desbloquear"}
      </Button>
      <Button variant="danger" size="sm" onClick={handleDelete} disabled={pending}>
        Excluir
      </Button>
    </div>
  );
}
