/**
 * Begins the gov.br login flow.
 *
 * Generates a random `state`, stores it in an httpOnly cookie (CSRF protection),
 * and either redirects to the mock dev IdP (when GOVBR_MODE=mock) or returns a
 * 501 explaining that real gov.br OIDC is not configured.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GOVBR_STATE_COOKIE = "votto_govbr_state";

/** GET /api/auth/govbr/start — start the (mock or real) gov.br authorization. */
export async function GET(): Promise<NextResponse> {
  const state = randomBytes(16).toString("hex");

  const store = await cookies();
  store.set(GOVBR_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min
  });

  if (env.govbr.mode === "mock") {
    const url = new URL("/dev-idp", env.appUrl);
    url.searchParams.set("state", state);
    return NextResponse.redirect(url);
  }

  // Real gov.br OIDC is not configured in this environment.
  // TODO: build the real authorization redirect, e.g.:
  //   const authUrl = new URL(`${env.govbr.issuer}/authorize`);
  //   authUrl.searchParams.set("response_type", "code");
  //   authUrl.searchParams.set("client_id", env.govbr.clientId);
  //   authUrl.searchParams.set("redirect_uri", env.govbr.redirectUri);
  //   authUrl.searchParams.set("scope", "openid email profile govbr_confiabilidades");
  //   authUrl.searchParams.set("state", state);
  //   return NextResponse.redirect(authUrl);
  return NextResponse.json(
    {
      error: "not_configured",
      message:
        "Login real via gov.br (OIDC) não está configurado neste ambiente. Defina GOVBR_MODE=mock para usar o IdP de simulação.",
    },
    { status: 501 },
  );
}
