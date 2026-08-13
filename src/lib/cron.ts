// Günlük cron orkestrasyonu.
//
// Mimari kararlar (bkz. Faz 4 kısıtı — kullanıcı "pazar rotasyonu" seçti):
//  - Google Trends tek pazar için ~60sn+ sürebiliyor ve Vercel Hobby fonksiyonları 60sn'de kesiliyor.
//    Bu yüzden Trends her gün SADECE birkaç pazar için toplanır; başlangıç indeksi günden güne
//    döndürülür (rotate) → tüm pazarlar birkaç günde kapsanır.
//  - RSS + CoinGecko + Reddit her pazar için her gün çalışır (hızlı).
//  - Zaman bütçesi: bütçe dolunca kalan pazarlar Trends'siz/işlenmeden bırakılır; her pazar
//    tamamlandıkça kaydedilir, böylece kısmi çalıştırma bile veri üretir.

import { MARKETS, type Market, type MarketCode } from "@/config/markets";
import { CORE_COINS, type Coin } from "@/config/coins";
import { COMPETITORS } from "@/config/themes";
import { getGlobalSignals, type GlobalSignals } from "./coingecko";
import { getRedditSignal, type RedditSignal } from "./reddit";
import { fetchMarketNews, countMentions, extractNewsKeywords } from "./rss";
import { collectMarketTrends } from "./gtrends";
import { assembleMarketPackage } from "./assemble";
import { analyzeMarket, isClaudeConfigured } from "./claude";
import {
  saveSnapshot,
  saveMetrics,
  saveRecommendations,
  saveSummary,
  saveHealth,
  getYesterdayMentions,
} from "./store";
import type { MarketMetric, Recommendation, SourceHealth, RisingQuery } from "./types";

const TIME_BUDGET_MS = 55_000; // Vercel Hobby 60sn limitinin altında güvenli pay
const TRENDS_MARKETS_PER_DAY = 2; // her gün kaç pazar için Trends toplanacak
const TRENDS_INTEREST_COINS = 10; // interestOverTime için (2 grup)
const TRENDS_RISING_COINS = 4; // relatedQueries yalnızca en öncelikli birkaç coin

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

// Bugün Trends toplanacak pazarları rotasyonla seçer (EU-EN global geo'suz olduğu için hariç).
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

// Global bağlam: CoinGecko trending'e giren yeni coinleri çekirdek listeye ekler.
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

  // Yerel haber
  const news = await fetchMarketNews(market.code);
  health.push(...news.health);
  failedSources.push(...news.health.filter((h) => !h.ok).map((h) => h.source));
  const mentions = countMentions(news.items, coins);
  const newsKeywords = extractNewsKeywords(news.items, coins);
  await saveSnapshot({ date, market_code: market.code, source: "rss", raw_data: news.items.slice(0, 40) });

  // Jenerik/rakip Trends terimleri (arama ilgisi için): rakip markalar + o dilin jenerik seed'leri
  const genericTerms = [...COMPETITORS.slice(0, 3), ...market.genericSeeds];

  // Google Trends (rotasyona dahilse)
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

  // market_metrics: haber bahsi + (varsa) trends ilgi/rising + jenerik terimler
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
  // Jenerik/rakip terimleri de metrik olarak yaz (coin_or_topic = terim)
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

  // Claude analizi
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
        health.push({ source: `claude:${market.code}`, ok: true, detail: `${recs.length} öneri` });
      }
    } catch (err) {
      health.push({ source: `claude:${market.code}`, ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return health;
}

export interface RunOptions {
  onlyMarket?: MarketCode; // sadece bu pazarı işle (manuel tek-pazar yenileme)
  skipTrends?: boolean; // Trends'i atla (hız için)
  forceTrends?: boolean; // rotasyona bakma, seçili pazar(lar) için Trends topla
}

export async function runDaily(opts: RunOptions = {}): Promise<DailyResult> {
  const started = Date.now();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const allHealth: SourceHealth[] = [];

  // 1) Global sinyaller
  const global = await getGlobalSignals();
  allHealth.push({ source: "coingecko", ok: global.ok, detail: global.error });
  if (global.ok) await saveSnapshot({ date, market_code: "GLOBAL", source: "coingecko", raw_data: { trending: global.trending, markets: global.markets.slice(0, 50) } });

  const reddit = await getRedditSignal();
  allHealth.push(reddit.health);
  if (reddit.ok) await saveSnapshot({ date, market_code: "EU-EN", source: "reddit", raw_data: { hot: reddit.hotPosts.slice(0, 25), rising: reddit.risingPosts.slice(0, 25) } });

  const coins = todaysCoinList(global);
  const trendsToday = trendsMarketsForToday(now);

  // 2) İşlenecek pazar sırası: tek pazar istendiyse sadece o; yoksa rotasyonlu sıra.
  const rotate = dayOfYear(now) % MARKETS.length;
  const ordered = opts.onlyMarket
    ? MARKETS.filter((m) => m.code === opts.onlyMarket)
    : [...MARKETS.slice(rotate), ...MARKETS.slice(0, rotate)];

  const processed: MarketCode[] = [];
  const skipped: MarketCode[] = [];

  for (const market of ordered) {
    // Tek pazar modunda bütçe kontrolü uygulama (kullanıcı bilerek tetikledi).
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
