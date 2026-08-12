/**
 * Citizen CPF validation against an official registry.
 *
 * This module is the single entry point the application uses to answer one
 * question: *does this CPF exist, is it regular, and does it belong to someone
 * born on the date the citizen claims?* It deliberately says nothing about
 * **who is at the keyboard** — proving that binding needs a separate step
 * (see `docs/integracao.md`), and callers must not treat a `ok` result as
 * proof of possession.
 *
 * Design notes:
 *
 *  - **Provider-agnostic.** The concrete registry sits behind {@link CpfProvider}
 *    so the flow can be built before the commercial decision is settled, and so
 *    a provider can be swapped without touching callers.
 *  - **Check digits are verified locally first.** Malformed input never reaches
 *    the provider, so it never costs a paid request.
 *  - **The CPF is never logged.** Errors carry the provider's message only;
 *    callers should keep it that way when surfacing failures.
 *
 * A note on provider choice: the registry is protected personal data, and the
 * only channel licensed to serve it is Serpro (directly or through resellers).
 * A provider offering it far below Serpro's own floor price, or advertising a
 * *local copy* of the full base, is not serving official data — see
 * `docs/integracao.md`. Wiring one in would make Votto the controller of
 * unlawfully sourced personal data.
 */
import { isValidCpf, normalizeCpf } from "@/lib/crypto/cpf";
import { env } from "@/lib/env";
import { createInfosimplesProvider } from "@/lib/identity/infosimples";
import { createSerproProvider } from "@/lib/identity/serpro";

/** Registry status of a CPF, normalized across providers. */
export type CpfSituation =
  | "REGULAR"
  | "SUSPENDED"
  | "CANCELLED"
  | "NULL"
  | "DECEASED"
  | "UNKNOWN";

/**
 * Outcome of a validation attempt.
 *
 * `unavailable` is deliberately distinct from every rejection: it means the
 * registry could not be reached, so the caller must retry or degrade rather
 * than treat the citizen as invalid.
 */
export type CpfValidation =
  /**
   * CPF exists and is regular.
   *
   * `birthDateVerified` says whether the registry *checked* the date against
   * the citizen's claim (challenge mode) or merely reported it (lookup mode).
   * Only the former carries any assurance, and the distinction belongs in the
   * audit trail — do not collapse the two.
   */
  | { status: "ok"; name: string; birthDate: Date; birthDateVerified: boolean }
  /** Found, but not in a state that may vote (suspended, cancelled, deceased…). */
  | { status: "irregular"; situation: CpfSituation; description: string }
  /** No CPF matches this number + birth date pair. */
  | { status: "mismatch" }
  /** Failed the local check-digit test; no request was made. */
  | { status: "malformed" }
  /** The registry refuses to answer for minors. `minimumAge` is what it enforced. */
  | { status: "underage"; minimumAge: number }
  /** Registry unreachable or misconfigured — retry, do not reject the citizen. */
  | { status: "unavailable"; reason: string };

/** Input accepted by {@link validateCpf}. */
export type CpfValidationInput = {
  /** CPF in any format; punctuation is stripped. */
  cpf: string;
  /**
   * Birth date as `YYYY-MM-DD`, as declared by the citizen. Optional, and the
   * choice matters:
   *
   *  - **Provided (challenge).** The registry only answers if the pair matches,
   *    so the citizen had to know something beyond the number.
   *  - **Omitted (lookup).** The registry returns the holder's name from the
   *    number alone. That confirms the CPF is real, but adds *no* assurance
   *    about who is at the keyboard — and it means Votto is retrieving a
   *    stranger's name on nothing but a typed number.
   *
   * Prefer the challenge form.
   */
  birthDate?: string;
};

/**
 * A concrete registry adapter.
 *
 * Implementations receive already-normalized input (11 digits, valid check
 * digits, `YYYY-MM-DD`) and must never throw: transport and protocol failures
 * are returned as `unavailable` so callers have a single control flow.
 */
export type CpfProvider = {
  /** Identifier used in logs and diagnostics. Never include credentials. */
  readonly name: string;
  /** `birthDate` is `null` in lookup mode and `YYYY-MM-DD` in challenge mode. */
  validate(cpf: string, birthDate: string | null): Promise<CpfValidation>;
};

/**
 * Development provider. Accepts any structurally valid CPF and derives a
 * deterministic placeholder name, so the signup flow can be exercised end to
 * end without contracting a registry or touching real personal data.
 */
function createMockProvider(): CpfProvider {
  return {
    name: "mock",
    async validate(cpf, birthDate) {
      // Any CPF starting with `000` exercises the rejection path. The trigger is
      // in the base digits, not the two check digits, so a fixture can actually
      // be typed into a form — e.g. 000.000.004-34.
      if (cpf.startsWith("000")) {
        return { status: "mismatch" };
      }
      return {
        status: "ok",
        name: `Cidadao Teste ${cpf.slice(0, 3)}`,
        // With no date to echo, invent a stable one so dev fixtures don't drift.
        birthDate: new Date(`${birthDate ?? "1980-01-01"}T00:00:00Z`),
        birthDateVerified: birthDate !== null,
      };
    },
  };
}

let cached: CpfProvider | null = null;

/**
 * The configured provider, built once per process.
 *
 * Falls back to the mock provider whenever the real one is not fully
 * configured, so local development and `next build` never require credentials.
 */
export function cpfProvider(): CpfProvider {
  if (cached) return cached;
  if (!isCpfValidationConfigured()) {
    cached = createMockProvider();
  } else if (env.cpfValidation.provider === "infosimples") {
    cached = createInfosimplesProvider();
  } else {
    cached = createSerproProvider();
  }
  return cached;
}

/** Whether a real (non-mock) registry is fully configured. */
export function isCpfValidationConfigured(): boolean {
  const { provider, serpro, infosimples } = env.cpfValidation;
  switch (provider) {
    case "serpro":
      return serpro.consumerKey.length > 0 && serpro.consumerSecret.length > 0;
    case "infosimples":
      return infosimples.token.length > 0;
    default:
      return false;
  }
}

/**
 * Validate a citizen's CPF against the configured official registry.
 *
 * Check digits and the birth-date format are verified locally first, so
 * malformed input costs nothing. Returns a discriminated union rather than
 * throwing — including for registry outages, which surface as `unavailable`
 * and must not be read as a rejection of the citizen.
 */
export async function validateCpf(input: CpfValidationInput): Promise<CpfValidation> {
  const cpf = normalizeCpf(input.cpf);
  if (!isValidCpf(cpf)) {
    return { status: "malformed" };
  }

  // Absent birth date = lookup mode. A *present but unparseable* one is an
  // error, and must never silently downgrade the call to a weaker lookup.
  let birthDate: string | null = null;
  if (input.birthDate !== undefined) {
    birthDate = normalizeBirthDate(input.birthDate);
    if (!birthDate) return { status: "malformed" };
  }

  return cpfProvider().validate(cpf, birthDate);
}

/**
 * Accept `YYYY-MM-DD` and reject anything that is not a real calendar date.
 * Returns the canonical string, or null when the input cannot be trusted.
 */
function normalizeBirthDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  // Reject dates that JS silently rolls over (e.g. 2000-02-31 → 2000-03-02).
  const rolledOver =
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day);
  if (rolledOver) return null;

  return `${year}-${month}-${day}`;
}
