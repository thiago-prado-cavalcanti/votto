/**
 * Completes a social login flow.
 *
 * Three entry points share one resolution path:
 *   * **GET** — Google and Facebook redirect back as a top-level GET carrying
 *     `code` and `state` in the query.
 *   * **POST** — Apple answers with `response_mode=form_post`, a cross-site
 *     top-level POST carrying the same fields plus, on the *first*
 *     authorization only, a `user` blob with the person's name.
 *   * **POST (mock)** — the development IdP's form, accepted only while
 *     `SOCIAL_MODE=mock` so a misconfigured production deploy can never mint an
 *     identity from a form.
 *
 * Where it lands depends on whether the social account is already bound to a
 * citizen:
 *   * **Known account** → straight to a citizen session. The CPF behind it was
 *     confirmed when it was linked.
 *   * **New account** → the CPF step (`/entrar/cpf`), carrying the identity in a
 *     signed pending cookie. No row is written for someone who stops here.
 *
 * The identity always comes from a signature-verified id_token, never from the
 * query string.
 */
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import {
  resolveProvider,
  type ProviderConfig,
} from "@/lib/auth/social/providers";
import {
  SOCIAL_FLOW_COOKIES,
  SOCIAL_NONCE_COOKIE,
  SOCIAL_STATE_COOKIE,
  SOCIAL_VERIFIER_COOKIE,
  exchangeCode,
  readIdentity,
  verifyIdToken,
  type SocialIdentity,
} from "@/lib/auth/social/oidc";
import { findCitizenBySocial, resumeCitizenSession } from "@/lib/auth/citizen-login";
import { createPendingToken, PENDING_COOKIE, pendingCookieOptions } from "@/lib/auth/pending";
import { CITIZEN_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Drop every transient cookie the authorization flow left behind. */
function clearFlowCookies(res: NextResponse): void {
  for (const name of SOCIAL_FLOW_COOKIES) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
}

/** Redirect back to the login page with an error code the UI can explain. */
function loginError(reason: string): NextResponse {
  const url = new URL("/login", env.appUrl);
  url.searchParams.set("error", reason);
  const res = NextResponse.redirect(url, { status: 303 });
  clearFlowCookies(res);
  return res;
}

/** Open the citizen session and land on the home page. */
function completeLogin(token: string): NextResponse {
  const res = NextResponse.redirect(new URL("/", env.appUrl), { status: 303 });
  res.cookies.set(CITIZEN_COOKIE, token, sessionCookieOptions());
  clearFlowCookies(res);
  // A finished login must not leave a half-finished one behind.
  res.cookies.set(PENDING_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/**
 * Route the verified social identity: resume a linked citizen, or park the
 * identity in the pending cookie and send them to the CPF step.
 */
async function land(provider: ProviderConfig, identity: SocialIdentity): Promise<NextResponse> {
  const linked = await findCitizenBySocial({
    provider: provider.stored,
    subject: identity.subject,
  });

  if (linked) {
    return completeLogin(await resumeCitizenSession(linked));
  }

  const token = await createPendingToken({
    provider: provider.key,
    subject: identity.subject,
    firstName: identity.firstName,
    lastName: identity.lastName,
    attempts: 0,
  });

  const res = NextResponse.redirect(new URL("/entrar/cpf", env.appUrl), { status: 303 });
  res.cookies.set(PENDING_COOKIE, token, pendingCookieOptions());
  clearFlowCookies(res);
  return res;
}

/**
 * Shared verification for both real response modes: check `state` against the
 * cookie, exchange the code, verify the id_token, read the identity.
 */
async function verifyAndLand(
  req: NextRequest,
  provider: ProviderConfig,
  fields: { code: string; state: string; appleUser?: string | null; error?: string | null },
): Promise<NextResponse> {
  if (fields.error) {
    // The citizen declined consent, or the provider rejected the request.
    return loginError("denied");
  }

  const expectedState = req.cookies.get(SOCIAL_STATE_COOKIE)?.value ?? "";
  const nonce = req.cookies.get(SOCIAL_NONCE_COOKIE)?.value ?? "";
  const codeVerifier = req.cookies.get(SOCIAL_VERIFIER_COOKIE)?.value ?? "";

  // The state carries the provider key, so a callback cannot be replayed onto
  // another provider's route with a state minted for this one.
  if (
    !fields.code ||
    !fields.state ||
    !expectedState ||
    fields.state !== expectedState ||
    !expectedState.startsWith(`${provider.key}:`)
  ) {
    return loginError("state");
  }
  if (!nonce || !codeVerifier) {
    // The flow cookies expired (10 min) or the browser dropped them.
    return loginError("expired");
  }

  try {
    const tokens = await exchangeCode(provider, fields.code, codeVerifier);
    const payload = await verifyIdToken(provider, tokens.id_token, nonce);
    return await land(provider, readIdentity(payload, fields.appleUser));
  } catch (err) {
    // Keep provider details in the server log; the citizen gets a generic failure.
    console.error(`social: falha no callback de ${provider.key}:`, err);
    return loginError("provider");
  }
}

/** GET — Google and Facebook redirect back with the code in the query. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider: slug } = await params;
  const provider = resolveProvider(slug);
  if (!provider) return loginError("state");

  const q = req.nextUrl.searchParams;
  return verifyAndLand(req, provider, {
    code: q.get("code") ?? "",
    state: q.get("state") ?? "",
    error: q.get("error"),
  });
}

/** POST — Apple's `form_post`, and the development mock IdP's form. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider: slug } = await params;
  const provider = resolveProvider(slug);
  if (!provider) return loginError("state");

  const form = await req.formData();

  // ── Development mock ───────────────────────────────────────────────────────
  // Guarded twice: the marker field AND the mode. The mode check is the one
  // that matters — this form is an unverified identity by construction.
  if (form.get("mock") !== null) {
    if (env.social.mode !== "mock") return loginError("state");

    const submittedState = String(form.get("state") ?? "");
    const expectedState = req.cookies.get(SOCIAL_STATE_COOKIE)?.value ?? "";
    if (!expectedState || !submittedState || expectedState !== submittedState) {
      return loginError("state");
    }

    return land(provider, {
      // Namespaced so a mock subject can never collide with a real one.
      subject: `mock:${provider.key}:${String(form.get("subject") ?? "").trim()}`,
      firstName: String(form.get("firstName") ?? "").trim(),
      lastName: String(form.get("lastName") ?? "").trim(),
    });
  }

  // ── Apple form_post ────────────────────────────────────────────────────────
  return verifyAndLand(req, provider, {
    code: String(form.get("code") ?? ""),
    state: String(form.get("state") ?? ""),
    // Present only on the first authorization this Apple ID ever grants.
    appleUser: form.get("user") ? String(form.get("user")) : null,
    error: form.get("error") ? String(form.get("error")) : null,
  });
}
