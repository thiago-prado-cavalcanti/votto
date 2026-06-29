/**
 * Completes the (mock) gov.br login flow.
 *
 * Validates the `state` cookie against the submitted state (CSRF), reads the
 * verified identity (firstName / lastName / cpf), validates and derives the CPF
 * fields, upserts the citizen User by `cpfHash`, opens a citizen session and
 * redirects home. On an invalid CPF it redirects back to the dev IdP with an error.
 */
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { kid } from "@/lib/ids";
import { isValidCpf, deriveCpfFields } from "@/lib/crypto/cpf";
import {
  CITIZEN_COOKIE,
  createCitizenSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { GOVBR_STATE_COOKIE } from "@/app/api/auth/govbr/start/route";

export const dynamic = "force-dynamic";

/** POST /api/auth/govbr/callback — handle the IdP consent submission. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData();
  const submittedState = String(form.get("state") ?? "");
  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const cpf = String(form.get("cpf") ?? "").trim();

  const expectedState = req.cookies.get(GOVBR_STATE_COOKIE)?.value;

  // Validate CSRF state.
  if (!expectedState || !submittedState || expectedState !== submittedState) {
    const url = new URL("/login", env.appUrl);
    url.searchParams.set("error", "state");
    return NextResponse.redirect(url, { status: 303 });
  }

  // Validate identity payload.
  if (!firstName || !lastName || !isValidCpf(cpf)) {
    const url = new URL("/dev-idp", env.appUrl);
    url.searchParams.set("state", submittedState);
    url.searchParams.set("error", "cpf");
    return NextResponse.redirect(url, { status: 303 });
  }

  const { cpfEncrypted, cpfHash, cpfPrefix } = deriveCpfFields(cpf);

  // Upsert the citizen by deterministic CPF hash. Reuse the existing kid; create a
  // new one only on first login.
  const user = await db.user.upsert({
    where: { cpfHash },
    create: { kid: kid("usr"), firstName, lastName, cpfEncrypted, cpfHash, cpfPrefix },
    update: { firstName, lastName },
    select: { kid: true, cpfHash: true, firstName: true, lastName: true },
  });

  const token = await createCitizenSessionToken({
    kind: "citizen",
    userKid: user.kid,
    cpfHash: user.cpfHash,
    name: `${user.firstName} ${user.lastName}`.trim(),
  });

  // Set the session cookie ON the redirect response (cookies() isn't merged into
  // a manually-returned NextResponse), and consume the state cookie.
  const res = NextResponse.redirect(new URL("/", env.appUrl), { status: 303 });
  res.cookies.set(CITIZEN_COOKIE, token, sessionCookieOptions());
  res.cookies.set(GOVBR_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
