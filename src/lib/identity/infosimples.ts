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
 * Contract confirmed against the vendor's official reference, API v2.2.38
 * (2026-07-10). It was first written from their open-source SDKs
 * (`infosimples/infosimples-data`, `alanmatiasdev/infosimples-sdk`) because the
 * docs sit behind a customer login, and the SDKs got the body encoding wrong:
 * the API takes `application/x-www-form-urlencoded`, never JSON.
 */
import { env } from "@/lib/env";
import { situationFromDescription } from "@/lib/identity/situation";
import type { CpfProvider, CpfValidation } from "@/lib/identity/validation";

const ENDPOINT = "https://api.infosimples.com/api/v2/consultas/receita-federal/cpf";

/**
 * Seconds the vendor may spend driving the portal before giving up. The API
 * accepts 15–600; 60 leaves the portal room on a slow day without making a
 * citizen watch a spinner for minutes.
 */
const REMOTE_TIMEOUT_SECONDS = 60;

/** Local ceiling, kept above the remote one so we never abort a paid request. */
const TIMEOUT_MS = (REMOTE_TIMEOUT_SECONDS + 15) * 1000;

const RETRIES = 2;
const BACKOFF_MS = 800;

/**
 * Envelope codes, from the official table (API v2.2.38). `200` is the only
 * success; everything else is an error, and the split below decides whether it
 * is the citizen's, ours, or the portal's.
 */
const CODE = {
  success: 200,
  unexpected: 600,
  unauthorized: 601,
  invalidService: 602,
  serviceNotAllowed: 603,
  invalidRequest: 604,
  emptyParameters: 606,
  invalidParameters: 607,
  refusedParameters: 608,
  incompleteData: 611,
  inexistent: 612,
  paramChangedAtSource: 619,
  persistentSourceError: 620,
  receiptRenderFailed: 621,
  repeatedQuery: 622,
} as const;

/**
 * Codes that must NOT be retried, beyond the ones handled explicitly below.
 *
 * The vendor's own guidance is the reason this list exists: 620 is *billed* and
 * "will probably not change soon", so retrying it spends money three times for
 * one answer; 622 fires precisely when the same query repeats, so a retry loop
 * is what causes it; 602/603 are configuration errors that no amount of waiting
 * fixes. Everything left over (605, 609, 610, 613–618) really is transient.
 */
const TERMINAL_CODES: ReadonlySet<number> = new Set([
  CODE.invalidService,
  CODE.serviceNotAllowed,
  CODE.paramChangedAtSource,
  CODE.persistentSourceError,
  CODE.repeatedQuery,
]);

type InfosimplesResponse = {
  code?: number;
  code_message?: string;
  /**
   * Vendor diagnostics. The reference is explicit that this must never be
   * relayed to end users — it can name Infosimples or carry integrator-only
   * detail — so it only ever reaches a server log.
   */
  errors?: string[];
  data?: Array<{
    /** Preferred display name; equals `nome_civil` unless a social name exists. */
    nome?: string;
    nome_civil?: string;
    nome_social?: string;
    /** `DD/MM/YYYY`. Unused: we echo the date the citizen was challenged on. */
    data_nascimento?: string;
    /** Documented value is `ATIVA`; the portal itself says `REGULAR`. */
    situacao_cadastral?: string;
    /** Year of death as text; `0`/empty when alive. */
    ano_obito?: string;
    /** Same, already coerced to a number by the vendor. `0` when alive. */
    normalizado_ano_obito?: number;
  }>;
};

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
              // Mandated by the API reference. A JSON body is not parsed at
              // all, and the request then fails as an auth error (601) because
              // the token was never read — which reads exactly like a bad
              // token and is why this went unnoticed.
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              token,
              cpf,
              // ISO 8601 with padded zeros, per the service reference —
              // which is already the shape `validateCpf` normalizes to. It
              // previously sent DD/MM/YYYY, the exact inversion, which the API
              // answers with a *billed* invalid-parameter error.
              birthdate: birthDate,
              timeout: String(REMOTE_TIMEOUT_SECONDS),
              // Suppress the HTML/PDF receipt the vendor would otherwise render
              // and host for 7 days. It carries the citizen's registry data, we
              // never read it, and not creating it is one less copy in one less
              // place (CLAUDE.md §5).
              ignore_site_receipt: "1",
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

  if (code !== CODE.success) {
    return errorOutcome(code, message, body.errors);
  }

  const record = body.data?.[0];
  if (!record) {
    // A success code with no payload is a contract violation, not a rejection —
    // failing closed here avoids admitting a citizen we never actually checked.
    return { status: "unavailable", reason: "provider returned no record" };
  }

  // The portal exposes a death year separately from the status line; treat it
  // as authoritative even when the status still reads regular. Prefer the
  // vendor's normalized number, which is `0` for a living holder — the raw
  // string is `"0"` in that case, and a length check would read it as a death.
  const deathYear = record.normalizado_ano_obito ?? Number(record.ano_obito ?? 0);
  if (Number.isFinite(deathYear) && deathYear > 0) {
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

  // A citizen with a registered `nome_social` is addressed by it — that is the
  // name they are known by, and the platform greets people by name.
  const name = (record.nome_social || record.nome || record.nome_civil || "").trim();
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
function errorOutcome(code: number, message: string, errors?: string[]): Interpreted {
  // Vendor diagnostics are for our logs only, never for the citizen.
  const detail = [message, ...(errors ?? [])].filter(Boolean).join("; ");

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
      return { status: "unavailable", reason: `portal returned incomplete data: ${detail}` };

    default:
      // Everything else is the portal or the vendor. Retry only what can
      // actually change on a second attempt — see TERMINAL_CODES.
      return {
        status: "unavailable",
        reason: detail || `provider error ${code}`,
        retryable: !TERMINAL_CODES.has(code),
      };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
