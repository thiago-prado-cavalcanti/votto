/**
 * Turns a verified identity into a Votto citizen session.
 *
 * Every identity provider funnels through here, so the privacy rules live in
 * exactly one place: the CPF is immediately reduced to its three stored
 * representations — encrypted, HMAC'd for dedup, and a six-digit clear prefix —
 * and only the first and last name are persisted in clear (CLAUDE.md §5).
 *
 * The user is keyed by the deterministic CPF hash, so a returning citizen keeps
 * their `kid` and their entire voting history no matter which provider they
 * came back through. That is also what lets one person link Google *and* Apple
 * and still be one voter.
 *
 * **What "verified" means here is weaker than it used to be.** With gov.br the
 * provider handed over a CPF it had already verified. Now the citizen types the
 * CPF and the official registry confirms it exists, is regular, and matches the
 * birth date claimed. That proves the CPF is real; it does not prove the person
 * at the keyboard holds it. The gap is recorded rather than hidden —
 * `cpfVerificationSource` says which registry answered, and a `mock` value means
 * nothing was verified at all.
 */
import "server-only";
import { db } from "@/lib/db";
import { kid } from "@/lib/ids";
import { deriveCpfFields, isValidCpf } from "@/lib/crypto/cpf";
import { createCitizenSessionToken } from "@/lib/auth/session";
import type { SocialProvider } from "@/generated/prisma";

/** The social account to bind to this citizen, when the flow came through one. */
export interface SocialLink {
  provider: SocialProvider;
  /** The provider's `sub`. Internal dedup key only (CLAUDE.md §5). */
  subject: string;
}

/** The minimum a provider must give us to open a session. */
export interface VerifiedIdentity {
  cpf: string;
  firstName: string;
  lastName: string;
  /**
   * Birth YEAR only. The registry returns the full date; the year is what the
   * platform keeps — enough for the age gate and anonymized demographics, and
   * one less identifying field in a leak.
   */
  birthYear?: number;
  /**
   * Full birth date, already encrypted by the caller. Needed by the vote
   * challenge, which asks for the day or the month; only `birthYear` is ever
   * readable in the database.
   */
  birthDateEncrypted?: string;
  /** Which registry confirmed the CPF (`infosimples`, `serpro`, `mock`). */
  verificationSource?: string;
  /**
   * When the citizen gave the specific, highlighted consent for their votes to
   * be processed (LGPD art. 11, I). Recorded because art. 8º, §2 puts the
   * burden of proving consent on the controller.
   */
  politicalConsentAt?: Date;
  social?: SocialLink;
}

/**
 * Upsert the citizen, bind the social account, and mint a session token.
 * Returns the signed JWT; the caller sets it as a cookie on its own response.
 *
 * Throws on an invalid CPF — the one-vote-per-citizen rule depends on it, and a
 * caller that reaches here with a bad one has skipped its own checks.
 */
export async function signInCitizen(identity: VerifiedIdentity): Promise<string> {
  if (!isValidCpf(identity.cpf)) {
    throw new Error("CPF inválido recebido do provedor de identidade.");
  }

  const { cpfEncrypted, cpfHash, cpfPrefix } = deriveCpfFields(identity.cpf);
  const firstName = identity.firstName.trim() || "Cidadão";
  const lastName = identity.lastName.trim();
  const verified = identity.verificationSource
    ? { cpfVerifiedAt: new Date(), cpfVerificationSource: identity.verificationSource }
    : {};

  const user = await db.user.upsert({
    where: { cpfHash },
    create: {
      kid: kid("usr"),
      firstName,
      lastName,
      cpfEncrypted,
      cpfHash,
      cpfPrefix,
      birthYear: identity.birthYear,
      birthDateEncrypted: identity.birthDateEncrypted,
      politicalConsentAt: identity.politicalConsentAt,
      ...verified,
    },
    update: {
      firstName,
      lastName,
      birthYear: identity.birthYear,
      birthDateEncrypted: identity.birthDateEncrypted,
      politicalConsentAt: identity.politicalConsentAt,
      ...verified,
    },
    select: { id: true, kid: true, cpfHash: true, firstName: true, lastName: true },
  });

  if (identity.social) {
    // Upserted on (provider, subject) so a returning citizen re-uses the row.
    // The `userId` on update matters: if the same social account is ever
    // presented with a different CPF, it follows the CPF rather than silently
    // keeping the old citizen's votes.
    await db.socialAccount.upsert({
      where: {
        provider_subject: {
          provider: identity.social.provider,
          subject: identity.social.subject,
        },
      },
      create: {
        provider: identity.social.provider,
        subject: identity.social.subject,
        userId: user.id,
      },
      update: { userId: user.id, lastLoginAt: new Date() },
      select: { id: true },
    });
  }

  return createCitizenSessionToken({
    kind: "citizen",
    userKid: user.kid,
    cpfHash: user.cpfHash,
    name: `${user.firstName} ${user.lastName}`.trim(),
  });
}

/**
 * Find the citizen already bound to a social account, if any.
 *
 * This is the returning-login path: a known (provider, subject) pair skips the
 * CPF step entirely, because the CPF behind it was confirmed when the account
 * was first linked.
 */
export async function findCitizenBySocial(link: SocialLink) {
  const account = await db.socialAccount.findUnique({
    where: { provider_subject: { provider: link.provider, subject: link.subject } },
    select: {
      id: true,
      user: { select: { kid: true, cpfHash: true, firstName: true, lastName: true } },
    },
  });
  return account;
}

/** Open a session for an already-linked citizen, refreshing the login stamp. */
export async function resumeCitizenSession(
  account: NonNullable<Awaited<ReturnType<typeof findCitizenBySocial>>>,
): Promise<string> {
  await db.socialAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date() },
    select: { id: true },
  });

  return createCitizenSessionToken({
    kind: "citizen",
    userKid: account.user.kid,
    cpfHash: account.user.cpfHash,
    name: `${account.user.firstName} ${account.user.lastName}`.trim(),
  });
}
