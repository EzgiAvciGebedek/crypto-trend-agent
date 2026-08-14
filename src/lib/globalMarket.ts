// Merges CoinGecko + CoinMarketCap into single, deduplicated "global trending" and
// "top movers" signals — rather than presenting them as two parallel, source-specific
// lines. A coin surfaced by BOTH sources is flagged as cross-source-confirmed, which is a
// meaningfully stronger signal than either source alone.

import type { GlobalSignals } from "./coingecko";
import type { CmcSignals } from "./coinmarketcap";

export interface MergedTrending {
  name: string;
  symbol: string;
  marketCapRank: number | null;
  changePct24h: number | null;
  confirmed: boolean; // present in both CoinGecko trending AND CMC's top movers
}

export interface MergedMover {
  name: string;
  symbol: string;
  changePct24h: number;
  confirmed: boolean; // present in both sources' mover data
}

// Coins are matched across sources by symbol (falls back to name) — CoinGecko and CMC use
// different internal ids, but symbols are a reliable-enough join key at this scale.
function key(name: string, symbol: string): string {
  return (symbol || name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface CombinedGlobalSignals {
  trending: MergedTrending[];
  gainers: MergedMover[];
  losers: MergedMover[];
}

export function combineGlobalSignals(cg: GlobalSignals, cmc: CmcSignals): CombinedGlobalSignals {
  // --- Trending: CoinGecko's real trending-search list is the only true "trending" data
  // available (CMC's trending endpoints require a paid plan); CMC's movers cross-check it.
  const cmcMoverKeys = new Set([...cmc.gainers, ...cmc.losers].map((c) => key(c.name, c.symbol)));
  const trending: MergedTrending[] = cg.trending.slice(0, 12).map((t) => ({
    name: t.name,
    symbol: t.symbol,
    marketCapRank: t.marketCapRank,
    changePct24h: t.priceChange24hUsd,
    confirmed: cmcMoverKeys.has(key(t.name, t.symbol)),
  }));

  // --- Movers: CoinGecko's top-50-by-market-cap + CMC's top-100-by-market-cap, merged by
  // symbol. A coin in both lists gets its change % averaged and is flagged as confirmed.
  const cgMovers = cg.markets
    .filter((m) => m.change24hPct !== null)
    .map((m) => ({ name: m.name, symbol: m.symbol, changePct24h: m.change24hPct as number }));
  const cmcMovers = [...cmc.gainers, ...cmc.losers]
    .filter((c) => c.changePct24h !== null)
    .map((c) => ({ name: c.name, symbol: c.symbol, changePct24h: c.changePct24h as number }));

  const merged = new Map<string, { name: string; symbol: string; sum: number; n: number }>();
  for (const c of [...cgMovers, ...cmcMovers]) {
    const k = key(c.name, c.symbol);
    const e = merged.get(k);
    if (e) {
      e.sum += c.changePct24h;
      e.n += 1;
    } else {
      merged.set(k, { name: c.name, symbol: c.symbol, sum: c.changePct24h, n: 1 });
    }
  }
  const all: MergedMover[] = [...merged.values()].map((e) => ({
    name: e.name,
    symbol: e.symbol,
    changePct24h: e.sum / e.n,
    confirmed: e.n > 1,
  }));

  const gainers = all.filter((m) => m.changePct24h > 0).sort((a, b) => b.changePct24h - a.changePct24h).slice(0, 8);
  const losers = all.filter((m) => m.changePct24h < 0).sort((a, b) => a.changePct24h - b.changePct24h).slice(0, 8);

  return { trending, gainers, losers };
}

// Formats the merged lists into the compact strings the LLM prompt uses.
export function formatTrending(list: MergedTrending[]): string[] {
  return list.map((t) => (t.confirmed ? `${t.name} (confirmed: CoinGecko+CMC)` : t.name));
}

export function formatMovers(gainers: MergedMover[], losers: MergedMover[]): string[] {
  const fmt = (m: MergedMover) =>
    `${m.name} ${m.changePct24h > 0 ? "+" : ""}${m.changePct24h.toFixed(0)}%${m.confirmed ? " (confirmed)" : ""}`;
  return [...gainers.map(fmt), ...losers.map(fmt)];
}
