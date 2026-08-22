"use server";

/**
 * The second half of citizen sign-up: binding a social identity to a CPF.
 *
 * A social provider proved the person controls an account. This step asks the
 * official registry whether the CPF they typed exists, is regular, and belongs
 * to someone born on the date they claim (`src/lib/identity/validation.ts`).
 * Only then does a User exist and a session open.
 *
 * Be precise about what this buys, because the platform's integrity rests on
 * it: it establishes that **the CPF is real and in good standing**, which is
 * what stops votes cast under numbers from a CPF generator. It does **not**
 * establish possession — someone who knows a relative's CPF and birthday can
 * pass it. That is the accepted starting position until a stronger binding
 * exists (see CLAUDE.md §5), and it is why `cpfVerificationSource` is stored:
 * the assurance level of every account is auditable after the fact.
 */
import { redirect } from "next/navigation";
import { validateCpf, cpfProvider, type CpfSituation } from "@/lib/identity/validation";
import { signInCitizen } from "@/lib/auth/citizen-login";
import { cookies } from "next/headers";
import { CITIZEN_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import {
  MAX_CPF_ATTEMPTS,
  clearPending,
  readPending,
  recordAttempt,
} from "@/lib/auth/pending";
import type { SocialProvider } from "@/generated/prisma";

/** Minimum voting age in Brazil (facultative from 16). */
const MIN_VOTING_AGE = 16;

/** Map the pending flow's provider key onto the stored enum. */
const STORED: Record<string, SocialProvider> = {
  google: "GOOGLE",
  apple: "APPLE",
  facebook: "FACEBOOK",
};

export interface LinkCpfResult {
  ok: boolean;
  error?: string;
  /** True when the flow must restart from the provider (expired or burnt out). */
  restart?: boolean;
}

/** Why a registry-found CPF may still not vote. */
const SITUATION_MESSAGE: Record<CpfSituation, string> = {
  REGULAR: "",
  SUSPENDED: "Este CPF está suspenso na Receita Federal e não pode votar.",
  CANCELLED: "Este CPF está cancelado na Receita Federal e não pode votar.",
  NULL: "Este CPF está anulado na Receita Federal e não pode votar.",
  DECEASED: "A Receita Federal registra o titular deste CPF como falecido.",
  UNKNOWN:
    "A Receita Federal devolveu uma situação cadastral que não reconhecemos. " +
    "Por segurança, o acesso não foi liberado.",
};

/**
 * Accept a birth date the way a Brazilian types it.
 *
 * `DD/MM/AAAA` is the form the field asks for; `YYYY-MM-DD` is accepted too so
 * a browser autofilling a date input still works. Returns the ISO form the
 * registry adapters expect, or null — never a guess, because a
 * misinterpreted date would be reported to the citizen as "does not match".
 */
function toIsoDate(value: string): string | null {
  const trimmed = value.trim();

  const br = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(trimmed);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * Confirm a CPF against the official registry and open the citizen session.
 *
 * Reads the social identity from the pending cookie — a caller with no pending
 * identity has no business creating a citizen, so the flow restarts.
 *
 * Shaped for `useActionState`, hence the ignored previous-state argument.
 *
 * @param formData Form carrying `cpf` and `birthDate` (`DD/MM/AAAA`).
 */
export async function linkCpfAction(
  _prev: LinkCpfResult | null,
  formData: FormData,
): Promise<LinkCpfResult> {
  const pending = await readPending();
  if (!pending) {
    return { ok: false, restart: true, error: "Sua sessão de cadastro expirou." };
  }

  if (pending.attempts >= MAX_CPF_ATTEMPTS) {
    // Burnt out. Restarting costs a full round trip through the provider, which
    // is what makes walking a CPF against candidate birth dates unprofitable.
    await clearPending();
    return {
      ok: false,
      restart: true,
      error: "Muitas tentativas. Entre novamente para tentar de novo.",
    };
  }

  // Checked server-side, before anything is spent: a checkbox is a suggestion
  // until the server insists on it, and this one is a legal precondition —
  // votes are sensitive data and may not be processed without it (LGPD art. 11).
  if (formData.get("consent") !== "1") {
    return {
      ok: false,
      error:
        "Para votar, é preciso autorizar o registro dos seus votos. " +
        "Marque a autorização acima.",
    };
  }

  const cpf = String(formData.get("cpf") ?? "").trim();
  const typedDate = String(formData.get("birthDate") ?? "").trim();
  if (!cpf || !typedDate) {
    return { ok: false, error: "Informe o CPF e a data de nascimento." };
  }

  const birthDate = toIsoDate(typedDate);
  if (!birthDate) {
    // Rejected before spending an attempt or a paid request.
    return { ok: false, error: "Data de nascimento inválida. Use o formato DD/MM/AAAA." };
  }

  // Counted before the call, and regardless of outcome: counting only failures
  // would let an attacker alternate a known-good CPF with guesses to reset it.
  await recordAttempt(pending);

  const result = await validateCpf({ cpf, birthDate });

  switch (result.status) {
    case "malformed":
      // Caught locally — no paid request was made.
      return { ok: false, error: "CPF ou data de nascimento inválidos. Confira os dados." };

    case "mismatch":
      // Deliberately does not say which of the two was wrong: that difference
      // is exactly what a brute-force attempt needs.
      return { ok: false, error: "CPF e data de nascimento não conferem no registro oficial." };

    case "irregular":
      return { ok: false, error: SITUATION_MESSAGE[result.situation] || SITUATION_MESSAGE.UNKNOWN };

    case "underage":
      return {
        ok: false,
        error: `É preciso ter ao menos ${result.minimumAge} anos para votar no Votto.`,
      };

    case "unavailable":
      // Registry outage is never a rejection of the citizen.
      console.error("cpf: registro indisponível:", result.reason);
      return {
        ok: false,
        error: "Não foi possível consultar o registro oficial agora. Tente novamente em instantes.",
      };
  }

  // ── Confirmed ──────────────────────────────────────────────────────────────
  const birthYear = result.birthDate.getUTCFullYear();

  // Backstop for the age gate. The registry enforces its own minimum, but not
  // every provider does (the mock never will), and letting a 12-year-old vote
  // because the adapter stayed quiet is not an acceptable failure mode.
  const age = new Date().getUTCFullYear() - birthYear;
  if (age < MIN_VOTING_AGE) {
    return {
      ok: false,
      error: `É preciso ter ao menos ${MIN_VOTING_AGE} anos para votar no Votto.`,
    };
  }

  // The registry's name wins over the provider's: it is the name on the
  // document the vote is anchored to. The social name is only the fallback.
  const registryName = result.name.trim();
  const [first, ...rest] = registryName.split(/\s+/).filter(Boolean);

  const token = await signInCitizen({
    cpf,
    firstName: first || pending.firstName,
    lastName: rest.join(" ") || pending.lastName,
    birthYear,
    verificationSource: cpfProvider().name,
    politicalConsentAt: new Date(),
    social: { provider: STORED[pending.provider], subject: pending.subject },
  });

  const store = await cookies();
  store.set(CITIZEN_COOKIE, token, sessionCookieOptions());
  await clearPending();

  redirect("/");
}

/** Abandon a half-finished sign-up and return to the login page. */
export async function cancelPendingAction(): Promise<void> {
  await clearPending();
  redirect("/login");
}
