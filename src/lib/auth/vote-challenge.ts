/**
 * The confirmation a citizen answers once per session before their first vote.
 *
 * It asks for three digits of their CPF, by position, plus the day, the month
 * or the year of their birth — a different combination every time one is
 * issued. Five digits, from two documents nobody carries in their head, which
 * is the point: it costs the account holder a moment and costs anyone holding
 * a borrowed phone the whole game.
 *
 * **What it is for, precisely.** The session already proves someone logged in.
 * This proves the person *at the keyboard right now* holds the data the account
 * was opened with. It is the answer to an unlocked phone, a shared computer, or
 * a session lifted from a browser — not to a determined fraudster, who has the
 * CPF anyway.
 *
 * Once per session, by construction: the answer is recorded as a claim on the
 * session token itself, so it dies with the session and a fresh login always
 * asks again. No second clock to drift, nothing to expire mid-vote.
 *
 * The challenge itself lives in a signed httpOnly cookie — the positions are
 * public knowledge the moment they are rendered, but the *answer* never leaves
 * the server, and the attempt counter has to sit somewhere a client cannot
 * reset.
 */
import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomInt } from "node:crypto";
import { env } from "@/lib/env";
import { decryptCpf } from "@/lib/crypto/cpf";
import { tryOpen } from "@/lib/crypto/box";
import type { BirthField, VoteChallenge } from "@/lib/auth/vote-challenge-shape";

// Re-exported so server callers have one import; the client imports the shape
// module directly, since this one is server-only.
export type { BirthField, VoteChallenge };

const secret = () => new TextEncoder().encode(env.authSecret);

export const VOTE_CHALLENGE_COOKIE = "votto_vote_challenge";

/** Lifetime of one issued challenge. Generous: it is answered immediately. */
const MAX_AGE = 60 * 15;

/** Wrong answers allowed before the challenge is torn up and a new one issued. */
export const MAX_CHALLENGE_ATTEMPTS = 3;

/**
 * Challenges a citizen may burn in one session before being sent back to the
 * login. Three challenges of three attempts each is nine guesses at a five
 * digit answer — far from useful, and far past honest fumbling.
 */
export const MAX_CHALLENGES_PER_SESSION = 3;

interface ChallengeToken extends VoteChallenge {
  kind: "vote-challenge";
  /** Bound to one citizen: a challenge cannot be carried to another account. */
  userKid: string;
  attempts: number;
  /** How many challenges this session has already burned. */
  issued: number;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

/** Three distinct positions in ascending order, drawn with a CSPRNG. */
function drawPositions(): [number, number, number] {
  const picked = new Set<number>();
  while (picked.size < 3) picked.add(randomInt(1, 12)); // 1..11, inclusive
  const sorted = [...picked].sort((a, b) => a - b);
  return [sorted[0], sorted[1], sorted[2]];
}

/**
 * Issue a fresh challenge for this citizen and persist it.
 *
 * `hasFullBirthDate` narrows the draw: an account created before the birth date
 * was stored can only be asked for the year, which is the one part still on
 * record. Asking such a citizen for the day would be unanswerable.
 */
export async function issueChallenge(
  userKid: string,
  hasFullBirthDate: boolean,
  issued = 0,
): Promise<VoteChallenge> {
  const fields: BirthField[] = hasFullBirthDate ? ["day", "month", "year"] : ["year"];
  const challenge: VoteChallenge = {
    positions: drawPositions(),
    field: fields[randomInt(0, fields.length)],
  };

  const token = await new SignJWT({
    ...challenge,
    kind: "vote-challenge",
    userKid,
    attempts: 0,
    issued: issued + 1,
  } satisfies ChallengeToken)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(VOTE_CHALLENGE_COOKIE, token, cookieOptions());
  return challenge;
}

/** Read the outstanding challenge, or null when there is none. */
async function readChallenge(userKid: string): Promise<ChallengeToken | null> {
  const store = await cookies();
  const token = store.get(VOTE_CHALLENGE_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "vote-challenge") return null;
    const challenge = payload as unknown as ChallengeToken;
    // A challenge issued for another citizen is not a challenge for this one.
    return challenge.userKid === userKid ? challenge : null;
  } catch {
    return null;
  }
}

/** Drop the outstanding challenge. */
export async function clearChallenge(): Promise<void> {
  const store = await cookies();
  store.delete(VOTE_CHALLENGE_COOKIE);
}

/** The stored secrets a challenge is checked against. */
export interface ChallengeSubject {
  cpfEncrypted: string;
  birthDateEncrypted: string | null;
  birthYear: number | null;
}

/** Outcome of checking an answer. */
export type ChallengeResult =
  /** Correct. The caller should mark the session confirmed and proceed. */
  | { status: "ok" }
  /** Wrong, and the same challenge still stands. */
  | { status: "wrong"; remaining: number }
  /** Wrong too often: a fresh challenge was issued in its place. */
  | { status: "reissued"; challenge: VoteChallenge }
  /** Out of challenges for this session — send the citizen back to the login. */
  | { status: "exhausted" }
  /** No challenge outstanding, or it expired. */
  | { status: "expired" }
  /** The record cannot answer this challenge (missing or unreadable data). */
  | { status: "unavailable" };

/** The two digits a challenge expects for its date half. */
function expectedDateDigits(
  field: BirthField,
  subject: ChallengeSubject,
): string | null {
  const isoDate = tryOpen(subject.birthDateEncrypted);

  if (field === "year") {
    // The clear year is the fallback for records that predate the encrypted
    // date; when both exist they agree.
    const year = isoDate ? Number(isoDate.slice(0, 4)) : subject.birthYear;
    return year ? String(year).slice(-2) : null;
  }

  if (!isoDate) return null;
  // `YYYY-MM-DD`
  return field === "month" ? isoDate.slice(5, 7) : isoDate.slice(8, 10);
}

/**
 * Check an answer against the outstanding challenge.
 *
 * Both halves are compared in constant-ish time only insofar as they are short
 * fixed-length strings; the real defence is the attempt cap, not timing.
 */
export async function verifyChallenge(
  userKid: string,
  subject: ChallengeSubject,
  answer: { cpfDigits: string; dateDigits: string },
): Promise<ChallengeResult> {
  const challenge = await readChallenge(userKid);
  if (!challenge) return { status: "expired" };

  let cpf: string;
  try {
    cpf = decryptCpf(subject.cpfEncrypted);
  } catch {
    // An unreadable CPF means a key problem, not a wrong answer. Never let that
    // read as a failed challenge — the citizen would be blamed for our outage.
    return { status: "unavailable" };
  }

  const expectedCpf = challenge.positions.map((p) => cpf[p - 1] ?? "").join("");
  const expectedDate = expectedDateDigits(challenge.field, subject);
  if (expectedCpf.length !== 3 || !expectedDate) {
    return { status: "unavailable" };
  }

  const givenCpf = answer.cpfDigits.replace(/\D/g, "");
  const givenDate = answer.dateDigits.replace(/\D/g, "").padStart(2, "0");

  if (givenCpf === expectedCpf && givenDate === expectedDate) {
    await clearChallenge();
    return { status: "ok" };
  }

  const attempts = challenge.attempts + 1;
  if (attempts < MAX_CHALLENGE_ATTEMPTS) {
    // Same challenge, one attempt fewer. Re-signed so the count cannot be
    // rolled back by restoring an older cookie.
    const token = await new SignJWT({ ...challenge, attempts } satisfies ChallengeToken)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${MAX_AGE}s`)
      .sign(secret());
    const store = await cookies();
    store.set(VOTE_CHALLENGE_COOKIE, token, cookieOptions());
    return { status: "wrong", remaining: MAX_CHALLENGE_ATTEMPTS - attempts };
  }

  if (challenge.issued >= MAX_CHALLENGES_PER_SESSION) {
    await clearChallenge();
    return { status: "exhausted" };
  }

  // Burnt this challenge; draw a different one rather than letting the citizen
  // keep grinding at the same three positions.
  const next = await issueChallenge(
    userKid,
    Boolean(subject.birthDateEncrypted),
    challenge.issued,
  );
  return { status: "reissued", challenge: next };
}

/** How many challenges this session has already spent. */
export async function challengesIssued(userKid: string): Promise<number> {
  const challenge = await readChallenge(userKid);
  return challenge?.issued ?? 0;
}
