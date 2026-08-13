import { NextResponse } from "next/server";
import { runDaily } from "@/lib/cron";
import { getMarket, type MarketCode } from "@/config/markets";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby fonksiyon süre limiti

// Vercel cron GET ile Authorization: Bearer <CRON_SECRET> göndererek tetikler.
// Dashboard "Analizi şimdi çalıştır" butonu ise aynı origin'den POST atar.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  // Aynı origin'den gelen manuel tetik (dashboard butonu) — CRON_SECRET yoksa da çalışsın.
  const isSameOrigin = req.headers.get("sec-fetch-site") === "same-origin";
  return isSameOrigin;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Opsiyonel: ?market=NL tek pazar yenile · ?trends=0 Trends'i atla (hız)
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
