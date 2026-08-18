// Daily cron orchestration.
//
// Architecture (rewritten 2026-08-17 after a reliability audit — see below):
//  - PHASE 1 (fast, ALL 8 markets, IN PARALLEL): RSS + CoinGecko/CMC context + Claude
//    analysis. No Google Trends. This is the part that actually matters every day
//    (fresh recommendations), and none of its steps are individually slow, so markets
//    run concurrently instead of one-by-one — total time ≈ the slowest single market,
//    not the sum of all eight. Health is saved immediately after this phase, so even if
//    phase 2 dies, phase 1's results are never lost/invisible.
//  - PHASE 2 (slow, budget-gated, ROTATING subset of markets, SEQUENTIAL): Google Trends
//    enrichment. Sequential on purpose — Trends is IP-rate-limited, so the calls are
//    deliberately spaced out (see gtrends.ts); parallelizing them would make 429s worse,
//    not better. Only attempted while time remains in the budget, and any Trends data it
//    finds is *merged* into phase 1's market_metrics rows (never overwrites mention
//    counts). Health is saved again after this phase.
//
// Why this split exists: measured in production, ONE market's full Trends collection
// (interest + rising + generic terms + daily trends, each call deliberately spaced ~4.5s
// apart to avoid rate-limiting) takes ~35-45s even with zero retries. Running that
// sequentially before/between 8 markets' Claude calls routinely blew past Vercel's 60s
// Hobby function limit — the function got hard-killed mid-run, so most markets never got
// processed AND the final saveHealth() call (which only ran at the very end) never
// happened either, leaving the UI's Source Health card with nothing to show — a
// completely silent multi-day outage. This restructure fixes both: recommendations no
// longer depend on Trends succeeding or even finishing, and health is never lost.

import { MARKETS, type Market, type MarketCode } from "@/config/markets";
import { CORE_COINS, type Coin } from "@/config/coins";
import { COMPETITORS } from "@/config/themes";
import { getGlobalSignals, type GlobalSignals } from "./coingecko";
import { getCmcSignals, formatGlobalMarket, type CmcSignals } from "./coinmarketcap";
import { combineGlobalSignals, formatTrending, formatMovers, type CombinedGlobalSignals } from "./globalMarket";
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
  getMetrics,
} from "./store";
import type { MarketMetric, Recommendation, SourceHealth } from "./types";

const TIME_BUDGET_MS = 48_000; // safe margin under the Vercel Hobby 60s limit
// Manual single-market triggers get a more generous ceiling (deliberate, patient action —
// not competing with 7 other markets), but MUST still be measured from actual elapsed time,
// not a fixed number: a static 45s cap here previously ignored phase 0/1/overall overhead
// and reliably lost the race against Vercel's hard 60s kill (confirmed live: 4/4 single-
// market real-Trends triggers timed out at exactly ~60s with zero response).
const MANUAL_TIME_BUDGET_MS = 52_000;
const RESPONSE_OVERHEAD_MS = 6_000; // reserved for the final saveHealth() write + JSON response
const TRENDS_MARKETS_PER_DAY = 1; // one market/day keeps phase 2 comfortably inside the budget
const TRENDS_INTEREST_COINS = 10; // for interestOverTime (2 groups)
const TRENDS_RISING_COINS = 2; // relatedQueries for only the top couple of coins (was 4 — fewer sequential calls)

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

// Races a promise against a timer so a hung/slow call can never block the caller forever.
// Note: the loser keeps running in the background (JS can't truly cancel an in-flight
// google-trends-api call) — this bounds OUR control flow, it isn't a true abort.
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(onTimeout), ms))]);
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

// --- Phase 1: fast path (RSS + Claude), no Trends. Safe to run for all markets in parallel. ---
async function processMarketFast(
  market: Market,
  date: string,
  yesterday: string,
  coins: Coin[],
  combined: CombinedGlobalSignals,
  reddit: RedditSignal,
  cmc: CmcSignals,
): Promise<SourceHealth[]> {
  const health: SourceHealth[] = [];
  const failedSources: string[] = [];

  const news = await fetchMarketNews(market.code);
  health.push(...news.health);
  failedSources.push(...news.health.filter((h) => !h.ok).map((h) => h.source));
  const mentions = countMentions(news.items, coins);
  const newsKeywords = extractNewsKeywords(news.items, coins);
  await saveSnapshot({ date, market_code: market.code, source: "rss", raw_data: news.items.slice(0, 40) });

  // Base metrics from mentions only — Phase 2 upserts interest_score/rising_queries onto
  // these SAME rows later if Trends succeeds for this market (see mergeTrendsIntoMetrics).
  const yMap = await getYesterdayMentions(market.code, yesterday);
  const metricRows: MarketMetric[] = mentions.map((m) => ({
    date,
    market_code: market.code,
    coin_or_topic: m.topic,
    interest_score: null,
    interest_change_pct: null,
    news_mentions: m.count,
    news_mentions_change: m.count - (yMap[m.topic] ?? 0),
    rising_queries: [],
  }));
  await saveMetrics(metricRows);

  const pkg = assembleMarketPackage({
    date,
    market,
    trends: { available: false, interest: [], rising: {}, dailyCrypto: [] },
    todayMentions: mentions.map((m) => ({ topic: m.topic, count: m.count })),
    newsKeywords,
    genericSignals: [], // Trends-derived; empty in the fast phase (Claude already handles "no Trends" gracefully)
    yesterdayMentions: yMap,
    globalTrending: formatTrending(combined.trending),
    topMovers: formatMovers(combined.gainers, combined.losers),
    cmcGlobal: formatGlobalMarket(cmc.global),
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

// --- Overall crypto search interest: ONE fast Trends call per rotation market, feeding
// the homepage's "Crypto search interest 1d/7d/30d" card. Deliberately kicked off
// CONCURRENTLY with phase 1 (see runDaily) rather than living inside phase 2 — phase 2
// only gets whatever budget phase 1 leaves behind (often just a few seconds once 8
// parallel Claude calls finish), which meant this card almost never updated in
// production even though the call itself is cheap. Running it alongside phase 1 gives it
// phase 1's whole ~35-40s window instead of phase 2's leftovers. ---
async function processMarketOverall(market: Market, date: string): Promise<SourceHealth> {
  try {
    const overall = await overallCryptoInterest(market);
    if (!overall) return { source: `gtrends_overall:${market.code}`, ok: false, detail: "unavailable" };
    await saveCryptoOverall({
      date,
      market_code: market.code,
      score: overall.score,
      change_1d: overall.change1d,
      change_7d: overall.change7d,
      change_30d: overall.change30d,
    });
    return { source: `gtrends_overall:${market.code}`, ok: true, detail: "1d/7d/30d" };
  } catch (err) {
    return { source: `gtrends_overall:${market.code}`, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

// --- Phase 2: Trends enrichment (rising queries, generic/competitor terms, daily trends —
// the heavier, multi-call collection). Sequential across markets (rate-limit spacing), one
// market at a time, each capped by withTimeout so a slow/flaky market can't hang the run. ---
async function processMarketTrends(market: Market, date: string, coins: Coin[]): Promise<SourceHealth[]> {
  const health: SourceHealth[] = [];
  const genericTerms = [...COMPETITORS.slice(0, 3), ...market.genericSeeds];

  const t = await collectMarketTrends(
    market,
    coins.slice(0, TRENDS_INTEREST_COINS),
    coins.slice(0, TRENDS_RISING_COINS),
    genericTerms,
  );
  health.push(...t.health);
  await saveSnapshot({
    date,
    market_code: market.code,
    source: "gtrends_interest",
    raw_data: { interest: t.interest, rising: t.rising, dailyCrypto: t.dailyCrypto, genericInterest: t.genericInterest },
  });

  // Merge into the market_metrics rows Phase 1 already wrote: fetch what's there first so
  // this upsert enriches interest_score/rising_queries WITHOUT clobbering news_mentions
  // (Supabase upsert replaces the whole row on conflict — it does not deep-merge fields).
  const existing = await getMetrics(date, market.code);
  const existingByTopic = new Map(existing.map((r) => [r.coin_or_topic, r]));
  const mentionsFor = (topic: string) => {
    const prev = existingByTopic.get(topic);
    return { news_mentions: prev?.news_mentions ?? 0, news_mentions_change: prev?.news_mentions_change ?? 0 };
  };

  const metricRows: MarketMetric[] = t.interest.map((i) => ({
    date,
    market_code: market.code,
    coin_or_topic: i.coin,
    interest_score: i.score,
    interest_change_pct: i.changePct,
    ...mentionsFor(i.coin),
    rising_queries: t.rising[i.coin] ?? [],
  }));
  for (const gi of t.genericInterest) {
    metricRows.push({
      date,
      market_code: market.code,
      coin_or_topic: gi.coin,
      interest_score: gi.score,
      interest_change_pct: gi.changePct,
      ...mentionsFor(gi.coin),
      rising_queries: t.genericRising[gi.coin] ?? [],
    });
  }
  if (metricRows.length > 0) await saveMetrics(metricRows);

  return health;
}

export interface RunOptions {
  onlyMarket?: MarketCode; // process only this market (manual single-market refresh)
  skipTrends?: boolean; // skip Trends entirely (for speed)
  forceTrends?: boolean; // ignore rotation, collect Trends for the selected market(s)
}

export async function runDaily(opts: RunOptions = {}): Promise<DailyResult> {
  const started = Date.now();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const allHealth: SourceHealth[] = [];

  // 0) Global signals (shared across every market's package) — independent, fetched in
  // parallel (previously sequential, which alone could eat 10-20s off the budget before
  // phase 1 even started).
  const [global, reddit, cmc] = await Promise.all([getGlobalSignals(), getRedditSignal(), getCmcSignals()]);

  allHealth.push({ source: "coingecko", ok: global.ok, detail: global.error });
  if (global.ok) await saveSnapshot({ date, market_code: "GLOBAL", source: "coingecko", raw_data: { trending: global.trending, markets: global.markets.slice(0, 50) } });

  allHealth.push(reddit.health);
  if (reddit.ok) await saveSnapshot({ date, market_code: "EU-EN", source: "reddit", raw_data: { hot: reddit.hotPosts.slice(0, 25), rising: reddit.risingPosts.slice(0, 25) } });

  allHealth.push({ source: "coinmarketcap", ok: cmc.ok, detail: cmc.error });
  if (cmc.ok) {
    await saveSnapshot({
      date,
      market_code: "GLOBAL",
      source: "coinmarketcap",
      raw_data: { gainers: cmc.gainers, losers: cmc.losers, global: cmc.global },
    });
  }

  const coins = todaysCoinList(global);
  const combined = combineGlobalSignals(global, cmc);
  const ordered = opts.onlyMarket ? MARKETS.filter((m) => m.code === opts.onlyMarket) : MARKETS;
  const trendsToday = trendsMarketsForToday(now);
  const trendsCandidates = opts.onlyMarket
    ? ordered // single-market manual trigger: always attempt Trends for it unless skipTrends
    : ordered.filter((m) => opts.forceTrends || trendsToday.has(m.code));

  // Kick off the cheap "overall interest" call for today's rotation market NOW, concurrently
  // with phase 1 below — see processMarketOverall for why this isn't inside phase 2.
  const overallPromise: Promise<SourceHealth[]> = opts.skipTrends
    ? Promise.resolve([])
    : Promise.all(trendsCandidates.map((m) => processMarketOverall(m, date)));

  // === Phase 1: fast path, ALL markets, in parallel ===
  const processed: MarketCode[] = [];
  const skipped: MarketCode[] = [];
  const phase1 = await Promise.allSettled(
    ordered.map((market) => processMarketFast(market, date, yesterday, coins, combined, reddit, cmc)),
  );
  for (let i = 0; i < ordered.length; i++) {
    const market = ordered[i];
    const result = phase1[i];
    if (result.status === "fulfilled") {
      allHealth.push(...result.value);
      processed.push(market.code);
    } else {
      allHealth.push({ source: `market:${market.code}`, ok: false, detail: String(result.reason) });
      skipped.push(market.code);
    }
  }

  // The overall-interest call(s) ran alongside phase 1 above; by now they're done or
  // finish within moments (phase 1 took much longer than a single Trends call needs).
  allHealth.push(...(await overallPromise));

  // Persist now — phase 1's (and overall's) results must never be lost even if phase 2 dies below.
  await saveHealth(date, allHealth);

  // === Phase 2: heavier Trends enrichment, sequential, budget-gated ===
  const trendsAttempted: MarketCode[] = [];
  if (!opts.skipTrends) {
    for (const market of trendsCandidates) {
      // Both modes cap dynamically to whatever budget phase 0/1/overall actually left
      // behind, measured from real elapsed time — a FIXED cap here (in either mode) is
      // what caused Vercel's hard 60s wall to fire before a response was ever sent
      // (confirmed live in both the automated run and single-market manual triggers).
      // Manual mode just gets a larger total ceiling since it isn't sharing budget with 7
      // other markets.
      const budget = opts.onlyMarket ? MANUAL_TIME_BUDGET_MS : TIME_BUDGET_MS;
      const remaining = budget - (Date.now() - started) - RESPONSE_OVERHEAD_MS;
      if (remaining < 5_000) break; // not enough budget left to bother starting another market
      const timeoutMs = remaining;
      try {
        const h = await withTimeout(processMarketTrends(market, date, coins), timeoutMs, [
          { source: `gtrends:${market.code}`, ok: false, detail: `timed out after ${timeoutMs}ms` },
        ]);
        allHealth.push(...h);
        trendsAttempted.push(market.code);
      } catch (err) {
        allHealth.push({ source: `gtrends:${market.code}`, ok: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }
    if (trendsAttempted.length > 0) await saveHealth(date, allHealth); // persist phase 2's results too
  }

  return {
    date,
    processedMarkets: processed,
    skippedMarkets: skipped,
    trendsMarkets: trendsAttempted,
    claudeUsed: isClaudeConfigured(),
    health: allHealth,
  };
}
