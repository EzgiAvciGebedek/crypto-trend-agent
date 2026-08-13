import { Suspense } from "react";
import { MARKETS } from "@/config/markets";
import { isSupabaseConfigured } from "@/lib/supabase";
import { latestDate, getSummaries, getRecommendations } from "@/lib/store";
import GlobalSignals from "@/components/GlobalSignals";
import SourceHealthBar from "@/components/SourceHealth";
import RunAnalysisButton from "@/components/RunAnalysisButton";
import { ActionBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const dbReady = isSupabaseConfigured();
  const date = dbReady ? await latestDate() : null;
  const summaries = date ? await getSummaries(date) : [];
  const recs = date ? await getRecommendations(date) : [];

  const summaryByMarket = new Map(summaries.map((s) => [s.market_code, s.summary]));
  const recsByMarket = new Map<string, typeof recs>();
  for (const r of recs) {
    const arr = recsByMarket.get(r.market_code) ?? [];
    arr.push(r);
    recsByMarket.set(r.market_code, arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Markets Overview</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Crypto search interest, rising queries and keyword investment recommendations per market.
            {date && <span className="ml-1">Latest analysis: <span className="font-medium">{date}</span></span>}
          </p>
        </div>
        <RunAnalysisButton />
      </div>

      {!dbReady && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ Supabase is not configured. Add <code>SUPABASE_URL</code> and{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> to <code>.env.local</code> and run <code>supabase/schema.sql</code>.
        </div>
      )}

      {date && <SourceHealthBar date={date} />}

      <Suspense fallback={<div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 text-sm text-neutral-500">Loading global signals…</div>}>
        <GlobalSignals />
      </Suspense>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MARKETS.map((m) => {
          const summary = summaryByMarket.get(m.code);
          const top = (recsByMarket.get(m.code) ?? [])
            .sort((a, b) => rank(b) - rank(a))
            .slice(0, 3);
          return (
            <a
              key={m.code}
              href={`/market/${m.code}`}
              className="group rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors flex flex-col"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{m.flag}</span>
                <div>
                  <div className="font-semibold leading-tight">{m.country}</div>
                  <div className="text-xs text-neutral-500">{m.language} · {m.code}</div>
                </div>
              </div>
              {summary ? (
                <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-4">{summary}</p>
              ) : (
                <p className="mt-3 text-sm text-neutral-500 italic">No analysis data yet.</p>
              )}
              {top.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {top.map((r) => (
                    <li key={r.id ?? `${r.topic}`} className="flex items-center gap-1.5 text-xs">
                      <ActionBadge action={r.action} />
                      <span className="truncate">{r.topic}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-3 text-xs text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300">View details →</div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function rank(r: { action: string; confidence: string }): number {
  const a = r.action === "invest" ? 3 : r.action === "reduce" ? 2 : 1;
  const c = r.confidence === "high" ? 3 : r.confidence === "medium" ? 2 : 1;
  return a * 10 + c;
}
