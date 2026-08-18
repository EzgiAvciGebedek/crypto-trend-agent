import { NextResponse } from "next/server";
import { runDaily } from "@/lib/cron";
import { getMarket, type MarketCode } from "@/config/markets";
import { allowByInterval } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby function time limit

const MANUAL_MIN_INTERVAL_MS = 15_000; // throttle same-origin (button) triggers

// Vercel cron triggers via GET with an Authorization: Bearer <CRON_SECRET> header.
// The dashboard "Run analysis now" button POSTs from the same origin.
type Auth = "secret" | "same-origin" | null;
function authorize(req: Request): Auth {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return "secret"; // trusted scheduler
  if (req.headers.get("sec-fetch-site") === "same-origin") return "same-origin";
  return null;
}

async function handle(req: Request) {
  const auth = authorize(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Rate-limit manual/button triggers so the expensive pipeline can't be spammed.
  // The secret-authenticated scheduler path is exempt (it self-schedules).
  if (auth === "same-origin" && !allowByInterval("cron:daily", MANUAL_MIN_INTERVAL_MS)) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: MANUAL_MIN_INTERVAL_MS }, { status: 429 });
  }
  // Optional: ?market=NL refresh a single market · ?trends=0 skip Trends (speed)
  const url = new URL(req.url);
  const marketParam = url.searchParams.get("market");
  const onlyMarket = marketParam && getMarket(marketParam) ? (marketParam as MarketCode) : undefined;
  const skipTrends = url.searchParams.get("trends") === "0";
  try {
    const result = await runDaily({ onlyMarket, skipTrends });
    return NextResponse.json({ ok: true, ...result });
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
