"use client";

/**
 * Row actions (edit/block/delete) for a public agent, bound to the agent's kid.
 */
import { RowActions } from "@/components/admin/RowActions";
import { toggleAgentStatusAction, deleteAgentAction } from "@/lib/actions/admin/agents";
import type { EntityStatus } from "@/generated/prisma";

export function AgentRowActions({ agentKid, status }: { agentKid: string; status: EntityStatus }) {
  return (
    <RowActions
      editHref={`/admin/agentes/${agentKid}`}
      status={status}
      onToggle={() => toggleAgentStatusAction(agentKid)}
      onDelete={() => deleteAgentAction(agentKid)}
      deleteLabel="Excluir este agente? Esta ação não pode ser desfeita."
    />
  );
}
