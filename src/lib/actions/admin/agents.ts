"use server";

/**
 * Server actions for managing public agents (PublicAgent).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { kid } from "@/lib/ids";
import { requireAdmin } from "@/lib/auth/guards";
import { deriveCpfFields, isValidCpf } from "@/lib/crypto/cpf";
import type { AgentType } from "@/generated/prisma";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const LIST_PATH = "/admin/agentes";

const AGENT_TYPES: [AgentType, ...AgentType[]] = [
  "FEDERAL_DEPUTY",
  "STATE_DEPUTY",
  "COUNCILLOR",
  "SENATOR",
  "GOVERNOR",
  "MAYOR",
  "PRESIDENT",
];

const agentSchema = z.object({
  firstName: z.string().trim().min(1, "Informe o nome."),
  lastName: z.string().trim().min(1, "Informe o sobrenome."),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  imageUrl: z.string().trim().url("URL da imagem inválida.").optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  cpf: z.string().trim().optional().or(z.literal("")),
  type: z.enum(AGENT_TYPES),
  state: z.string().trim().optional().or(z.literal("")),
  municipality: z.string().trim().optional().or(z.literal("")),
  partyKid: z.string().trim().optional().or(z.literal("")),
});

function readForm(formData: FormData) {
  return {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    imageUrl: formData.get("imageUrl"),
    description: formData.get("description"),
    cpf: formData.get("cpf"),
    type: formData.get("type"),
    state: formData.get("state"),
    municipality: formData.get("municipality"),
    partyKid: formData.get("partyKid"),
  };
}

function emptyToNull(value: unknown): string | null {
  const v = (value ?? "").toString().trim();
  return v.length === 0 ? null : v;
}

async function resolvePartyId(partyKid: string | null): Promise<string | null> {
  if (!partyKid) return null;
  const party = await db.party.findUnique({ where: { kid: partyKid }, select: { id: true } });
  return party?.id ?? null;
}

/**
 * Create a new public agent, then redirect back to the agent list.
 */
export async function createAgentAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = agentSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  let cpfFields: ReturnType<typeof deriveCpfFields> | undefined;
  const cpf = (d.cpf ?? "").trim();
  if (cpf.length > 0) {
    if (!isValidCpf(cpf)) return { ok: false, message: "CPF inválido." };
    cpfFields = deriveCpfFields(cpf);
  }

  const partyId = await resolvePartyId(emptyToNull(d.partyKid));

  await db.publicAgent.create({
    data: {
      kid: kid("agt"),
      firstName: d.firstName,
      lastName: d.lastName,
      email: emptyToNull(d.email),
      phone: emptyToNull(d.phone),
      imageUrl: emptyToNull(d.imageUrl),
      description: emptyToNull(d.description),
      type: d.type,
      state: emptyToNull(d.state),
      municipality: emptyToNull(d.municipality),
      partyId,
      ...(cpfFields ?? {}),
    },
  });

  if (partyId) await syncAgentCount(partyId);
  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/**
 * Update an existing public agent identified by its public `kid`.
 */
export async function updateAgentAction(
  agentKid: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = agentSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const existing = await db.publicAgent.findUnique({
    where: { kid: agentKid },
    select: { id: true, partyId: true },
  });
  if (!existing) return { ok: false, message: "Agente não encontrado." };

  let cpfFields: Partial<ReturnType<typeof deriveCpfFields>> = {};
  const cpf = (d.cpf ?? "").trim();
  if (cpf.length > 0) {
    if (!isValidCpf(cpf)) return { ok: false, message: "CPF inválido." };
    cpfFields = deriveCpfFields(cpf);
  }

  const partyId = await resolvePartyId(emptyToNull(d.partyKid));

  await db.publicAgent.update({
    where: { kid: agentKid },
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      email: emptyToNull(d.email),
      phone: emptyToNull(d.phone),
      imageUrl: emptyToNull(d.imageUrl),
      description: emptyToNull(d.description),
      type: d.type,
      state: emptyToNull(d.state),
      municipality: emptyToNull(d.municipality),
      partyId,
      ...cpfFields,
    },
  });

  // Keep denormalized counts in sync if party assignment changed.
  if (existing.partyId && existing.partyId !== partyId) await syncAgentCount(existing.partyId);
  if (partyId && partyId !== existing.partyId) await syncAgentCount(partyId);

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/**
 * Toggle a public agent between ACTIVE and BLOCKED status.
 */
export async function toggleAgentStatusAction(agentKid: string): Promise<ActionResult> {
  await requireAdmin();
  const agent = await db.publicAgent.findUnique({
    where: { kid: agentKid },
    select: { status: true },
  });
  if (!agent) return { ok: false, message: "Agente não encontrado." };
  await db.publicAgent.update({
    where: { kid: agentKid },
    data: { status: agent.status === "ACTIVE" ? "BLOCKED" : "ACTIVE" },
  });
  revalidatePath(LIST_PATH);
  return { ok: true };
}

/**
 * Delete a public agent. Falls back to blocking it when deletion is not possible
 * (e.g. votes still reference it).
 */
export async function deleteAgentAction(agentKid: string): Promise<ActionResult> {
  await requireAdmin();
  const existing = await db.publicAgent.findUnique({
    where: { kid: agentKid },
    select: { partyId: true },
  });
  try {
    await db.publicAgent.delete({ where: { kid: agentKid } });
    if (existing?.partyId) await syncAgentCount(existing.partyId);
    revalidatePath(LIST_PATH);
    return { ok: true, message: "Agente excluído." };
  } catch {
    await db.publicAgent
      .update({ where: { kid: agentKid }, data: { status: "BLOCKED" } })
      .catch(() => undefined);
    revalidatePath(LIST_PATH);
    return {
      ok: false,
      message: "Não foi possível excluir (há votos vinculados). O agente foi bloqueado.",
    };
  }
}

/** Recompute and persist the denormalized agent count of a party (by internal id). */
async function syncAgentCount(partyId: string): Promise<void> {
  const count = await db.publicAgent.count({ where: { partyId } });
  await db.party.update({ where: { id: partyId }, data: { agentCount: count } }).catch(() => undefined);
}
