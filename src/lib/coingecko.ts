// CoinGecko integration — global early-warning signal (free tier).
// 2-3s wait between requests (rate limit). Optional demo key support.

import { fetchJson, sleep } from "./http";

const BASE = "https://api.coingecko.com/api/v3";

function keyHeaders(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-demo-api-key": key } : {};
}

export interface TrendingCoin {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number | null;
  thumb: string;
  priceChange24hUsd: number | null;
}

export interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  priceEur: number;
  change24hPct: number | null;
  volumeEur: number;
  marketCapRank: number | null;
}

interface RawTrending {
  coins?: Array<{
    item: {
      id: string;
      symbol: string;
      name: string;
      market_cap_rank: number | null;
      thumb: string;
      data?: { price_change_percentage_24h?: { usd?: number } };
    };
  }>;
}

export async function getTrending(): Promise<TrendingCoin[]> {
  const raw = await fetchJson<RawTrending>(`${BASE}/search/trending`, {
    headers: keyHeaders(),
    retries: 2,
  });
  return (raw.coins ?? []).map((c) => ({
    id: c.item.id,
    symbol: (c.item.symbol || "").toUpperCase(),
    name: c.item.name,
    marketCapRank: c.item.market_cap_rank ?? null,
    thumb: c.item.thumb,
    priceChange24hUsd: c.item.data?.price_change_percentage_24h?.usd ?? null,
  }));
}

interface RawMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  total_volume: number;
  market_cap_rank: number | null;
}

export async function getMarkets(perPage = 50): Promise<MarketCoin[]> {
  const url = `${BASE}/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=${perPage}&page=1&price_change_percentage=24h`;
  const raw = await fetchJson<RawMarket[]>(url, { headers: keyHeaders(), retries: 2 });
  return raw.map((m) => ({
    id: m.id,
    symbol: (m.symbol || "").toUpperCase(),
    name: m.name,
    priceEur: m.current_price,
    change24hPct: m.price_change_percentage_24h ?? null,
    volumeEur: m.total_volume,
    marketCapRank: m.market_cap_rank ?? null,
  }));
}

export interface GlobalSignals {
  trending: TrendingCoin[];
  markets: MarketCoin[];
  ok: boolean;
  error?: string;
}

// Fetches the two requests sequentially with a wait between them. On error returns empty + ok:false.
export async function getGlobalSignals(): Promise<GlobalSignals> {
  try {
    const trending = await getTrending();
    await sleep(2500);
    const markets = await getMarkets(50);
    return { trending, markets, ok: true };
  } catch (err) {
    return {
      trending: [],
      markets: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Returns coins that entered global trending and are not in the core list —
// to be added to that day's Google Trends query list.
export function newTrendingIds(trending: TrendingCoin[], coreIds: Set<string>): TrendingCoin[] {
  return trending.filter((t) => !coreIds.has(t.id));
}
