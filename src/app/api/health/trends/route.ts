import { NextResponse } from "next/server";
import { getMarket } from "@/config/markets";
import { CORE_COINS } from "@/config/coins";
import { collectMarketTrends } from "@/lib/gtrends";

export const runtime = "nodejs";
export const maxDuration = 60;

// Google Trends dayanıklılık testi. ?geo=NL (varsayılan NL).
// Minimal istek: ilk 5 coin + Bitcoin için rising. 429 durumunda temiz ok:false döner.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("geo") ?? "NL";
  const market = getMarket(code);
  if (!market) return NextResponse.json({ error: "geçersiz pazar" }, { status: 400 });

  const coins = CORE_COINS.slice(0, 5);
  const risingFor = CORE_COINS.slice(0, 1); // sadece Bitcoin

  const t0 = Date.now();
  const trends = await collectMarketTrends(market, coins, risingFor);
  const ms = Date.now() - t0;

  const anyOk = trends.health.some((h) => h.ok);
  return NextResponse.json({
    market: market.code,
    tookMs: ms,
    trendsAvailable: anyOk,
    interest: trends.interest,
    risingSample: trends.rising,
    dailyCrypto: trends.dailyCrypto,
    health: trends.health,
  });
}
