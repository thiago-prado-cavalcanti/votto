"use client";

/**
 * Row actions (edit/block/delete) for a theme, bound to the theme's kid.
 */
import { RowActions } from "@/components/admin/RowActions";
import { toggleThemeStatusAction, deleteThemeAction } from "@/lib/actions/admin/themes";
import type { EntityStatus } from "@/generated/prisma";

export function ThemeRowActions({ themeKid, status }: { themeKid: string; status: EntityStatus }) {
  return (
    <RowActions
      editHref={`/admin/temas/${themeKid}`}
      status={status}
      onToggle={() => toggleThemeStatusAction(themeKid)}
      onDelete={() => deleteThemeAction(themeKid)}
      deleteLabel="Excluir este tema? Esta ação não pode ser desfeita."
    />
  );
}
