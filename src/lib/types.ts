import type { MarketCode } from "@/config/markets";

export type SourceType =
  | "gtrends_interest"
  | "gtrends_rising"
  | "gtrends_daily"
  | "coingecko"
  | "rss"
  | "reddit";

export type Action = "invest" | "watch" | "reduce";
export type Confidence = "low" | "medium" | "high";

// --- Supabase row types ---

export interface DailySnapshot {
  id?: number;
  date: string; // YYYY-MM-DD
  market_code: MarketCode | "GLOBAL";
  source: SourceType;
  raw_data: unknown;
  created_at?: string;
}

export interface MarketMetric {
  id?: number;
  date: string;
  market_code: MarketCode;
  coin_or_topic: string;
  interest_score: number | null; // Trends 0-100
  interest_change_pct: number | null;
  news_mentions: number;
  news_mentions_change: number;
  rising_queries: RisingQuery[];
}

export interface RisingQuery {
  query: string;
  value: number | string; // Trends "rising" value (number or "Breakout")
}

export interface Recommendation {
  id?: number;
  date: string;
  market_code: MarketCode;
  topic: string;
  action: Action;
  confidence: Confidence;
  suggested_keywords: string[];
  reasoning: string;
  created_at?: string;
}

export interface MarketSummary {
  id?: number;
  date: string;
  market_code: MarketCode;
  summary: string;
}

// --- Source health tracking ---

export interface SourceHealth {
  source: string; // "gtrends:NL", "rss:DE:Cointelegraph DE", "coingecko", ...
  ok: boolean;
  detail?: string;
}
