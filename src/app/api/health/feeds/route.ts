import { NextResponse } from "next/server";
import { MARKETS } from "@/config/markets";
import { fetchMarketNews } from "@/lib/rss";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tests the health of all feeds. Useful for setup verification.
export async function GET() {
  const results = [];
  for (const m of MARKETS) {
    const news = await fetchMarketNews(m.code);
    results.push(...news.health);
  }
  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    total: results.length,
    ok: okCount,
    failed: results.length - okCount,
    results,
  });
}
