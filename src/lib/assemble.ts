// Karşılaştırmalı veri paketi oluşturucu.
// Tüm kaynaklardan gelen sinyalleri pazar başına TEK pakete toplar; bu paket hem Claude
// prompt'unu besler hem de market_metrics'e yazılacak türetilmiş metrikleri içerir.

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

  // Yerel haber (bugün + dün farkı)
  newsMentions: Array<{ topic: string; count: number; change: number }>;
  // Başlıklardan çıkarılan aday keyword'ler (coin + konu/olay)
  newsKeywords: Array<{ keyword: string; count: number; coin: string }>;
  // Coin-dışı jenerik/rakip terimlerin Trends arama ilgisi
  genericSignals: Array<{ term: string; score: number | null; changePct: number | null; rising: string[] }>;

  // Global bağlam
  globalTrending: string[]; // CoinGecko trending coin adları
  redditTopics: string[]; // Reddit'te yükselen konular

  // Kaynak sağlığı
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
    redditTopics: input.redditTopics,
    failedSources: input.failedSources,
  };
}
