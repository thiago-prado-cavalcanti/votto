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
 * **Com que frequência.** Dentro de uma sessão, uma vez: a resposta vira um
 * claim no próprio token, que morre com ela. Entre sessões, quem manda é
 * `User.identityConfirmedAt` — o cadastro conta como prova, e um desafio novo só
 * é pedido depois de `IDENTITY_MAX_AGE_MS`. Perguntar a quem acabou de
 * confirmar CPF e data de nascimento contra o registro da Receita é pedir um
 * pedaço do que a pessoa acabou de provar por inteiro.
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

/**
 * Quanto tempo uma prova de identidade vale antes de o desafio voltar a ser
 * pedido.
 *
 * Vinte e quatro horas. O que ela conserta é a redundância logo após o
 * cadastro — o cidadão acabou de digitar CPF e data de nascimento inteiros e
 * teve os dois confirmados contra o registro da Receita, e a plataforma
 * respondia pedindo um pedaço do que ele acabou de provar.
 *
 * O que ela custa está escrito na migration 0017 e não deve ser esquecido: um
 * aparelho destravado tomado dentro da janela vota sem responder nada, onde
 * antes toda sessão nova perguntava.
 */
export const IDENTITY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Se o cidadão precisa responder ao desafio antes de votar.
 *
 * `confirmedAt` é `User.identityConfirmedAt`: o cadastro grava, o desafio
 * respondido regrava. `null` — conta antiga, sem registro — sempre pergunta.
 */
export function challengeRequired(confirmedAt: Date | null | undefined, now = new Date()): boolean {
  if (!confirmedAt) return true;
  return now.getTime() - confirmedAt.getTime() > IDENTITY_MAX_AGE_MS;
}

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

/**
 * Os **três primeiros** ou os **três últimos** dígitos, sorteados a cada
 * desafio.
 *
 * Duas janelas, e não as nove de antes, porque as duas pontas são as únicas que
 * se leem **sem contar**. Um CPF é impresso agrupado — 529.982.247-25 —, então
 * "os três primeiros" é o primeiro bloco e "os três últimos" é o final; qualquer
 * janela no meio obriga a percorrer onze dígitos contando, num cartão segurado
 * com uma mão. E o erro de contagem é mudo: um dígito trocado é indistinguível
 * de não saber o CPF, então o cidadão honesto queima uma tentativa sem entender
 * por quê.
 *
 * O custo em espaço de busca é declarado: duas janelas contra nove. Isso só
 * importaria contra quem está adivinhando dígitos, e este desafio nunca foi
 * para essa pessoa — ele existe para que um celular destravado ou uma sessão
 * esquecida não votem em nome de alguém (§5). Quem sabe o CPF passa dos dois
 * jeitos; quem não sabe falha dos dois. O que limita o chute são as três
 * tentativas e os três desafios por sessão, não a geometria das posições.
 */
function drawPositions(): [number, number, number] {
  return randomInt(0, 2) === 0 ? [1, 2, 3] : [9, 10, 11];
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
