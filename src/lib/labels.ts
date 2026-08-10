/**
 * PT-BR display labels for enums. Code/data stay in English (CLAUDE.md §10);
 * these are presentation-only.
 */
import type { AgentType, House, Scope, VoteValue } from "@/generated/prisma";

export const agentTypeLabel: Record<AgentType, string> = {
  FEDERAL_DEPUTY: "Deputado(a) Federal",
  STATE_DEPUTY: "Deputado(a) Estadual",
  COUNCILLOR: "Vereador(a)",
  SENATOR: "Senador(a)",
  GOVERNOR: "Governador(a)",
  MAYOR: "Prefeito(a)",
  PRESIDENT: "Presidente",
};

/** Originating legislative house of an imported theme. */
export const houseLabel: Record<House, string> = {
  CAMARA: "Câmara dos Deputados",
  SENADO: "Senado Federal",
  CONGRESSO: "Congresso Nacional",
};

/** Compact house label, for badges where space is tight. */
export const houseShortLabel: Record<House, string> = {
  CAMARA: "Câmara",
  SENADO: "Senado",
  CONGRESSO: "Congresso",
};

export const scopeLabel: Record<Scope, string> = {
  NATIONAL: "Nacional",
  STATE: "Estadual",
  MUNICIPAL: "Municipal",
};

/** Vote labels for public agents (their formal position). */
export const voteValueLabel: Record<VoteValue, string> = {
  YES: "Sim",
  NO: "Não",
  ABSTENTION: "Abstenção",
};

/** Vote labels for citizens — they vote "Neutro" rather than abstaining. */
export const citizenVoteValueLabel: Record<VoteValue, string> = {
  YES: "Sim",
  NO: "Não",
  ABSTENTION: "Neutro",
};

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
