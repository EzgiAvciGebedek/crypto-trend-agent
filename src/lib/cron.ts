// Daily cron orchestration.
//
// Architecture decisions (Trends is slow and rate-limited; "market rotation" chosen):
//  - Google Trends can take ~60s+ per market and Vercel Hobby functions cut off at 60s.
//    So Trends is collected for ONLY a few markets each day; the starting index rotates
//    day to day → all markets are covered over a few days.
//  - RSS + CoinGecko + Reddit run for every market every day (fast).
//  - Time budget: once the budget is spent the remaining markets are left unprocessed; each
//    market is saved as it completes, so even a partial run produces data.

import { MARKETS, type Market, type MarketCode } from "@/config/markets";
import { CORE_COINS, type Coin } from "@/config/coins";
import { COMPETITORS } from "@/config/themes";
import { getGlobalSignals, type GlobalSignals } from "./coingecko";
import { getRedditSignal, type RedditSignal } from "./reddit";
import { fetchMarketNews, countMentions, extractNewsKeywords } from "./rss";
import { collectMarketTrends, overallCryptoInterest } from "./gtrends";
import { assembleMarketPackage } from "./assemble";
import { analyzeMarket, isClaudeConfigured } from "./claude";
import {
  saveSnapshot,
  saveMetrics,
  saveRecommendations,
  saveSummary,
  saveHealth,
  saveCryptoOverall,
  getYesterdayMentions,
} from "./store";
import type { MarketMetric, Recommendation, SourceHealth, RisingQuery } from "./types";

const TIME_BUDGET_MS = 55_000; // safe margin under the Vercel Hobby 60s limit
const TRENDS_MARKETS_PER_DAY = 2; // how many markets get Trends collected each day
const TRENDS_INTEREST_COINS = 10; // for interestOverTime (2 groups)
const TRENDS_RISING_COINS = 4; // relatedQueries for only the top few coins

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

// Rotationally selects today's Trends markets (excludes EU-EN since it has no geo).
function trendsMarketsForToday(date: Date): Set<MarketCode> {
  const geoMarkets = MARKETS.filter((m) => m.trendsGeo);
  const offset = dayOfYear(date) * TRENDS_MARKETS_PER_DAY;
  const chosen = new Set<MarketCode>();
  for (let i = 0; i < TRENDS_MARKETS_PER_DAY; i++) {
    chosen.add(geoMarkets[(offset + i) % geoMarkets.length].code);
  }
  return chosen;
}

export interface DailyResult {
  date: string;
  processedMarkets: MarketCode[];
  skippedMarkets: MarketCode[];
  trendsMarkets: MarketCode[];
  claudeUsed: boolean;
  health: SourceHealth[];
}

// Global context: adds new coins that entered CoinGecko trending to the core list.
function todaysCoinList(global: GlobalSignals): Coin[] {
  const coreIds = new Set(CORE_COINS.map((c) => c.id));
  const extra: Coin[] = global.trending
    .filter((t) => !coreIds.has(t.id))
    .slice(0, 5)
    .map((t) => ({ id: t.id, symbol: t.symbol, name: t.name, aliases: [t.name.toLowerCase(), t.symbol.toLowerCase()] }));
  return [...CORE_COINS, ...extra];
}

async function processMarket(
  market: Market,
  date: string,
  yesterday: string,
  coins: Coin[],
  global: GlobalSignals,
  reddit: RedditSignal,
  withTrends: boolean,
): Promise<SourceHealth[]> {
  const health: SourceHealth[] = [];
  const failedSources: string[] = [];

  // Local news
  const news = await fetchMarketNews(market.code);
  health.push(...news.health);
  failedSources.push(...news.health.filter((h) => !h.ok).map((h) => h.source));
  const mentions = countMentions(news.items, coins);
  const newsKeywords = extractNewsKeywords(news.items, coins);
  await saveSnapshot({ date, market_code: market.code, source: "rss", raw_data: news.items.slice(0, 40) });

  // Generic/competitor Trends terms (for search interest): competitor brands + the language's generic seeds
  const genericTerms = [...COMPETITORS.slice(0, 3), ...market.genericSeeds];

  // Google Trends (if part of today's rotation)
  type GenericSignal = { term: string; score: number | null; changePct: number | null; rising: string[] };
  let trends = {
    available: false,
    interest: [] as never[],
    rising: {} as Record<string, RisingQuery[]>,
    dailyCrypto: [] as string[],
    genericInterest: [] as Array<{ coin: string; score: number | null; changePct: number | null }>,
    genericRising: {} as Record<string, RisingQuery[]>,
  };
  if (withTrends) {
    // Overall crypto search interest FIRST (cheap, 1 call) so it completes within the
    // function time budget even if the heavier collection below gets cut off.
    const overall = await overallCryptoInterest(market);
    if (overall) {
      await saveCryptoOverall({
        date,
        market_code: market.code,
        score: overall.score,
        change_1d: overall.change1d,
        change_7d: overall.change7d,
        change_30d: overall.change30d,
      });
      health.push({ source: `gtrends_overall:${market.code}`, ok: true, detail: `1d/7d/30d` });
    }

    const t = await collectMarketTrends(
      market,
      coins.slice(0, TRENDS_INTEREST_COINS),
      coins.slice(0, TRENDS_RISING_COINS),
      genericTerms,
    );
    health.push(...t.health);
    failedSources.push(...t.health.filter((h) => !h.ok).map((h) => h.source));
    trends = {
      available: t.health.some((h) => h.ok && h.source.startsWith("gtrends_interest")),
      interest: t.interest as never[],
      rising: t.rising,
      dailyCrypto: t.dailyCrypto,
      genericInterest: t.genericInterest,
      genericRising: t.genericRising,
    };
    await saveSnapshot({ date, market_code: market.code, source: "gtrends_interest", raw_data: { interest: t.interest, rising: t.rising, dailyCrypto: t.dailyCrypto, genericInterest: t.genericInterest } });
  }

  // market_metrics: news mentions + (if any) trends interest/rising + generic terms
  const yMap = await getYesterdayMentions(market.code, yesterday);
  const interestByCoin = new Map(trends.interest.map((i: { coin: string; score: number | null; changePct: number | null }) => [i.coin, i]));
  const topics = new Set<string>([...mentions.map((m) => m.topic), ...trends.interest.map((i: { coin: string }) => i.coin)]);
  const metricRows: MarketMetric[] = [...topics].map((topic) => {
    const men = mentions.find((m) => m.topic === topic);
    const iot = interestByCoin.get(topic);
    return {
      date,
      market_code: market.code,
      coin_or_topic: topic,
      interest_score: iot?.score ?? null,
      interest_change_pct: iot?.changePct ?? null,
      news_mentions: men?.count ?? 0,
      news_mentions_change: (men?.count ?? 0) - (yMap[topic] ?? 0),
      rising_queries: trends.rising[topic] ?? [],
    };
  });
  // Also write generic/competitor terms as metrics (coin_or_topic = term)
  for (const gi of trends.genericInterest) {
    metricRows.push({
      date,
      market_code: market.code,
      coin_or_topic: gi.coin,
      interest_score: gi.score,
      interest_change_pct: gi.changePct,
      news_mentions: 0,
      news_mentions_change: 0,
      rising_queries: trends.genericRising[gi.coin] ?? [],
    });
  }
  await saveMetrics(metricRows);

  const genericSignals: GenericSignal[] = trends.genericInterest.map((gi) => ({
    term: gi.coin,
    score: gi.score,
    changePct: gi.changePct,
    rising: (trends.genericRising[gi.coin] ?? []).map((r) => r.query),
  }));

  // Claude analysis
  const pkg = assembleMarketPackage({
    date,
    market,
    trends,
    todayMentions: mentions.map((m) => ({ topic: m.topic, count: m.count })),
    newsKeywords,
    genericSignals,
    yesterdayMentions: yMap,
    globalTrending: global.trending.slice(0, 10).map((c) => c.name),
    redditTopics: reddit.topicMentions.slice(0, 8).map((t) => t.topic),
    failedSources,
  });

  if (isClaudeConfigured()) {
    try {
      const analysis = await analyzeMarket(pkg);
      if (analysis) {
        const recs: Recommendation[] = analysis.recommendations.map((r) => ({
          date,
          market_code: market.code,
          topic: r.topic,
          action: r.action,
          confidence: r.confidence,
          suggested_keywords: r.suggestedKeywords,
          reasoning: r.reasoning,
        }));
        await saveRecommendations(recs);
        await saveSummary({ date, market_code: market.code, summary: analysis.marketSummary });
        health.push({ source: `claude:${market.code}`, ok: true, detail: `${recs.length} recommendations` });
      }
    } catch (err) {
      health.push({ source: `claude:${market.code}`, ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return health;
}

export interface RunOptions {
  onlyMarket?: MarketCode; // process only this market (manual single-market refresh)
  skipTrends?: boolean; // skip Trends (for speed)
  forceTrends?: boolean; // ignore rotation, collect Trends for the selected market(s)
}

export async function runDaily(opts: RunOptions = {}): Promise<DailyResult> {
  const started = Date.now();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const allHealth: SourceHealth[] = [];

  // 1) Global signals
  const global = await getGlobalSignals();
  allHealth.push({ source: "coingecko", ok: global.ok, detail: global.error });
  if (global.ok) await saveSnapshot({ date, market_code: "GLOBAL", source: "coingecko", raw_data: { trending: global.trending, markets: global.markets.slice(0, 50) } });

  const reddit = await getRedditSignal();
  allHealth.push(reddit.health);
  if (reddit.ok) await saveSnapshot({ date, market_code: "EU-EN", source: "reddit", raw_data: { hot: reddit.hotPosts.slice(0, 25), rising: reddit.risingPosts.slice(0, 25) } });

  const coins = todaysCoinList(global);
  const trendsToday = trendsMarketsForToday(now);

  // 2) Order of markets to process: only the requested one if given; otherwise rotated order.
  const rotate = dayOfYear(now) % MARKETS.length;
  const ordered = opts.onlyMarket
    ? MARKETS.filter((m) => m.code === opts.onlyMarket)
    : [...MARKETS.slice(rotate), ...MARKETS.slice(0, rotate)];

  const processed: MarketCode[] = [];
  const skipped: MarketCode[] = [];

  for (const market of ordered) {
    // No budget check in single-market mode (the user triggered it intentionally).
    if (!opts.onlyMarket && Date.now() - started > TIME_BUDGET_MS) {
      skipped.push(market.code);
      continue;
    }
    const withTrends = opts.skipTrends
      ? false
      : opts.forceTrends || (opts.onlyMarket ? true : false) || trendsToday.has(market.code);
    try {
      const h = await processMarket(market, date, yesterday, coins, global, reddit, withTrends);
      allHealth.push(...h);
      processed.push(market.code);
    } catch (err) {
      allHealth.push({ source: `market:${market.code}`, ok: false, detail: err instanceof Error ? err.message : String(err) });
      skipped.push(market.code);
    }
  }

  await saveHealth(date, allHealth);

  return {
    date,
    processedMarkets: processed,
    skippedMarkets: skipped,
    trendsMarkets: [...trendsToday],
    claudeUsed: isClaudeConfigured(),
    health: allHealth,
  };
}
