import { NextResponse } from "next/server";
import { getMarket } from "@/config/markets";
import { CORE_COINS } from "@/config/coins";
import { collectMarketTrends } from "@/lib/gtrends";
import { fetchMarketNews, countMentions, extractNewsKeywords } from "@/lib/rss";
import { getGlobalSignals } from "@/lib/coingecko";
import { COMPETITORS } from "@/config/themes";
import { getRedditSignal } from "@/lib/reddit";
import { assembleMarketPackage } from "@/lib/assemble";
import { analyzeMarket, isClaudeConfigured } from "@/lib/claude";
import { allowByInterval } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;

// This endpoint spends Claude tokens + hits third-party APIs, so it must not be open to the
// public. Allow only the secret-authenticated caller or a same-origin request, then throttle.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  return req.headers.get("sec-fetch-site") === "same-origin";
}

// End-to-end single-market test: collect sources → assemble → Claude analysis.
// ?geo=NL (default). ?trends=0 skips Trends (speed/degrade test).
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!allowByInterval("analyze:test", 15_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(req.url);
  const market = getMarket(url.searchParams.get("geo") ?? "NL");
  if (!market) return NextResponse.json({ error: "invalid market" }, { status: 400 });

  const useTrends = url.searchParams.get("trends") !== "0";
  const date = new Date().toISOString().slice(0, 10);
  const failedSources: string[] = [];

  // Global signals (CoinGecko + Reddit)
  const global = await getGlobalSignals();
  if (!global.ok) failedSources.push("coingecko");
  const reddit = await getRedditSignal();
  if (!reddit.ok) failedSources.push("reddit");

  // Local news
  const news = await fetchMarketNews(market.code);
  failedSources.push(...news.health.filter((h) => !h.ok).map((h) => h.source));
  const mentions = countMentions(news.items).map((m) => ({ topic: m.topic, count: m.count }));
  const newsKeywords = extractNewsKeywords(news.items);

  // Google Trends (optional; minimal request)
  let trends = { available: false, interest: [] as never[], rising: {}, dailyCrypto: [] as string[] };
  let genericSignals: Array<{ term: string; score: number | null; changePct: number | null; rising: string[] }> = [];
  if (useTrends) {
    const genericTerms = [...COMPETITORS.slice(0, 3), ...market.genericSeeds];
    const t = await collectMarketTrends(market, CORE_COINS.slice(0, 10), CORE_COINS.slice(0, 3), genericTerms);
    failedSources.push(...t.health.filter((h) => !h.ok).map((h) => h.source));
    trends = {
      available: t.health.some((h) => h.ok && h.source.startsWith("gtrends_interest")),
      interest: t.interest as never[],
      rising: t.rising,
      dailyCrypto: t.dailyCrypto,
    };
    genericSignals = t.genericInterest.map((gi) => ({
      term: gi.coin,
      score: gi.score,
      changePct: gi.changePct,
      rising: (t.genericRising[gi.coin] ?? []).map((r) => r.query),
    }));
  }

  const pkg = assembleMarketPackage({
    date,
    market,
    trends,
    todayMentions: mentions,
    newsKeywords,
    genericSignals,
    globalTrending: global.trending.slice(0, 10).map((c) => c.name),
    redditTopics: reddit.topicMentions.slice(0, 8).map((t) => t.topic),
    failedSources,
  });

  if (!isClaudeConfigured()) {
    return NextResponse.json({
      note: "ANTHROPIC_API_KEY missing — Claude analysis skipped. Returning the collected package.",
      package: pkg,
    });
  }

  const analysis = await analyzeMarket(pkg);
  return NextResponse.json({ market: market.code, package: pkg, analysis });
}
