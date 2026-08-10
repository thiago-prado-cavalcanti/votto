/**
 * Begins the gov.br login flow.
 *
 * In `real` mode this builds a full OIDC authorization request (PKCE + state +
 * nonce) against the configured issuer and stores the one-time values in
 * httpOnly cookies for the callback to verify. In `mock` mode it redirects to
 * the built-in development IdP with only a `state`, which is all that flow needs.
 *
 * Cookies are set on the redirect response itself — `cookies()` mutations are
 * not merged into a manually constructed NextResponse.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env, isGovbrConfigured } from "@/lib/env";
import {
  GOVBR_NONCE_COOKIE,
  GOVBR_STATE_COOKIE,
  GOVBR_VERIFIER_COOKIE,
  buildAuthorizationUrl,
  flowCookieOptions,
} from "@/lib/auth/govbr";

export const dynamic = "force-dynamic";

export { GOVBR_STATE_COOKIE };

/** GET /api/auth/govbr/start — start the (mock or real) gov.br authorization. */
export async function GET(): Promise<NextResponse> {
  if (env.govbr.mode === "mock") {
    const state = randomBytes(16).toString("hex");
    const url = new URL("/dev-idp", env.appUrl);
    url.searchParams.set("state", state);

    const res = NextResponse.redirect(url);
    res.cookies.set(GOVBR_STATE_COOKIE, state, flowCookieOptions());
    return res;
  }

  if (!isGovbrConfigured()) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Login gov.br não configurado. Defina GOVBR_ISSUER, GOVBR_CLIENT_ID, " +
          "GOVBR_CLIENT_SECRET e GOVBR_REDIRECT_URI, ou use GOVBR_MODE=mock em desenvolvimento.",
      },
      { status: 501 },
    );
  }

  let authorization: Awaited<ReturnType<typeof buildAuthorizationUrl>>;
  try {
    authorization = await buildAuthorizationUrl();
  } catch (err) {
    // Discovery failure means gov.br is unreachable or misconfigured — surface a
    // login error rather than a stack trace.
    console.error("gov.br: falha ao montar a autorização:", err);
    const url = new URL("/login", env.appUrl);
    url.searchParams.set("error", "provider");
    return NextResponse.redirect(url);
  }

  const res = NextResponse.redirect(authorization.url);
  const options = flowCookieOptions();
  res.cookies.set(GOVBR_STATE_COOKIE, authorization.state, options);
  res.cookies.set(GOVBR_NONCE_COOKIE, authorization.nonce, options);
  if (authorization.codeVerifier) {
    res.cookies.set(GOVBR_VERIFIER_COOKIE, authorization.codeVerifier, options);
  }
  return res;
}
