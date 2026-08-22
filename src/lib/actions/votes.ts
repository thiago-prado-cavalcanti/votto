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
import { markVoteConfirmed } from "@/lib/auth/session";
import {
  challengesIssued,
  issueChallenge,
  verifyChallenge,
  type VoteChallenge,
} from "@/lib/auth/vote-challenge";
import type { VoteValue } from "@/generated/prisma";

export interface CastVoteResult {
  ok: boolean;
  /** The citizen's current choice after the operation. */
  value?: VoteValue;
  error?: string;
  /**
   * Present when the vote is held pending confirmation. The citizen answers it
   * once per session; every later vote in that session goes straight through.
   */
  challenge?: VoteChallenge;
  /** True when the citizen must log in again (challenges exhausted). */
  reauthenticate?: boolean;
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
    select: { id: true, cpfHash: true, birthDateEncrypted: true },
  });
  if (!user) {
    return { ok: false, error: "Cidadão não encontrado." };
  }

  // First vote of the session: hold it and ask who is at the keyboard.
  if (!session.voteConfirmed) {
    const challenge = await issueChallenge(
      session.userKid,
      Boolean(user.birthDateEncrypted),
      await challengesIssued(session.userKid),
    );
    return { ok: false, challenge };
  }

  return castVoteConfirmed(themeKid, value, session.userKid);
}

/**
 * Write the vote. Reached only after the session has answered its challenge,
 * from `castVote` and from `confirmAndCastVote` alike.
 */
async function castVoteConfirmed(
  themeKid: string,
  value: VoteValue,
  userKid: string,
): Promise<CastVoteResult> {
  const user = await db.user.findUnique({
    where: { kid: userKid },
    select: { id: true, cpfHash: true },
  });
  if (!user) return { ok: false, error: "Cidadão não encontrado." };

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

/**
 * Answer the session's vote challenge and, if it is right, cast the vote that
 * was held back.
 *
 * Doing both in one action is deliberate: the citizen pressed "Sim" and then
 * typed five digits, and asking them to press "Sim" a second time would read as
 * the platform having lost the vote.
 *
 * @param themeKid Public kid of the theme being voted on.
 * @param value The vote value the citizen chose before the challenge appeared.
 * @param cpfDigits The three requested CPF digits, in order.
 * @param dateDigits The two digits of the requested part of the birth date.
 */
export async function confirmAndCastVote(
  themeKid: string,
  value: VoteValue,
  cpfDigits: string,
  dateDigits: string,
): Promise<CastVoteResult> {
  const session = await requireCitizen();

  const user = await db.user.findUnique({
    where: { kid: session.userKid },
    select: { cpfEncrypted: true, birthDateEncrypted: true, birthYear: true },
  });
  if (!user) {
    return { ok: false, error: "Cidadão não encontrado." };
  }

  const result = await verifyChallenge(session.userKid, user, { cpfDigits, dateDigits });

  switch (result.status) {
    case "ok":
      break;

    case "wrong":
      return {
        ok: false,
        error:
          result.remaining === 1
            ? "Não confere. Você tem mais uma tentativa."
            : `Não confere. Você tem mais ${result.remaining} tentativas.`,
      };

    case "reissued":
      return {
        ok: false,
        challenge: result.challenge,
        error: "Não confere. Geramos uma nova combinação.",
      };

    case "exhausted":
      return {
        ok: false,
        reauthenticate: true,
        error: "Muitas tentativas. Entre novamente para votar.",
      };

    case "expired":
      return { ok: false, error: "A confirmação expirou. Escolha o seu voto de novo." };

    case "unavailable":
      // A key or data problem on our side. Never phrase it as the citizen's fault.
      console.error("vote: não foi possível montar a confirmação do cidadão.");
      return { ok: false, error: "Não foi possível confirmar agora. Tente em instantes." };
  }

  // Confirmed for the rest of this session, then cast the held vote.
  await markVoteConfirmed(session);
  return castVoteConfirmed(themeKid, value, session.userKid);
}
