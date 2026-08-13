// Google Trends integration — the PRIMARY source but the most fragile one.
//
// CRITICAL FACTS (2026-08 live test):
//  - `google-trends-api` is unofficial; Google applies aggressive IP-based rate limiting.
//  - When the quota is hit it returns an "Error 429" HTML page instead of JSON → JSON.parse blows up.
//    So every response is first checked for HTML, then parsed.
//  - Mitigation: 4-6s wait between requests, independent try/catch per geo,
//    exponential backoff on 429, and a global "budget" to return partial results.
//  - If everything fails, the caller proceeds without Trends (RSS+CoinGecko+Reddit).

import gt from "google-trends-api";
import type { Market } from "@/config/markets";
import { chunkCoins, type Coin } from "@/config/coins";
import type { RisingQuery, SourceHealth } from "./types";
import { sleep } from "./http";

// google-trends-api CJS default export compatibility
const g = (gt as unknown as { default?: typeof gt }).default ?? gt;

const BASE_DELAY_MS = 4500; // default wait between requests
const MAX_ATTEMPTS = 3;

function looksLikeHtml(s: string): boolean {
  const head = s.slice(0, 40).toLowerCase();
  return head.includes("<html") || head.includes("<!doctype");
}

// Safely wraps a Trends call: HTML/429 detection + backoff. Returns null on failure.
async function safeCall<T>(
  fn: (opts: Record<string, unknown>) => Promise<string>,
  opts: Record<string, unknown>,
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await fn.call(g, opts);
      if (typeof raw !== "string" || looksLikeHtml(raw)) {
        // 429 / consent / error page — backoff and retry
        if (attempt < MAX_ATTEMPTS) await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      return JSON.parse(raw) as T;
    } catch {
      if (attempt < MAX_ATTEMPTS) await sleep(BASE_DELAY_MS * 2 ** attempt);
    }
  }
  return null;
}

// --- interestOverTime ---

interface IotResponse {
  default?: {
    timelineData?: Array<{ value?: number[]; time?: string }>;
  };
}

export interface InterestPoint {
  coin: string; // coin name
  score: number | null; // last value (0-100)
  changePct: number | null; // % change over the window
}

// interestOverTime for a single group of 5. keyword order = value[] order.
async function interestForChunk(
  coins: Coin[],
  geo: string,
): Promise<InterestPoint[] | null> {
  const opts: Record<string, unknown> = {
    keyword: coins.map((c) => c.name),
    startTime: new Date(Date.now() - 7 * 864e5),
  };
  if (geo) opts.geo = geo;

  const res = await safeCall<IotResponse>(g.interestOverTime as never, opts);
  if (!res?.default?.timelineData?.length) return null;

  const timeline = res.default.timelineData.filter((p) => Array.isArray(p.value));
  if (timeline.length === 0) return null;

  const last = timeline[timeline.length - 1];
  const first = timeline[0];

  return coins.map((c, i) => {
    const score = last.value?.[i] ?? null;
    const start = first.value?.[i] ?? null;
    let changePct: number | null = null;
    if (score !== null && start !== null && start > 0) {
      changePct = ((score - start) / start) * 100;
    }
    return { coin: c.name, score, changePct };
  });
}

// interestOverTime for generic/free-text terms (plain strings, not coin objects).
async function interestForTerms(terms: string[], geo: string): Promise<InterestPoint[] | null> {
  if (terms.length === 0) return null;
  const opts: Record<string, unknown> = {
    keyword: terms,
    startTime: new Date(Date.now() - 7 * 864e5),
  };
  if (geo) opts.geo = geo;

  const res = await safeCall<IotResponse>(g.interestOverTime as never, opts);
  if (!res?.default?.timelineData?.length) return null;
  const timeline = res.default.timelineData.filter((p) => Array.isArray(p.value));
  if (timeline.length === 0) return null;
  const last = timeline[timeline.length - 1];
  const first = timeline[0];

  return terms.map((term, i) => {
    const score = last.value?.[i] ?? null;
    const start = first.value?.[i] ?? null;
    let changePct: number | null = null;
    if (score !== null && start !== null && start > 0) changePct = ((score - start) / start) * 100;
    return { coin: term, score, changePct };
  });
}

// --- relatedQueries (rising) ---

interface RqResponse {
  default?: {
    rankedList?: Array<{ rankedKeyword?: Array<{ query: string; value: number | string }> }>;
  };
}

export async function risingQueries(keyword: string, geo: string): Promise<RisingQuery[] | null> {
  const opts: Record<string, unknown> = {
    keyword,
    startTime: new Date(Date.now() - 7 * 864e5),
  };
  if (geo) opts.geo = geo;

  const res = await safeCall<RqResponse>(g.relatedQueries as never, opts);
  // rankedList[1] = "rising", [0] = "top"
  const rising = res?.default?.rankedList?.[1]?.rankedKeyword;
  if (!rising) return null;
  return rising.slice(0, 10).map((r) => ({ query: r.query, value: r.value }));
}

// --- dailyTrends (crypto-filtered) ---

interface DtResponse {
  default?: {
    trendingSearchesDays?: Array<{
      trendingSearches?: Array<{ title?: { query?: string }; formattedTraffic?: string }>;
    }>;
  };
}

// Filters the country's general daily trends down to crypto-related ones.
export async function cryptoDailyTrends(
  market: Market,
  coins: Coin[],
): Promise<string[] | null> {
  if (!market.trendsGeo) return null; // dailyTrends is meaningless for a global geo

  const res = await safeCall<DtResponse>(g.dailyTrends as never, { geo: market.trendsGeo });
  const searches = res?.default?.trendingSearchesDays?.[0]?.trendingSearches;
  if (!searches) return null;

  const cryptoTerms = new Set<string>([
    ...market.priceKeywords.map((k) => k.toLowerCase()),
    ...coins.flatMap((c) => [c.name.toLowerCase(), ...c.aliases.map((a) => a.toLowerCase())]),
  ]);

  const hits: string[] = [];
  for (const s of searches) {
    const q = (s.title?.query ?? "").trim();
    if (!q) continue;
    const lower = q.toLowerCase();
    if ([...cryptoTerms].some((term) => lower.includes(term))) hits.push(q);
  }
  return hits;
}

// --- All Trends signals for a single market ---

export interface MarketTrends {
  geo: string;
  interest: InterestPoint[];
  rising: Record<string, RisingQuery[]>; // coin name -> rising queries
  dailyCrypto: string[];
  // Trends interest + rising queries for non-coin generic/competitor terms
  genericInterest: InterestPoint[]; // term -> score/change
  genericRising: Record<string, RisingQuery[]>;
  health: SourceHealth[];
}

// Collects a market's Trends data sequentially, spaced out, and resiliently.
// risingForCoins: relatedQueries is fetched only for these (priority) coins —
// to keep the request count within Vercel's time limit (spec: limit request count).
// genericTerms: non-coin generic/competitor terms (for search interest).
export async function collectMarketTrends(
  market: Market,
  coins: Coin[],
  risingForCoins: Coin[],
  genericTerms: string[] = [],
): Promise<MarketTrends> {
  const geo = market.trendsGeo;
  const health: SourceHealth[] = [];
  const interest: InterestPoint[] = [];

  // interestOverTime — groups of 5
  const chunks = chunkCoins(coins, 5);
  let iotOk = 0;
  for (const chunk of chunks) {
    const pts = await interestForChunk(chunk, geo);
    if (pts) {
      interest.push(...pts);
      iotOk++;
    }
    await sleep(BASE_DELAY_MS);
  }
  health.push({
    source: `gtrends_interest:${market.code}`,
    ok: iotOk > 0,
    detail: `${iotOk}/${chunks.length} groups`,
  });

  // relatedQueries (rising) — priority coins only
  const rising: Record<string, RisingQuery[]> = {};
  let rqOk = 0;
  for (const c of risingForCoins) {
    const rq = await risingQueries(c.name, geo);
    if (rq) {
      rising[c.name] = rq;
      rqOk++;
    }
    await sleep(BASE_DELAY_MS);
  }
  health.push({
    source: `gtrends_rising:${market.code}`,
    ok: rqOk > 0 || risingForCoins.length === 0,
    detail: `${rqOk}/${risingForCoins.length} coin`,
  });

  // Generic/competitor terms — interest (groups of 5) + rising for the first 2 terms
  const genericInterest: InterestPoint[] = [];
  const genericRising: Record<string, RisingQuery[]> = {};
  if (genericTerms.length > 0) {
    let gOk = 0;
    for (let i = 0; i < genericTerms.length; i += 5) {
      const pts = await interestForTerms(genericTerms.slice(i, i + 5), geo);
      if (pts) {
        genericInterest.push(...pts);
        gOk++;
      }
      await sleep(BASE_DELAY_MS);
    }
    for (const term of genericTerms.slice(0, 2)) {
      const rq = await risingQueries(term, geo);
      if (rq) genericRising[term] = rq;
      await sleep(BASE_DELAY_MS);
    }
    health.push({ source: `gtrends_generic:${market.code}`, ok: gOk > 0, detail: `${genericInterest.length} terms` });
  }

  // dailyTrends (crypto-filtered)
  let dailyCrypto: string[] = [];
  const daily = await cryptoDailyTrends(market, coins);
  if (daily !== null) {
    dailyCrypto = daily;
    health.push({ source: `gtrends_daily:${market.code}`, ok: true, detail: `${daily.length} crypto trend` });
  } else if (geo) {
    health.push({ source: `gtrends_daily:${market.code}`, ok: false, detail: "unavailable" });
  }

  return { geo, interest, rising, dailyCrypto, genericInterest, genericRising, health };
}
