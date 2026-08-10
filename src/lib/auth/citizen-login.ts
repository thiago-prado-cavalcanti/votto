/**
 * Turns a provider-verified identity into a Votto citizen session.
 *
 * Shared by every identity provider (the real gov.br flow and the development
 * mock), so the privacy rules live in exactly one place: the CPF is immediately
 * reduced to its three stored representations — encrypted, HMAC'd for dedup, and
 * a six-digit clear prefix — and only the first and last name are persisted in
 * clear (CLAUDE.md §5).
 *
 * The user is keyed by the deterministic CPF hash, so returning citizens keep
 * their `kid` and their entire voting history across logins.
 */
import "server-only";
import { db } from "@/lib/db";
import { kid } from "@/lib/ids";
import { deriveCpfFields, isValidCpf } from "@/lib/crypto/cpf";
import { createCitizenSessionToken } from "@/lib/auth/session";

/** The minimum a provider must give us to open a session. */
export interface VerifiedIdentity {
  cpf: string;
  firstName: string;
  lastName: string;
}

/**
 * Upsert the citizen and mint a session token. Returns the signed JWT; the
 * caller sets it as a cookie on its own redirect response.
 *
 * Throws on an invalid CPF — a provider that returns one cannot be trusted to
 * have verified the identity, and the one-vote-per-citizen rule depends on it.
 */
export async function signInCitizen(identity: VerifiedIdentity): Promise<string> {
  if (!isValidCpf(identity.cpf)) {
    throw new Error("CPF inválido recebido do provedor de identidade.");
  }

  const { cpfEncrypted, cpfHash, cpfPrefix } = deriveCpfFields(identity.cpf);
  const firstName = identity.firstName.trim() || "Cidadão";
  const lastName = identity.lastName.trim();

  const user = await db.user.upsert({
    where: { cpfHash },
    create: { kid: kid("usr"), firstName, lastName, cpfEncrypted, cpfHash, cpfPrefix },
    update: { firstName, lastName },
    select: { kid: true, cpfHash: true, firstName: true, lastName: true },
  });

  return createCitizenSessionToken({
    kind: "citizen",
    userKid: user.kid,
    cpfHash: user.cpfHash,
    name: `${user.firstName} ${user.lastName}`.trim(),
  });
}
