// Supabase storage layer. All functions degrade gracefully when getSupabase() is null
// (writes are no-ops, reads return empty) — so the app works without the DB configured.

import { getSupabase } from "./supabase";
import type { MarketCode } from "@/config/markets";
import type {
  DailySnapshot,
  MarketMetric,
  Recommendation,
  MarketSummary,
  SourceHealth,
  CryptoOverall,
} from "./types";

// --- Writes ---

export async function saveSnapshot(row: DailySnapshot): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("daily_snapshots").insert(row);
}

export async function saveMetrics(rows: MarketMetric[]): Promise<void> {
  const db = getSupabase();
  if (!db || rows.length === 0) return;
  await db.from("market_metrics").upsert(rows, { onConflict: "date,market_code,coin_or_topic" });
}

export async function saveRecommendations(rows: Recommendation[]): Promise<void> {
  const db = getSupabase();
  if (!db || rows.length === 0) return;
  // Avoid duplicates on a re-run for the same day: delete that market+day first.
  const date = rows[0].date;
  const market = rows[0].market_code;
  await db.from("recommendations").delete().eq("date", date).eq("market_code", market);
  await db.from("recommendations").insert(rows);
}

export async function saveSummary(row: MarketSummary): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("market_summaries").upsert(row, { onConflict: "date,market_code" });
}

export async function saveCryptoOverall(row: CryptoOverall): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("crypto_overall").upsert(row, { onConflict: "date,market_code" });
}

export async function saveHealth(date: string, rows: SourceHealth[]): Promise<void> {
  const db = getSupabase();
  if (!db || rows.length === 0) return;
  await db.from("source_health").delete().eq("date", date);
  await db.from("source_health").insert(rows.map((r) => ({ date, source: r.source, ok: r.ok, detail: r.detail })));
}

// --- Reads ---

export async function latestDate(): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("recommendations")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  return data?.[0]?.date ?? null;
}

// Most recent date that has recommendations for a specific market. The market detail page
// uses this (not the global latestDate) so a partial daily run doesn't leave a market's
// detail page blank while an older, complete analysis exists.
export async function latestDateForMarket(market: MarketCode): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("recommendations")
    .select("date")
    .eq("market_code", market)
    .order("date", { ascending: false })
    .limit(1);
  return data?.[0]?.date ?? null;
}

export async function getRecommendations(date: string, market?: MarketCode): Promise<Recommendation[]> {
  const db = getSupabase();
  if (!db) return [];
  let q = db.from("recommendations").select("*").eq("date", date);
  if (market) q = q.eq("market_code", market);
  const { data } = await q;
  return (data ?? []) as Recommendation[];
}

// Each market's most-recent recommendations, regardless of a single global date.
// Partial daily runs leave some markets on an older date; the overview should still
// show their latest available analysis instead of "No analysis data yet".
export async function getLatestRecommendationsPerMarket(): Promise<Record<string, Recommendation[]>> {
  const db = getSupabase();
  if (!db) return {};
  const { data } = await db
    .from("recommendations")
    .select("*")
    .order("date", { ascending: false })
    .limit(2000);
  const out: Record<string, Recommendation[]> = {};
  const latestDateByMarket: Record<string, string> = {};
  for (const r of (data ?? []) as Recommendation[]) {
    // first row seen for a market = its most recent date (desc order)
    if (!latestDateByMarket[r.market_code]) latestDateByMarket[r.market_code] = r.date;
    if (r.date === latestDateByMarket[r.market_code]) (out[r.market_code] ??= []).push(r);
  }
  return out;
}

// Each market's most-recent summary (see getLatestRecommendationsPerMarket).
export async function getLatestSummariesPerMarket(): Promise<Record<string, MarketSummary>> {
  const db = getSupabase();
  if (!db) return {};
  const { data } = await db
    .from("market_summaries")
    .select("*")
    .order("date", { ascending: false })
    .limit(500);
  const out: Record<string, MarketSummary> = {};
  for (const s of (data ?? []) as MarketSummary[]) {
    if (!out[s.market_code]) out[s.market_code] = s; // first = latest
  }
  return out;
}

export async function getSummaries(date: string): Promise<MarketSummary[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db.from("market_summaries").select("*").eq("date", date);
  return (data ?? []) as MarketSummary[];
}

export async function getSummary(date: string, market: MarketCode): Promise<MarketSummary | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("market_summaries")
    .select("*")
    .eq("date", date)
    .eq("market_code", market)
    .limit(1);
  return (data?.[0] as MarketSummary) ?? null;
}

export async function getMetrics(date: string, market: MarketCode): Promise<MarketMetric[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("market_metrics")
    .select("*")
    .eq("date", date)
    .eq("market_code", market);
  return (data ?? []) as MarketMetric[];
}

// Interest scores across all markets over the last N days for a coin/topic (comparison/chart).
export async function getTopicAcrossMarkets(
  topic: string,
  sinceDate: string,
): Promise<MarketMetric[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("market_metrics")
    .select("*")
    .eq("coin_or_topic", topic)
    .gte("date", sinceDate)
    .order("date", { ascending: true });
  return (data ?? []) as MarketMetric[];
}

// Time series for a market+coin (detail chart).
export async function getMetricSeries(
  market: MarketCode,
  topic: string,
  sinceDate: string,
): Promise<MarketMetric[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("market_metrics")
    .select("*")
    .eq("market_code", market)
    .eq("coin_or_topic", topic)
    .gte("date", sinceDate)
    .order("date", { ascending: true });
  return (data ?? []) as MarketMetric[];
}

// Yesterday's market+coin mention map (for day-over-day change calculation).
export async function getYesterdayMentions(
  market: MarketCode,
  yesterday: string,
): Promise<Record<string, number>> {
  const rows = await getMetrics(yesterday, market);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.coin_or_topic] = r.news_mentions;
  return map;
}

export async function getHealth(date: string): Promise<SourceHealth[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db.from("source_health").select("*").eq("date", date);
  return (data ?? []).map((r) => ({ source: r.source, ok: r.ok, detail: r.detail })) as SourceHealth[];
}

// Latest overall crypto interest per market (most recent row for each market_code).
export async function getLatestCryptoOverall(): Promise<Record<string, CryptoOverall>> {
  const db = getSupabase();
  if (!db) return {};
  const { data } = await db
    .from("crypto_overall")
    .select("*")
    .order("date", { ascending: false })
    .limit(200);
  const map: Record<string, CryptoOverall> = {};
  for (const r of (data ?? []) as CryptoOverall[]) {
    if (!map[r.market_code]) map[r.market_code] = r; // first seen = most recent (desc order)
  }
  return map;
}

export async function availableDates(limit = 30): Promise<string[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("recommendations")
    .select("date")
    .order("date", { ascending: false })
    .limit(500);
  const uniq = Array.from(new Set((data ?? []).map((r) => r.date as string)));
  return uniq.slice(0, limit);
}
