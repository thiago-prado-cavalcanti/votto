/**
 * Serpro "Consulta CPF" adapter — the official channel to the Receita Federal
 * registry, and the only one licensed to serve it.
 *
 * Two properties of this API shape the whole identity design:
 *
 *  1. **It is a challenge, not a lookup.** The v3 path is `/cpf/{ni}/{nascimento}`,
 *     so the caller must already know the birth date; the API will not hand out
 *     a name from a CPF alone. That is deliberate on Receita's part — it is what
 *     stops the endpoint from becoming a bulk personal-data disclosure interface.
 *  2. **It refuses minors.** HTTP 451 for under-16 and 422 for under-18, which
 *     gives Votto an age gate for free (voting is optional at 16–17 in Brazil).
 *
 * Auth is OAuth2 client credentials: the consumer key/secret are exchanged for a
 * bearer token valid ~1h, cached in-process and refreshed on expiry or on a 401.
 *
 * @see https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cpf/
 */
import { env } from "@/lib/env";
import { situationFromDescription } from "@/lib/identity/situation";
import type { CpfProvider, CpfSituation, CpfValidation } from "@/lib/identity/validation";

const GATEWAY = "https://gateway.apiserpro.serpro.gov.br";

/** Seconds shaved off the token lifetime so it is never used at the edge of expiry. */
const TOKEN_SKEW_SECONDS = 60;

const TIMEOUT_MS = 15000;
const RETRIES = 2;
const BACKOFF_MS = 500;

type TokenResponse = { access_token: string; expires_in: number };

type CpfResponse = {
  ni?: string;
  nome?: string;
  /** `codigo` is the registry status; `0` is the only one that may vote. */
  situacao?: { codigo?: string; descricao?: string };
  /** `DDMMYYYY`, echoed back from the request. */
  nascimento?: string;
};

/**
 * Map Receita's status code to our normalized vocabulary.
 *
 * Only `0` (Regular) is accepted downstream; every other code is a real record
 * that must not vote — most importantly `Titular Falecido`, since accounts of
 * deceased holders are a classic fraud vector.
 */
function toSituation(code: string | undefined, description: string | undefined): CpfSituation {
  switch ((code ?? "").trim()) {
    case "0":
      return "REGULAR";
    case "2":
      return "SUSPENDED";
    case "3":
    case "5":
      return "CANCELLED";
    case "4":
      return "NULL";
    case "8":
      return "DECEASED";
    default:
      // Codes are documented by description more reliably than by number, so
      // fall back to matching the label before giving up.
      return situationFromDescription(description);
  }
}

/** `YYYY-MM-DD` → `DDMMYYYY`, the format the v3 path expects. */
function toSerproDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}${month}${year}`;
}

/** `DDMMYYYY` → Date, or null when the API echoes something unparseable. */
function fromSerproDate(value: string | undefined): Date | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const day = value.slice(0, 2);
  const month = value.slice(2, 4);
  const year = value.slice(4, 8);
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createSerproProvider(): CpfProvider {
  const { consumerKey, consumerSecret, useTrial } = env.cpfValidation.serpro;

  // The trial dataset answers only for a fixed set of fictitious CPFs; it exists
  // so the integration can be exercised before the contract is signed.
  const basePath = useTrial ? "/consulta-cpf-df-trial/v3" : "/consulta-cpf-df-v3";
  const lookupPath = useTrial ? "/consulta-cpf-df-trial/v1" : "/consulta-cpf-df/v1";

  let token: { value: string; expiresAt: number } | null = null;

  async function fetchToken(): Promise<string> {
    const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const res = await fetch(`${GATEWAY}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`token request failed (HTTP ${res.status})`);
    }
    const body = (await res.json()) as TokenResponse;
    if (!body.access_token) {
      throw new Error("token response carried no access_token");
    }
    token = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(0, body.expires_in - TOKEN_SKEW_SECONDS) * 1000,
    };
    return token.value;
  }

  async function accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && token && token.expiresAt > Date.now()) return token.value;
    return fetchToken();
  }

  return {
    name: useTrial ? "serpro-trial" : "serpro",

    async validate(cpf, birthDate): Promise<CpfValidation> {
      // Challenge mode (v3) appends the birth date to the path; lookup mode
      // sends the CPF alone. Only the v3 shape is confirmed against Serpro's
      // published examples — the CPF-only path comes from secondary sources and
      // must be checked against the contracted account before production use.
      // `isGatewayFault` below keeps a wrong path from masquerading as a
      // mismatch, so the failure is loud rather than misleading.
      const url =
        birthDate === null
          ? `${GATEWAY}${lookupPath}/cpf/${cpf}`
          : `${GATEWAY}${basePath}/cpf/${cpf}/${toSerproDate(birthDate)}`;

      let lastError = "";
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        try {
          // A 401 means the cached token died early; retry once with a fresh one.
          const bearer = await accessToken(attempt > 0 && lastError.includes("401"));
          const res = await fetch(url, {
            headers: { Accept: "application/json", Authorization: `Bearer ${bearer}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });

          // A 404 from the gateway itself (unknown path) must not be read as
          // "this CPF does not exist" — that would turn a deploy mistake into a
          // silent rejection of real citizens.
          if (res.status === 404 && (await isGatewayFault(res.clone()))) {
            return { status: "unavailable", reason: "registry path not found" };
          }

          const terminal = terminalOutcome(res.status);
          if (terminal) return terminal;

          if (res.status === 401) {
            lastError = "HTTP 401";
            token = null;
            continue;
          }

          // 429 and 5xx are transient; everything else non-2xx is unexpected.
          if (res.status === 429 || res.status >= 500) {
            lastError = `HTTP ${res.status}`;
            await sleep(BACKOFF_MS * Math.pow(2, attempt));
            continue;
          }
          if (!res.ok) {
            return { status: "unavailable", reason: `unexpected HTTP ${res.status}` };
          }

          return interpret((await res.json()) as CpfResponse, birthDate);
        } catch (err) {
          // Never let the CPF reach a log line via an error message.
          lastError = err instanceof Error ? err.message : "request failed";
          if (attempt === RETRIES) break;
          await sleep(BACKOFF_MS * Math.pow(2, attempt));
        }
      }

      return { status: "unavailable", reason: lastError || "registry unreachable" };
    },
  };
}

/**
 * Statuses that are a definitive answer about the citizen rather than a
 * transport problem, so they must not be retried.
 *
 * The documented set is 206/401/415/422/451; `404` is mapped defensively
 * because the docs do not state what a CPF + birth-date mismatch returns, and
 * that mapping is worth confirming against the live API once credentials exist.
 */
function terminalOutcome(status: number): CpfValidation | null {
  switch (status) {
    case 404:
    case 400:
      return { status: "mismatch" };
    case 422:
      return { status: "underage", minimumAge: 18 };
    case 451:
      return { status: "underage", minimumAge: 16 };
    default:
      return null;
  }
}

/**
 * Whether a 404 came from the API gateway (unknown route) rather than from the
 * registry. The WSO2 gateway answers with a `fault` envelope; the registry does
 * not, so the two are distinguishable despite sharing a status code.
 */
async function isGatewayFault(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    return "fault" in body;
  } catch {
    // A non-JSON 404 is not the registry answering either.
    return true;
  }
}

/** Turn a 200 response body into the caller-facing outcome. */
function interpret(body: CpfResponse, requestedBirthDate: string | null): CpfValidation {
  const situation = toSituation(body.situacao?.codigo, body.situacao?.descricao);
  const description = body.situacao?.descricao ?? "";

  if (situation !== "REGULAR") {
    return { status: "irregular", situation, description };
  }

  const name = (body.nome ?? "").trim();
  if (name.length === 0) {
    return { status: "unavailable", reason: "registry returned no name" };
  }

  const birthDate =
    fromSerproDate(body.nascimento) ??
    (requestedBirthDate ? new Date(`${requestedBirthDate}T00:00:00Z`) : null);

  if (!birthDate) {
    return { status: "unavailable", reason: "registry returned no birth date" };
  }

  return {
    status: "ok",
    name,
    birthDate,
    // Only the challenge path proves the citizen knew the date; in lookup mode
    // the registry simply handed it over.
    birthDateVerified: requestedBirthDate !== null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
