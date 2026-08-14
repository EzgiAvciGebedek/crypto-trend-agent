import Link from "next/link";
import { MARKETS, getMarket } from "@/config/markets";
import { availableDates, getRecommendations, getSummaries } from "@/lib/store";
import { ActionBadge, ConfidenceDot, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const dates = await availableDates(60);
  const { date: dateParam } = await searchParams;
  const date = dateParam ?? dates[0];

  const recs = date ? await getRecommendations(date) : [];
  const summaries = date ? await getSummaries(date) : [];
  const summaryByMarket = new Map(summaries.map((s) => [s.market_code, s.summary]));
  const recsByMarket = new Map<string, typeof recs>();
  for (const r of recs) {
    const arr = recsByMarket.get(r.market_code) ?? [];
    arr.push(r);
    recsByMarket.set(r.market_code, arr);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Pick a date to view that day&apos;s recommendations.</p>
      </div>

      {dates.length === 0 ? (
        <div className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-6 text-sm text-[var(--muted)] italic">
          No days recorded yet. History accumulates here as analyses run.
        </div>
      ) : (
        <>
          <form className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-[var(--muted)]">Date:</label>
            <select name="date" defaultValue={date} className="rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-sm">
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <Button size="sm" type="submit">Show</Button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MARKETS.filter((m) => recsByMarket.has(m.code) || summaryByMarket.has(m.code)).map((m) => {
              const market = getMarket(m.code)!;
              return (
                <Link
                  key={m.code}
                  href={`/market/${m.code}?date=${date}`}
                  className="block rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-card-hover"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{market.flag}</span>
                    <span className="font-semibold">{market.country}</span>
                    <span className="ml-auto text-xs text-[var(--muted)]">View details →</span>
                  </div>
                  {summaryByMarket.get(m.code) && <p className="text-xs text-[var(--muted)] mb-2">{summaryByMarket.get(m.code)}</p>}
                  <ul className="space-y-1.5">
                    {(recsByMarket.get(m.code) ?? []).map((r) => (
                      <li key={r.id ?? r.topic} className="flex items-center gap-1.5 text-xs">
                        <ActionBadge action={r.action} />
                        <span className="truncate">{r.topic}</span>
                        <ConfidenceDot confidence={r.confidence} />
                      </li>
                    ))}
                  </ul>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
