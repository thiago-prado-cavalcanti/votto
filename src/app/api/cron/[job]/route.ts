/**
 * Authenticated HTTP trigger for a synchronization job.
 *
 * The bundled worker container is the primary scheduler; this endpoint exists so
 * an external scheduler (a platform cron, an uptime pinger, a manual curl during
 * an incident) can drive the same jobs without shell access to the box.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        https://votto.online/api/cron/camara:votes?days=7
 *
 * Auth is a shared secret in the `Authorization: Bearer` header, compared in
 * constant time. When `CRON_SECRET` is unset the endpoint refuses every request
 * rather than defaulting open.
 *
 * Concurrency is safe by construction: `runJob` takes the SyncJob lock, so a
 * request that lands while the worker is running the same job returns 409
 * instead of importing the window twice.
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { findJob, jobNames } from "@/lib/integration/jobs";
import { runJob } from "@/lib/integration/runner";
import type { SyncOptions } from "@/lib/integration/importer";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
/** The heavier jobs run for tens of minutes; keep the route alive for them. */
export const maxDuration = 3600;

/** Constant-time comparison that tolerates differing lengths. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Read a positive integer query param, ignoring anything malformed. */
function positiveInt(value: string | null): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** POST /api/cron/{job} — run one registered sync job. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job: string }> },
): Promise<NextResponse> {
  if (!env.cronSecret) {
    return NextResponse.json(
      { error: "not_configured", message: "CRON_SECRET não configurado." },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretMatches(token, env.cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { job: name } = await params;
  const job = findJob(decodeURIComponent(name));
  if (!job) {
    return NextResponse.json(
      { error: "unknown_job", available: jobNames() },
      { status: 404 },
    );
  }

  const opts: SyncOptions = {};
  const days = positiveInt(req.nextUrl.searchParams.get("days"));
  const limit = positiveInt(req.nextUrl.searchParams.get("limit"));
  if (days) opts.days = days;
  if (limit) opts.limit = limit;
  const force = req.nextUrl.searchParams.get("force") === "true";

  const outcome = await runJob(job, opts, { force });

  if (outcome.status === "ok") {
    return NextResponse.json({
      job: job.name,
      status: "ok",
      itemsSeen: outcome.result.itemsSeen,
      itemsUpserted: outcome.result.itemsUpserted,
      durationMs: outcome.durationMs,
    });
  }
  if (outcome.status === "skipped") {
    return NextResponse.json(
      { job: job.name, status: "skipped", reason: outcome.reason },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { job: job.name, status: "failed", error: outcome.error },
    { status: 500 },
  );
}
