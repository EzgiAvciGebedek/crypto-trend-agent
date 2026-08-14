import { MARKETS } from "@/config/markets";
import { CORE_COINS } from "@/config/coins";
import { latestDate, getTopicAcrossMarkets } from "@/lib/store";
import CompareChart from "@/components/CompareChart";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic: topicParam } = await searchParams;
  const topic = topicParam ?? "Bitcoin";
  const date = await latestDate();

  // Fetch the last 7 days of metrics, take the most recent interest/mentions per market.
  // eslint-disable-next-line react-hooks/purity -- server component; date arithmetic is intended
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const rows = date ? await getTopicAcrossMarkets(topic, since) : [];

  const latestByMarket = new Map<string, { interest: number | null; mentions: number; date: string }>();
  for (const r of rows) {
    const prev = latestByMarket.get(r.market_code);
    if (!prev || r.date > prev.date) {
      latestByMarket.set(r.market_code, {
        interest: r.interest_score === null ? null : Number(r.interest_score),
        mentions: r.news_mentions,
        date: r.date,
      });
    }
  }

  const data = MARKETS.map((m) => {
    const v = latestByMarket.get(m.code);
    return { market: m.code, flag: m.flag, interest: v?.interest ?? null, mentions: v?.mentions ?? 0 };
  });

  const hasData = data.some((d) => d.interest !== null || d.mentions > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Market Comparison</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Pick a coin/topic → see interest side by side across 8 markets. Tall bar = strong interest; low/empty = not started yet (an &quot;early entry&quot; opportunity).
        </p>
      </div>

      <form className="flex items-center gap-2 flex-wrap">
        <label className="text-sm text-[var(--muted)]">Topic:</label>
        <select name="topic" defaultValue={topic} className="rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-sm">
          {CORE_COINS.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <Button size="sm" type="submit">Show</Button>
      </form>

      <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
        <h2 className="font-semibold mb-3">{topic} — Search Interest across 8 Markets</h2>
        {hasData ? (
          <CompareChart data={data} />
        ) : (
          <p className="text-sm text-[var(--muted)] italic">
            No data for this topic yet. Since Trends is collected via market rotation, a coin fills across all markets within a few days.
          </p>
        )}
      </section>
    </div>
  );
}
