/**
 * Infosimples adapter — real-time automation of Receita Federal's public CPF
 * portal, roughly a third of Serpro's price at low volume.
 *
 * How it differs from Serpro, and why that matters:
 *
 *  - **It queries the official source per request; it holds no database.** The
 *    portal requires CPF *and* birth date as input, so this provider can only
 *    ever *confirm* what the citizen already supplied — it cannot disclose a
 *    stranger's name from a number alone. That is the test a provider must pass
 *    before it may be wired in (see `docs/integracao.md`).
 *  - **Therefore it has no lookup mode.** Asked to validate a CPF without a
 *    birth date, it reports `unavailable` rather than pretending. The
 *    limitation is the official portal's, not the vendor's.
 *  - **Continuity, not legality, is the residual risk.** Automating a portal
 *    can run against its terms of use, so there is no availability guarantee:
 *    treat `unavailable` as expected background noise and keep the Serpro
 *    adapter as the fallback for when the volume justifies a direct contract.
 *
 * Contract confirmed against the vendor's open-source SDKs (`infosimples/
 * infosimples-data`, `alanmatiasdev/infosimples-sdk`), since the reference docs
 * sit behind a customer login.
 */
import { env } from "@/lib/env";
import { situationFromDescription } from "@/lib/identity/situation";
import type { CpfProvider, CpfValidation } from "@/lib/identity/validation";

const ENDPOINT = "https://api.infosimples.com/api/v2/consultas/receita-federal/cpf";

/** Seconds the vendor may spend driving the portal before giving up. */
const REMOTE_TIMEOUT_SECONDS = 60;

/** Local ceiling, kept above the remote one so we never abort a paid request. */
const TIMEOUT_MS = (REMOTE_TIMEOUT_SECONDS + 15) * 1000;

const RETRIES = 2;
const BACKOFF_MS = 800;

/**
 * Envelope codes. `200`/`201` are success; everything else is an error, and the
 * split below decides whether it is the citizen's fault or ours.
 */
const CODE = {
  singleResult: 200,
  multipleResults: 201,
  unauthorized: 601,
  invalidRequest: 604,
  emptyParameters: 606,
  invalidParameters: 607,
  refusedParameters: 608,
  incompleteData: 611,
  inexistent: 612,
} as const;

type InfosimplesResponse = {
  code?: number;
  code_message?: string;
  data?: Array<{
    nome?: string;
    data_nascimento?: string;
    situacao_cadastral?: string;
    ano_obito?: string;
  }>;
};

/** `YYYY-MM-DD` → `DD/MM/YYYY`, the format the vendor expects. */
function toVendorDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function createInfosimplesProvider(): CpfProvider {
  const { token } = env.cpfValidation.infosimples;

  return {
    name: "infosimples",

    async validate(cpf, birthDate): Promise<CpfValidation> {
      if (birthDate === null) {
        return {
          status: "unavailable",
          reason: "provider requires a birth date (Receita's portal has no lookup mode)",
        };
      }

      let lastError = "";
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        try {
          const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              token,
              cpf,
              birthdate: toVendorDate(birthDate),
              timeout: REMOTE_TIMEOUT_SECONDS,
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });

          // Transport-level failures are transient; the envelope carries the
          // real outcome, so anything non-2xx here is infrastructure.
          if (res.status === 429 || res.status >= 500) {
            lastError = `HTTP ${res.status}`;
            await sleep(BACKOFF_MS * Math.pow(2, attempt));
            continue;
          }

          const body = (await res.json()) as InfosimplesResponse;
          const outcome = interpret(body, birthDate);

          // `try_again`-class codes are worth one more attempt; the rest are final.
          if (outcome.status === "unavailable" && outcome.retryable && attempt < RETRIES) {
            lastError = outcome.reason;
            await sleep(BACKOFF_MS * Math.pow(2, attempt));
            continue;
          }
          return strip(outcome);
        } catch (err) {
          // Never let the CPF reach a log line via an error message.
          lastError = err instanceof Error ? err.message : "request failed";
          if (attempt === RETRIES) break;
          await sleep(BACKOFF_MS * Math.pow(2, attempt));
        }
      }

      return { status: "unavailable", reason: lastError || "provider unreachable" };
    },
  };
}

/**
 * Internal shape: the public `unavailable` variant is replaced by one carrying
 * `retryable`, which steers the retry loop and is dropped before returning.
 */
type Interpreted =
  | Exclude<CpfValidation, { status: "unavailable" }>
  | { status: "unavailable"; reason: string; retryable?: boolean };

function strip(outcome: Interpreted): CpfValidation {
  if (outcome.status === "unavailable") {
    return { status: "unavailable", reason: outcome.reason };
  }
  return outcome;
}

function interpret(body: InfosimplesResponse, requestedBirthDate: string): Interpreted {
  const code = body.code ?? 0;
  const message = body.code_message ?? "";

  if (code !== CODE.singleResult && code !== CODE.multipleResults) {
    return errorOutcome(code, message);
  }

  const record = body.data?.[0];
  if (!record) {
    // A success code with no payload is a contract violation, not a rejection —
    // failing closed here avoids admitting a citizen we never actually checked.
    return { status: "unavailable", reason: "provider returned no record" };
  }

  // The portal exposes a death year separately from the status line; treat it
  // as authoritative even when the status still reads regular.
  if ((record.ano_obito ?? "").trim().length > 0) {
    return { status: "irregular", situation: "DECEASED", description: "Titular falecido" };
  }

  const situation = situationFromDescription(record.situacao_cadastral);
  if (situation !== "REGULAR") {
    return {
      status: "irregular",
      situation,
      description: record.situacao_cadastral ?? "",
    };
  }

  const name = (record.nome ?? "").trim();
  if (name.length === 0) {
    return { status: "unavailable", reason: "provider returned no name" };
  }

  return {
    status: "ok",
    name,
    birthDate: new Date(`${requestedBirthDate}T00:00:00Z`),
    // This provider only ever runs in challenge mode, so a success here always
    // means the registry matched the date the citizen claimed.
    birthDateVerified: true,
  };
}

/** Map an error envelope to an outcome, separating the citizen's fault from ours. */
function errorOutcome(code: number, message: string): Interpreted {
  switch (code) {
    case CODE.inexistent:
    case CODE.refusedParameters:
      // No record matches this CPF + birth date pair.
      return { status: "mismatch" };

    case CODE.invalidParameters:
    case CODE.emptyParameters:
    case CODE.invalidRequest:
      // Input already passed our own checks, so reaching here means the vendor
      // disagrees about the format — our bug, not the citizen's.
      return { status: "unavailable", reason: `rejected input (code ${code})` };

    case CODE.unauthorized:
      return { status: "unavailable", reason: "invalid or exhausted API token" };

    case CODE.incompleteData:
      return { status: "unavailable", reason: "portal returned incomplete data" };

    default:
      // 613–621 are portal-side: blocked, unavailable, overloaded, rate-limited.
      // All transient by nature, so let the caller retry.
      return {
        status: "unavailable",
        reason: message || `provider error ${code}`,
        retryable: true,
      };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
