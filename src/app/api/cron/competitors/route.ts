import { NextResponse } from "next/server";
import { crawlAllCompetitors } from "@/lib/competitors";
import { saveCompetitorContent } from "@/lib/store";
import { allowByInterval } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby function time limit

const MANUAL_MIN_INTERVAL_MS = 15_000; // throttle same-origin (button) triggers

// Same auth pattern as /api/cron/daily: Vercel Cron sends Authorization: Bearer
// <CRON_SECRET>; a same-origin request (e.g. a future "Refresh now" button) also works.
type Auth = "secret" | "same-origin" | null;
function authorize(req: Request): Auth {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return "secret";
  if (req.headers.get("sec-fetch-site") === "same-origin") return "same-origin";
  return null;
}

async function handle(req: Request) {
  const auth = authorize(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (auth === "same-origin" && !allowByInterval("cron:competitors", MANUAL_MIN_INTERVAL_MS)) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: MANUAL_MIN_INTERVAL_MS }, { status: 429 });
  }

  try {
    const date = new Date().toISOString().slice(0, 10);
    const results = await crawlAllCompetitors(/* forceFresh */ true);
    await saveCompetitorContent(date, results);
    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: true,
      date,
      competitors: results.length,
      responding: okCount,
      totalItems: results.reduce((n, r) => n + r.items.length, 0),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
