/**
 * Begins a social login flow.
 *
 * One route serves every provider: the slug selects a `ProviderConfig` and the
 * differences (scopes, response mode, how the client secret is produced) come
 * from there. `instagram` is a valid slug that resolves to Facebook — see
 * `resolveProvider`.
 *
 * In `mock` mode it redirects to the built-in development IdP instead, so the
 * whole sign-up can be walked locally without registering an app anywhere.
 *
 * Cookies are set on the redirect response itself — `cookies()` mutations are
 * not merged into a manually constructed NextResponse.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { resolveProvider } from "@/lib/auth/social/providers";
import {
  SOCIAL_NONCE_COOKIE,
  SOCIAL_STATE_COOKIE,
  SOCIAL_VERIFIER_COOKIE,
  buildAuthorizationUrl,
  flowCookieOptions,
} from "@/lib/auth/social/oidc";

export const dynamic = "force-dynamic";

/** GET /api/auth/social/{provider}/start — begin the (mock or real) flow. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider: slug } = await params;
  const provider = resolveProvider(slug);
  if (!provider) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }

  if (env.social.mode === "mock") {
    // The mock IdP needs only a CSRF `state`; there is no token to verify.
    const state = `${provider.key}:${randomBytes(16).toString("hex")}`;
    const url = new URL("/dev-idp", env.appUrl);
    url.searchParams.set("state", state);
    // The slug, not the resolved key, so the simulation shows the button the
    // citizen actually pressed (Instagram resolves to Facebook underneath).
    url.searchParams.set("provider", slug);

    const res = NextResponse.redirect(url);
    res.cookies.set(SOCIAL_STATE_COOKIE, state, flowCookieOptions(provider));
    return res;
  }

  if (!provider.configured()) {
    // Missing credentials are an operator error, not a citizen error: say so on
    // the login page rather than dropping a raw JSON body on a visitor.
    console.error(`social: ${provider.key} sem credenciais completas.`);
    const url = new URL("/login", env.appUrl);
    url.searchParams.set("error", "not_configured");
    return NextResponse.redirect(url);
  }

  const authorization = buildAuthorizationUrl(provider);
  const res = NextResponse.redirect(authorization.url);
  const options = flowCookieOptions(provider);
  res.cookies.set(SOCIAL_STATE_COOKIE, authorization.state, options);
  res.cookies.set(SOCIAL_NONCE_COOKIE, authorization.nonce, options);
  res.cookies.set(SOCIAL_VERIFIER_COOKIE, authorization.codeVerifier, options);
  return res;
}
