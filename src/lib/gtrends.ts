// Google Trends entegrasyonu — ANA KAYNAK ama en kırılgan olanı.
//
// KRİTİK GERÇEKLER (2026-08 canlı test):
//  - `google-trends-api` resmi değil; Google IP bazlı agresif rate-limit uygular.
//  - Kota dolduğunda JSON yerine "Error 429" HTML sayfası döner → JSON.parse patlar.
//    Bu yüzden her yanıt önce HTML mı diye kontrol edilir, sonra parse edilir.
//  - Çözüm: istekler arası 4-6 sn bekleme, geo başına bağımsız try/catch,
//    429'da exponential backoff, ve global bir "bütçe" ile kısmi sonuçla dön.
//  - Tümü başarısız olursa çağıran taraf Trends'siz devam eder (RSS+CoinGecko+Reddit).

import gt from "google-trends-api";
import type { Market } from "@/config/markets";
import { chunkCoins, type Coin } from "@/config/coins";
import type { RisingQuery, SourceHealth } from "./types";
import { sleep } from "./http";

// google-trends-api CJS default export uyumu
const g = (gt as unknown as { default?: typeof gt }).default ?? gt;

const BASE_DELAY_MS = 4500; // istekler arası varsayılan bekleme
const MAX_ATTEMPTS = 3;

function looksLikeHtml(s: string): boolean {
  const head = s.slice(0, 40).toLowerCase();
  return head.includes("<html") || head.includes("<!doctype");
}

// Trends çağrısını güvenli sarar: HTML/429 tespiti + backoff. Başarısızsa null.
async function safeCall<T>(
  fn: (opts: Record<string, unknown>) => Promise<string>,
  opts: Record<string, unknown>,
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await fn.call(g, opts);
      if (typeof raw !== "string" || looksLikeHtml(raw)) {
        // 429 / consent / hata sayfası — backoff ve tekrar dene
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
  coin: string; // coin adı
  score: number | null; // son değer (0-100)
  changePct: number | null; // pencere başına göre % değişim
}

// Tek bir 5'li grup için interestOverTime. keywords sırası = value[] sırası.
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

// Jenerik/serbest metin terimleri için interestOverTime (coin nesnesi değil, düz string'ler).
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
  // rankedList[1] = "rising" (yükselen), [0] = "top"
  const rising = res?.default?.rankedList?.[1]?.rankedKeyword;
  if (!rising) return null;
  return rising.slice(0, 10).map((r) => ({ query: r.query, value: r.value }));
}

// --- dailyTrends (crypto filtreli) ---

interface DtResponse {
  default?: {
    trendingSearchesDays?: Array<{
      trendingSearches?: Array<{ title?: { query?: string }; formattedTraffic?: string }>;
    }>;
  };
}

// Ülkenin genel günlük trend'lerinden crypto ile ilgili olanları filtreler.
export async function cryptoDailyTrends(
  market: Market,
  coins: Coin[],
): Promise<string[] | null> {
  if (!market.trendsGeo) return null; // global geo için dailyTrends anlamlı değil

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

// --- Tek pazar için tüm Trends sinyalleri ---

export interface MarketTrends {
  geo: string;
  interest: InterestPoint[];
  rising: Record<string, RisingQuery[]>; // coin adı -> yükselen sorgular
  dailyCrypto: string[];
  // Coin-dışı jenerik/rakip terimler için Trends ilgi + yükselen sorgular
  genericInterest: InterestPoint[]; // term -> skor/değişim
  genericRising: Record<string, RisingQuery[]>;
  health: SourceHealth[];
}

// Bir pazarın Trends verisini sırayla, aralıklı ve dayanıklı biçimde toplar.
// risingForCoins: relatedQueries yalnızca bu (öncelikli) coinler için çekilir —
// istek sayısını Vercel süre limiti içinde tutmak için (spec: istek sayısını sınırla).
// genericTerms: coin-dışı jenerik/rakip terimler (arama ilgisi için).
export async function collectMarketTrends(
  market: Market,
  coins: Coin[],
  risingForCoins: Coin[],
  genericTerms: string[] = [],
): Promise<MarketTrends> {
  const geo = market.trendsGeo;
  const health: SourceHealth[] = [];
  const interest: InterestPoint[] = [];

  // interestOverTime — 5'li gruplar
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
    detail: `${iotOk}/${chunks.length} grup`,
  });

  // relatedQueries (rising) — yalnızca öncelikli coinler
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

  // Jenerik/rakip terimler — interest (5'li gruplar) + ilk 2 terim için rising
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
    health.push({ source: `gtrends_generic:${market.code}`, ok: gOk > 0, detail: `${genericInterest.length} terim` });
  }

  // dailyTrends (crypto filtreli)
  let dailyCrypto: string[] = [];
  const daily = await cryptoDailyTrends(market, coins);
  if (daily !== null) {
    dailyCrypto = daily;
    health.push({ source: `gtrends_daily:${market.code}`, ok: true, detail: `${daily.length} crypto trend` });
  } else if (geo) {
    health.push({ source: `gtrends_daily:${market.code}`, ok: false, detail: "alınamadı" });
  }

  return { geo, interest, rising, dailyCrypto, genericInterest, genericRising, health };
}
