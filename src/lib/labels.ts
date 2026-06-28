/**
 * PT-BR display labels for enums. Code/data stay in English (CLAUDE.md §10);
 * these are presentation-only.
 */
import type { AgentType, Scope, VoteValue } from "@/generated/prisma";

export const agentTypeLabel: Record<AgentType, string> = {
  FEDERAL_DEPUTY: "Deputado(a) Federal",
  STATE_DEPUTY: "Deputado(a) Estadual",
  COUNCILLOR: "Vereador(a)",
  SENATOR: "Senador(a)",
  GOVERNOR: "Governador(a)",
  MAYOR: "Prefeito(a)",
  PRESIDENT: "Presidente",
};

export const scopeLabel: Record<Scope, string> = {
  NATIONAL: "Nacional",
  STATE: "Estadual",
  MUNICIPAL: "Municipal",
};

export const voteValueLabel: Record<VoteValue, string> = {
  YES: "Sim",
  NO: "Não",
  ABSTENTION: "Abstenção",
};

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
