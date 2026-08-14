// Comparative data-package builder.
// Collects signals from every source into ONE package per market; this package both feeds
// the Claude prompt and holds the derived metrics that get written to market_metrics.

import type { Market } from "@/config/markets";
import type { InterestPoint } from "./gtrends";
import type { RisingQuery } from "./types";

export interface MarketDataPackage {
  date: string;
  market: Market;

  // Google Trends
  trendsAvailable: boolean;
  interest: InterestPoint[];
  rising: Record<string, RisingQuery[]>;
  dailyCrypto: string[];

  // Local news (today + change vs yesterday)
  newsMentions: Array<{ topic: string; count: number; change: number }>;
  // Candidate keywords extracted from headlines (coin + topic/event)
  newsKeywords: Array<{ keyword: string; count: number; coin: string }>;
  // Trends search interest for non-coin generic/competitor terms
  genericSignals: Array<{ term: string; score: number | null; changePct: number | null; rising: string[] }>;

  // Global context
  globalTrending: string[]; // CoinGecko + CoinMarketCap combined trending (cross-source confirmed flagged)
  topMovers: string[]; // CoinGecko + CoinMarketCap combined top 24h gainers/losers
  cmcGlobal: string; // CoinMarketCap market-regime summary (total cap change, BTC dominance)
  redditTopics: string[]; // rising topics on Reddit

  // Source health
  failedSources: string[];
}

export interface AssembleInput {
  date: string;
  market: Market;
  trends: {
    available: boolean;
    interest: InterestPoint[];
    rising: Record<string, RisingQuery[]>;
    dailyCrypto: string[];
  };
  todayMentions: Array<{ topic: string; count: number }>;
  newsKeywords?: Array<{ keyword: string; count: number; coin: string }>;
  genericSignals?: Array<{ term: string; score: number | null; changePct: number | null; rising: string[] }>;
  yesterdayMentions?: Record<string, number>;
  globalTrending: string[];
  topMovers?: string[];
  cmcGlobal?: string;
  redditTopics: string[];
  failedSources: string[];
}

export function assembleMarketPackage(input: AssembleInput): MarketDataPackage {
  const yMap = input.yesterdayMentions ?? {};
  const newsMentions = input.todayMentions.map((m) => ({
    topic: m.topic,
    count: m.count,
    change: m.count - (yMap[m.topic] ?? 0),
  }));

  return {
    date: input.date,
    market: input.market,
    trendsAvailable: input.trends.available,
    interest: input.trends.interest,
    rising: input.trends.rising,
    dailyCrypto: input.trends.dailyCrypto,
    newsMentions,
    newsKeywords: input.newsKeywords ?? [],
    genericSignals: input.genericSignals ?? [],
    globalTrending: input.globalTrending,
    topMovers: input.topMovers ?? [],
    cmcGlobal: input.cmcGlobal ?? "unavailable",
    redditTopics: input.redditTopics,
    failedSources: input.failedSources,
  };
}
