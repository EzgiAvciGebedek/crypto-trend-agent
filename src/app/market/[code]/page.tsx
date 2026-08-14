import Link from "next/link";
import { getMarket, MARKETS } from "@/config/markets";
import { FEEDS } from "@/config/feeds";
import { fetchMarketNews } from "@/lib/rss";
import { CORE_COINS } from "@/config/coins";
import { latestDateForMarket, getRecommendations, getSummary, getMetrics } from "@/lib/store";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionBadge, ConfidenceDot } from "@/components/ui";
import MarketCharts from "@/components/MarketCharts";
import KeywordsTable from "@/components/KeywordsTable";
import RisingQueriesTable from "@/components/RisingQueriesTable";
import type { RisingQuery } from "@/lib/types";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return MARKETS.map((m) => ({ code: m.code }));
}

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { code } = await params;
  const { date: dateParam } = await searchParams;
  const market = getMarket(code);
  if (!market) notFound();

  const feeds = FEEDS[market.code] ?? [];
  // Default to THIS market's latest analysis date (not the global latest), so partial
  // daily runs don't blank out a market's detail page.
  const date = dateParam ?? (await latestDateForMarket(market.code));
  const recs = date ? await getRecommendations(date, market.code) : [];
  const summary = date ? await getSummary(date, market.code) : null;
  const metrics = date ? await getMetrics(date, market.code) : [];

  const chartData = metrics.map((m) => ({
    topic: m.coin_or_topic,
    interest: m.interest_score === null ? null : Number(m.interest_score),
    mentions: m.news_mentions,
  }));

  // Rising queries: flatten rising_queries from the metrics
  const risingRows: Array<{ topic: string; query: string; value: RisingQuery["value"] }> = [];
  for (const m of metrics) {
    for (const rq of (m.rising_queries as RisingQuery[]) ?? []) {
      risingRows.push({ topic: m.coin_or_topic, query: rq.query, value: rq.value });
    }
  }

  // --- Keyword → search volume/interest change mapping ---
  // (a) if the keyword matches a rising query, the Trends rise value (keyword-specific)
  // (b) otherwise the 7-day Trends interest change % of the coin the keyword belongs to
  const risingByQuery = new Map<string, number | string>();
  const interestByCoin = new Map<string, { score: number | null; change: number | null }>();
  for (const m of metrics) {
    interestByCoin.set(m.coin_or_topic, {
      score: m.interest_score === null ? null : Number(m.interest_score),
      change: m.interest_change_pct === null ? null : Number(m.interest_change_pct),
    });
    for (const rq of (m.rising_queries as RisingQuery[]) ?? []) {
      risingByQuery.set(rq.query.toLowerCase(), rq.value);
    }
  }
  // find the coin name from a coin alias inside the keyword
  const aliasToCoin = new Map<string, string>();
  for (const c of CORE_COINS) for (const a of [c.name.toLowerCase(), ...c.aliases]) aliasToCoin.set(a, c.name);
  function coinOfKeyword(kw: string): string | null {
    for (const t of kw.toLowerCase().split(/\s+/)) if (aliasToCoin.has(t)) return aliasToCoin.get(t)!;
    return null;
  }
  type Change = { kind: "rising" | "interest" | "none"; value: number | string | null };
  function changeFor(kw: string): Change {
    const low = kw.toLowerCase();
    // 1) exact match against a rising query (keyword-specific, strongest)
    const rv = risingByQuery.get(low);
    if (rv !== undefined) return { kind: "rising", value: rv };
    // 2) coin alias → the coin's interest change
    const coin = coinOfKeyword(kw);
    const iot = coin ? interestByCoin.get(coin) : undefined;
    if (iot && iot.change !== null) return { kind: "interest", value: iot.change };
    // 3) generic/competitor term: does a metric topic (e.g. "Bitvavo", "crypto kopen") appear in the keyword
    let best: { term: string; change: number } | null = null;
    for (const [term, m] of interestByCoin) {
      if (m.change === null) continue;
      if (low.includes(term.toLowerCase()) && (!best || term.length > best.term.length)) {
        best = { term, change: m.change };
      }
    }
    if (best) return { kind: "interest", value: best.change };
    return { kind: "none", value: null };
  }

  // Flatten every recommendation's keywords into one table with its bid action.
  const keywordRows = recs.flatMap((r) =>
    (r.suggested_keywords ?? []).map((kw) => ({ keyword: kw, topic: r.topic, action: r.action, change: changeFor(kw) })),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href={dateParam ? `/history?date=${dateParam}` : "/"} className="text-sm text-[var(--muted)] hover:underline">
          {dateParam ? "← Back to history" : "← All markets"}
        </Link>
        <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
          <span className="text-3xl">{market.flag}</span> {market.country}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {market.language} · Trends geo: {market.trendsGeo || "global"}{date && <span> · {date}</span>}
        </p>
        {summary?.summary && <p className="mt-3 text-sm text-[var(--foreground)]/80">{summary.summary}</p>}
      </div>

      {keywordRows.length > 0 && (
        <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
          <KeywordsTable rows={keywordRows} />
        </section>
      )}

      <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
        <h2 className="font-semibold mb-3">Recommendation Rationale</h2>
        {recs.length === 0 ? (
          <p className="text-sm text-[var(--muted)] italic">No analysis data yet. Use &quot;Run analysis now&quot; on the home page.</p>
        ) : (
          <ul className="space-y-4">
            {recs.map((r) => (
              <li key={r.id ?? r.topic} className="border-b border-[var(--border)] pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ActionBadge action={r.action} />
                  <span className="font-medium">{r.topic}</span>
                  <ConfidenceDot confidence={r.confidence} />
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{r.reasoning}</p>
                {r.suggested_keywords?.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--muted)]">{r.suggested_keywords.length} keywords — in the table above</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
        <h2 className="font-semibold mb-4">Signals</h2>
        {chartData.length > 0 ? (
          <MarketCharts data={chartData} />
        ) : (
          <p className="text-sm text-[var(--muted)] italic">No metric data.</p>
        )}
      </section>

      {risingRows.length > 0 && (
        <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
          <RisingQueriesTable rows={risingRows} />
        </section>
      )}

      <Suspense fallback={<div className="rounded-card border border-[var(--border)] p-4 text-sm text-[var(--muted)]">Loading news…</div>}>
        <LiveNews code={market.code} feedCount={feeds.length} />
      </Suspense>
    </div>
  );
}

async function LiveNews({ code, feedCount }: { code: import("@/config/markets").MarketCode; feedCount: number }) {
  const { items, health } = await fetchMarketNews(code);
  const failed = health.filter((h) => !h.ok);
  return (
    <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Latest Headlines</h2>
        <span className="text-xs text-[var(--muted)]">{items.length} headlines · {feedCount} sources</span>
      </div>
      <ul className="space-y-2">
        {items.slice(0, 20).map((it, i) => (
          <li key={i} className="text-sm">
            <a href={it.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{it.title}</a>
            <span className="text-xs text-[var(--muted)] ml-2">{it.source}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-[var(--muted)] italic">No headlines found.</li>}
      </ul>
      {failed.length > 0 && (
        <p className="mt-3 text-xs text-negative">⚠️ {failed.length} sources failed.</p>
      )}
    </section>
  );
}
