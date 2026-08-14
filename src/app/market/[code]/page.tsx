import Link from "next/link";
import { getMarket, MARKETS } from "@/config/markets";
import { FEEDS } from "@/config/feeds";
import { fetchMarketNews } from "@/lib/rss";
import { CORE_COINS } from "@/config/coins";
import { latestDateForMarket, getRecommendations, getSummary, getMetrics } from "@/lib/store";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionBadge, ConfidenceDot } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import MarketCharts from "@/components/MarketCharts";
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
  const BID_LABEL: Record<string, string> = { invest: "Raise bid", watch: "Watch", reduce: "Lower bid" };
  const keywordRows = recs.flatMap((r) =>
    (r.suggested_keywords ?? []).map((kw) => ({ keyword: kw, topic: r.topic, action: r.action, change: changeFor(kw) })),
  );
  const allKeywords = keywordRows.map((k) => k.keyword).join("\n");

  return (
    <div className="space-y-6">
      <div>
        <Link href={dateParam ? `/history?date=${dateParam}` : "/"} className="text-sm text-neutral-500 hover:underline">
          {dateParam ? "← Back to history" : "← All markets"}
        </Link>
        <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
          <span className="text-3xl">{market.flag}</span> {market.country}
        </h1>
        <p className="text-sm text-neutral-500">
          {market.language} · Trends geo: {market.trendsGeo || "global"}{date && <span> · {date}</span>}
        </p>
        {summary?.summary && <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">{summary.summary}</p>}
      </div>

      {keywordRows.length > 0 && (
        <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Suggested Keywords <span className="text-xs font-normal text-neutral-500">({keywordRows.length} keywords)</span></h2>
            <CopyButton text={allKeywords} label="Copy all" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b border-[var(--border)]">
                  <th className="py-1.5 pr-4">Keyword</th>
                  <th className="py-1.5 pr-4">Topic</th>
                  <th className="py-1.5 pr-4">Search Interest Δ</th>
                  <th className="py-1.5">Bid Action</th>
                </tr>
              </thead>
              <tbody>
                {keywordRows.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    <td className="py-1.5 pr-4 font-mono">{r.keyword}</td>
                    <td className="py-1.5 pr-4 text-neutral-500">{r.topic}</td>
                    <td className="py-1.5 pr-4"><ChangeCell change={r.change} /></td>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <ActionBadge action={r.action} />
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">{BID_LABEL[r.action]}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            Search Interest Δ: if the keyword matches a Google Trends &quot;rising query&quot;, its rise value;
            otherwise the coin/term&apos;s Trends interest change over the last 7 days. &quot;—&quot; when no Trends data.
          </p>
        </section>
      )}

      <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
        <h2 className="font-semibold mb-3">Recommendation Rationale</h2>
        {recs.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">No analysis data yet. Use &quot;Run analysis now&quot; on the home page.</p>
        ) : (
          <ul className="space-y-4">
            {recs.map((r) => (
              <li key={r.id ?? r.topic} className="border-b border-[var(--border)] pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ActionBadge action={r.action} />
                  <span className="font-medium">{r.topic}</span>
                  <ConfidenceDot confidence={r.confidence} />
                </div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{r.reasoning}</p>
                {r.suggested_keywords?.length > 0 && (
                  <p className="mt-1 text-xs text-neutral-400">{r.suggested_keywords.length} keywords — in the table above</p>
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
          <p className="text-sm text-neutral-500 italic">No metric data.</p>
        )}
      </section>

      {risingRows.length > 0 && (
        <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
          <h2 className="font-semibold mb-3">Rising Queries (Google Trends)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b border-[var(--border)]">
                  <th className="py-1.5 pr-4">Coin</th><th className="py-1.5 pr-4">Query</th><th className="py-1.5">Value</th>
                </tr>
              </thead>
              <tbody>
                {risingRows.slice(0, 40).map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    <td className="py-1.5 pr-4 text-neutral-500">{r.topic}</td>
                    <td className="py-1.5 pr-4 font-mono">{r.query}</td>
                    <td className="py-1.5 text-positive">{typeof r.value === "number" ? `+${r.value}` : r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Suspense fallback={<div className="rounded-card border border-[var(--border)] p-4 text-sm text-[var(--muted)]">Loading news…</div>}>
        <LiveNews code={market.code} feedCount={feeds.length} />
      </Suspense>
    </div>
  );
}

function ChangeCell({ change }: { change: { kind: "rising" | "interest" | "none"; value: number | string | null } }) {
  if (change.kind === "rising") {
    const v = change.value;
    const label = typeof v === "number" ? `▲ +${v}%` : `🚀 ${v}`;
    return (
      <span className="text-positive tabular-nums" title="Google Trends rising query">
        {label}
      </span>
    );
  }
  if (change.kind === "interest") {
    const n = Number(change.value);
    const cls = n > 0 ? "text-positive" : n < 0 ? "text-negative" : "text-[var(--muted)]";
    const arrow = n > 0 ? "▲" : n < 0 ? "▼" : "→";
    return (
      <span className={`${cls} tabular-nums`} title="Coin/term Trends interest change over the last 7 days">
        {arrow} {n > 0 ? "+" : ""}{n.toFixed(0)}% <span className="text-[10px] text-neutral-400">7d</span>
      </span>
    );
  }
  return <span className="text-neutral-400" title="No Trends data">—</span>;
}

async function LiveNews({ code, feedCount }: { code: import("@/config/markets").MarketCode; feedCount: number }) {
  const { items, health } = await fetchMarketNews(code);
  const failed = health.filter((h) => !h.ok);
  return (
    <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Latest Headlines</h2>
        <span className="text-xs text-neutral-500">{items.length} headlines · {feedCount} sources</span>
      </div>
      <ul className="space-y-2">
        {items.slice(0, 20).map((it, i) => (
          <li key={i} className="text-sm">
            <a href={it.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{it.title}</a>
            <span className="text-xs text-neutral-400 ml-2">{it.source}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-neutral-500 italic">No headlines found.</li>}
      </ul>
      {failed.length > 0 && (
        <p className="mt-3 text-xs text-negative">⚠️ {failed.length} sources failed.</p>
      )}
    </section>
  );
}
