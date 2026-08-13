import { NextResponse } from "next/server";
import { runDaily } from "@/lib/cron";
import { getMarket, type MarketCode } from "@/config/markets";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby function time limit

// Vercel cron triggers via GET with an Authorization: Bearer <CRON_SECRET> header.
// The dashboard "Run analysis now" button POSTs from the same origin.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  // Manual trigger from the same origin (dashboard button) — works even without CRON_SECRET.
  const isSameOrigin = req.headers.get("sec-fetch-site") === "same-origin";
  return isSameOrigin;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
