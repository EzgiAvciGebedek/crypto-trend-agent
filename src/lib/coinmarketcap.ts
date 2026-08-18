// CoinMarketCap integration — a second, independent price/market signal alongside
// CoinGecko. CMC's free "Basic" plan does NOT include the /trending/* endpoints (they
// 403 with "subscription plan doesn't support this endpoint") — verified live. So this
// uses the endpoints Basic actually has:
//   - /cryptocurrency/listings/latest (top N by market cap, with 24h % change) → we derive
//     gainers/losers from this ourselves, restricted to the top-100 by market cap so a
//     random illiquid microcap can't dominate the "movers" list.
//   - /global-metrics/quotes/latest → total market cap 24h change + BTC dominance, a market
//     "regime" signal nothing else in the pipeline provides.
// Without a key this module reports ok:false and the pipeline degrades gracefully, same as
// every other optional source. Free key: https://coinmarketcap.com/api/

import { fetchJson } from "./http";

const BASE = "https://pro-api.coinmarketcap.com/v1";

export function isCmcConfigured(): boolean {
  return Boolean(process.env.COINMARKETCAP_API_KEY);
}

function headers(): Record<string, string> {
  const key = process.env.COINMARKETCAP_API_KEY;
  return key ? { "X-CMC_PRO_API_KEY": key } : {};
}

export interface CmcCoin {
  id: number;
  symbol: string;
  name: string;
  changePct24h: number | null;
}

interface RawListing {
  id: number;
  name: string;
  symbol: string;
  quote?: { USD?: { percent_change_24h?: number | null } };
}
interface RawListingsResponse {
  data?: RawListing[];
}

async function getListings(limit = 100): Promise<CmcCoin[]> {
  const raw = await fetchJson<RawListingsResponse>(
    `${BASE}/cryptocurrency/listings/latest?limit=${limit}&sort=market_cap&sort_dir=desc`,
    { headers: headers(), retries: 1 },
  );
  return (raw.data ?? []).map((c) => ({
    id: c.id,
    symbol: (c.symbol || "").toUpperCase(),
    name: c.name,
    changePct24h: c.quote?.USD?.percent_change_24h ?? null,
  }));
}

interface RawGlobalMetrics {
  data?: {
    btc_dominance?: number;
    btc_dominance_24h_percentage_change?: number;
    quote?: { USD?: { total_market_cap?: number; total_market_cap_yesterday_percentage_change?: number } };
  };
}

interface GlobalMarket {
  totalMarketCapUsd: number | null;
  marketCapChangePct24h: number | null;
  btcDominance: number | null;
  btcDominanceChangePct24h: number | null;
}

async function getGlobalMarket(): Promise<GlobalMarket> {
  const raw = await fetchJson<RawGlobalMetrics>(`${BASE}/global-metrics/quotes/latest`, {
    headers: headers(),
    retries: 1,
  });
  const d = raw.data;
  return {
    totalMarketCapUsd: d?.quote?.USD?.total_market_cap ?? null,
    marketCapChangePct24h: d?.quote?.USD?.total_market_cap_yesterday_percentage_change ?? null,
    btcDominance: d?.btc_dominance ?? null,
    btcDominanceChangePct24h: d?.btc_dominance_24h_percentage_change ?? null,
  };
}

export interface CmcSignals {
  gainers: CmcCoin[]; // top 24h gainers among the top 100 by market cap
  losers: CmcCoin[]; // top 24h losers among the top 100 by market cap
  global: GlobalMarket;
  ok: boolean;
  error?: string;
}

const EMPTY_GLOBAL: GlobalMarket = { totalMarketCapUsd: null, marketCapChangePct24h: null, btcDominance: null, btcDominanceChangePct24h: null };

export async function getCmcSignals(): Promise<CmcSignals> {
  if (!isCmcConfigured()) {
    return { gainers: [], losers: [], global: EMPTY_GLOBAL, ok: false, error: "COINMARKETCAP_API_KEY not set" };
  }
  try {
    const [listings, global] = await Promise.all([getListings(100), getGlobalMarket()]);
    const sorted = listings
      .filter((c) => c.changePct24h !== null)
      .sort((a, b) => (b.changePct24h as number) - (a.changePct24h as number));
    const gainers = sorted.slice(0, 8);
    const losers = sorted.slice(-8).reverse();
    return { gainers, losers, global, ok: true };
  } catch (err) {
    return { gainers: [], losers: [], global: EMPTY_GLOBAL, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Formats a compact, single-line market-regime summary for the LLM prompt.
export function formatGlobalMarket(g: GlobalMarket): string {
  if (g.totalMarketCapUsd === null) return "unavailable";
  const capT = (g.totalMarketCapUsd / 1e12).toFixed(2);
  const capChange = g.marketCapChangePct24h === null ? "?" : `${g.marketCapChangePct24h > 0 ? "+" : ""}${g.marketCapChangePct24h.toFixed(1)}%`;
  const dom = g.btcDominance === null ? "?" : g.btcDominance.toFixed(1);
  const domChange = g.btcDominanceChangePct24h === null ? "" : ` (24h ${g.btcDominanceChangePct24h > 0 ? "+" : ""}${g.btcDominanceChangePct24h.toFixed(1)}%)`;
  return `total market cap $${capT}T (24h ${capChange}), BTC dominance ${dom}%${domChange}`;
}
