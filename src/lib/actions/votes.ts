"use server";

/**
 * Citizen voting server action.
 *
 * Enforces "one vote per CPF per theme" (the citizen may change their vote, which
 * updates it) and keeps the denormalized tallies and alignment caches fresh.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCitizen } from "@/lib/auth/guards";
import type { VoteValue } from "@/generated/prisma";

export interface CastVoteResult {
  ok: boolean;
  /** The citizen's current choice after the operation. */
  value?: VoteValue;
  error?: string;
}

/**
 * Cast (or change) the logged-in citizen's vote on a theme.
 *
 * Looks up the citizen and theme by their session/kid, upserts the citizen vote
 * on the unique (cpfHash, themeId) pair with voterType USER, recomputes the
 * theme tallies, bumps the user's voteVersion to invalidate alignment caches and
 * revalidates the relevant pages. Never exposes internal ids.
 *
 * @param themeKid Public kid of the theme being voted on.
 * @param value The vote value (YES | NO | ABSTENTION).
 */
export async function castVote(themeKid: string, value: VoteValue): Promise<CastVoteResult> {
  const session = await requireCitizen();

  const user = await db.user.findUnique({
    where: { kid: session.userKid },
    select: { id: true, cpfHash: true },
  });
  if (!user) {
    return { ok: false, error: "Cidadão não encontrado." };
  }

  const theme = await db.theme.findUnique({
    where: { kid: themeKid },
    select: { id: true, status: true },
  });
  if (!theme || theme.status !== "ACTIVE") {
    return { ok: false, error: "Tema indisponível para votação." };
  }

  await db.vote.upsert({
    where: { cpfHash_themeId: { cpfHash: user.cpfHash, themeId: theme.id } },
    create: {
      value,
      voterType: "USER",
      themeId: theme.id,
      userId: user.id,
      cpfHash: user.cpfHash,
    },
    update: { value, userId: user.id },
  });

  const { recomputeThemeTallies } = await import("@/lib/domain/theme");
  await recomputeThemeTallies(theme.id);

  await db.user.update({
    where: { id: user.id },
    data: { voteVersion: { increment: 1 } },
  });

  revalidatePath("/");
  revalidatePath("/temas");
  revalidatePath(`/temas/${themeKid}`);
  revalidatePath("/agentes");

  return { ok: true, value };
}
