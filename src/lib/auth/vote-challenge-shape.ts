/**
 * The shape of a vote challenge, and how to say it out loud.
 *
 * Split from `./vote-challenge` because the ballot is a client component and
 * has to render the question, while everything that can *answer* it — the
 * decryption key, the citizen's CPF, the attempt counter — must never cross to
 * the browser. That module is `server-only`; this one carries the two things
 * the client legitimately needs and nothing else.
 *
 * Nothing here is a secret: the positions are visible on screen the moment the
 * challenge is rendered. The answer is what stays behind.
 */

/** Which part of the birth date a challenge asks for. */
export type BirthField = "day" | "month" | "year";

/** What the citizen is shown. Carries no answer. */
export interface VoteChallenge {
  /** Three distinct 1-based positions in the 11-digit CPF, ascending. */
  positions: [number, number, number];
  field: BirthField;
}

const FIELD_LABEL: Record<BirthField, string> = {
  day: "dia",
  month: "mês",
  year: "ano",
};

/** Human phrasing for the date half of the challenge. */
export function describeField(field: BirthField): string {
  return FIELD_LABEL[field];
}
