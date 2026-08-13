// Supabase depolama katmanı. Tüm fonksiyonlar getSupabase() null ise graceful davranır
// (yazımlar no-op, okumalar boş döner) — böylece DB yapılandırılmadan da app çalışır.

import { getSupabase } from "./supabase";
import type { MarketCode } from "@/config/markets";
import type {
  DailySnapshot,
  MarketMetric,
  Recommendation,
  MarketSummary,
  SourceHealth,
} from "./types";

// --- Yazma ---

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
  // Aynı gün tekrar çalışırsa çift kayıt olmasın: o pazar+gün önce silinir.
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

export async function saveHealth(date: string, rows: SourceHealth[]): Promise<void> {
  const db = getSupabase();
  if (!db || rows.length === 0) return;
  await db.from("source_health").delete().eq("date", date);
  await db.from("source_health").insert(rows.map((r) => ({ date, source: r.source, ok: r.ok, detail: r.detail })));
}

// --- Okuma ---

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

export async function getRecommendations(date: string, market?: MarketCode): Promise<Recommendation[]> {
  const db = getSupabase();
  if (!db) return [];
  let q = db.from("recommendations").select("*").eq("date", date);
  if (market) q = q.eq("market_code", market);
  const { data } = await q;
  return (data ?? []) as Recommendation[];
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

// Bir coin/konu için son N günün tüm pazarlardaki ilgi skorları (karşılaştırma/grafik).
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

// Bir pazar+coin için zaman serisi (detay grafiği).
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

// Dün için pazar+coin bahsedilme haritası (gün-gün değişim hesabı için).
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
