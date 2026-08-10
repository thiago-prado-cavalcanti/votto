/**
 * Completes the gov.br login flow.
 *
 * Two entry points, one per mode:
 *   * **GET** — the real OIDC redirect from gov.br. Validates `state` against the
 *     cookie, exchanges the code using the PKCE verifier, verifies the id_token's
 *     signature/issuer/audience/nonce, enforces the configured minimum account
 *     reliability, then opens the session.
 *   * **POST** — the development mock IdP's form submission. Validates `state`
 *     and takes the submitted identity at face value; it is only reachable while
 *     `GOVBR_MODE=mock`.
 *
 * Identity always comes from a verified source — never from the query string —
 * and reaches the database through `signInCitizen`, which applies the CPF
 * privacy rules (CLAUDE.md §5).
 */
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isValidCpf } from "@/lib/crypto/cpf";
import { signInCitizen } from "@/lib/auth/citizen-login";
import { CITIZEN_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import {
  GOVBR_FLOW_COOKIES,
  GOVBR_NONCE_COOKIE,
  GOVBR_STATE_COOKIE,
  GOVBR_VERIFIER_COOKIE,
  exchangeCode,
  meetsTrustRequirement,
  resolveIdentity,
  verifyIdToken,
} from "@/lib/auth/govbr";

export const dynamic = "force-dynamic";

/** Redirect back to the login page with an error code the UI can explain. */
function loginError(reason: string): NextResponse {
  const url = new URL("/login", env.appUrl);
  url.searchParams.set("error", reason);
  const res = NextResponse.redirect(url, { status: 303 });
  clearFlowCookies(res);
  return res;
}

/** Drop every transient cookie the authorization flow left behind. */
function clearFlowCookies(res: NextResponse): void {
  for (const name of GOVBR_FLOW_COOKIES) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
}

/** Open the citizen session and land on the home page. */
function completeLogin(token: string): NextResponse {
  const res = NextResponse.redirect(new URL("/", env.appUrl), { status: 303 });
  res.cookies.set(CITIZEN_COOKIE, token, sessionCookieOptions());
  clearFlowCookies(res);
  return res;
}

/** GET /api/auth/govbr/callback — the real gov.br OIDC redirect. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;

  // The user declined consent, or gov.br rejected the request.
  if (params.get("error")) {
    return loginError("denied");
  }

  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  const expectedState = req.cookies.get(GOVBR_STATE_COOKIE)?.value ?? "";
  const nonce = req.cookies.get(GOVBR_NONCE_COOKIE)?.value ?? "";
  const codeVerifier = req.cookies.get(GOVBR_VERIFIER_COOKIE)?.value ?? "";

  if (!code || !state || !expectedState || state !== expectedState) {
    return loginError("state");
  }
  // The verifier is only expected when the authorization request carried a
  // challenge (see `env.govbr.pkce`).
  if (!nonce || (env.govbr.pkce && !codeVerifier)) {
    // The flow cookies expired (10 min) or the browser dropped them.
    return loginError("expired");
  }

  try {
    const tokens = await exchangeCode(code, codeVerifier);
    const payload = await verifyIdToken(tokens.id_token, nonce);
    const identity = await resolveIdentity(payload, tokens.access_token);

    if (!meetsTrustRequirement(identity.trustLevels)) {
      return loginError("trust");
    }

    const token = await signInCitizen(identity);
    return completeLogin(token);
  } catch (err) {
    // Keep provider details in the server log; the user gets a generic failure.
    console.error("gov.br: falha no callback:", err);
    return loginError("provider");
  }
}

/** POST /api/auth/govbr/callback — the development mock IdP's submission. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // The mock identity is unverified by construction; refuse it outside mock mode
  // so a misconfigured production deploy can never mint a session from a form.
  if (env.govbr.mode !== "mock") {
    return loginError("state");
  }

  const form = await req.formData();
  const submittedState = String(form.get("state") ?? "");
  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const cpf = String(form.get("cpf") ?? "").trim();

  const expectedState = req.cookies.get(GOVBR_STATE_COOKIE)?.value;
  if (!expectedState || !submittedState || expectedState !== submittedState) {
    return loginError("state");
  }

  if (!firstName || !lastName || !isValidCpf(cpf)) {
    const url = new URL("/dev-idp", env.appUrl);
    url.searchParams.set("state", submittedState);
    url.searchParams.set("error", "cpf");
    return NextResponse.redirect(url, { status: 303 });
  }

  const token = await signInCitizen({ cpf, firstName, lastName });
  return completeLogin(token);
}
