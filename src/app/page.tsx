import { Suspense } from "react";
import { MARKETS } from "@/config/markets";
import { isSupabaseConfigured } from "@/lib/supabase";
import { latestDate, getLatestSummariesPerMarket, getLatestRecommendationsPerMarket, getLatestCryptoOverall } from "@/lib/store";
import GlobalSignals from "@/components/GlobalSignals";
import CompetitorFeed from "@/components/CompetitorFeed";
import SourceHealthBar from "@/components/SourceHealth";
import RunAnalysisButton from "@/components/RunAnalysisButton";
import OverallChange from "@/components/OverallChange";
import { ActionBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const dbReady = isSupabaseConfigured();
  const date = dbReady ? await latestDate() : null;
  // Each market shows its OWN latest analysis, so partial daily runs don't blank out
  // markets that were processed on an earlier date.
  const summaryByMarket = dbReady ? await getLatestSummariesPerMarket() : {};
  const recsByMarket = dbReady ? await getLatestRecommendationsPerMarket() : {};
  const overall = dbReady ? await getLatestCryptoOverall() : {};

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Markets Overview</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Crypto search interest, rising queries and keyword investment recommendations per market.
            {date && <span className="ml-1">Latest analysis: <span className="font-medium text-[var(--foreground)]">{date}</span></span>}
          </p>
        </div>
        <RunAnalysisButton />
      </div>

      {!dbReady && (
        <div className="rounded-[var(--radius-control)] border border-warning/30 bg-warning-mild text-warning px-4 py-3 text-sm">
          ⚠️ Supabase is not configured. Add <code>SUPABASE_URL</code> and{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> to <code>.env.local</code> and run <code>supabase/schema.sql</code>.
        </div>
      )}

      {date && <SourceHealthBar date={date} />}

      <Suspense fallback={<div className="rounded-card border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">Loading global signals…</div>}>
        <GlobalSignals />
      </Suspense>

      <Suspense fallback={<div className="rounded-card border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">Crawling competitor sites…</div>}>
        <CompetitorFeed />
      </Suspense>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MARKETS.map((m) => {
          const summaryRow = summaryByMarket[m.code];
          const summary = summaryRow?.summary;
          const marketRecs = recsByMarket[m.code] ?? [];
          const top = [...marketRecs].sort((a, b) => rank(b) - rank(a)).slice(0, 3);
          const analysisDate = summaryRow?.date ?? marketRecs[0]?.date;
          return (
            <a
              key={m.code}
              href={`/market/${m.code}`}
              className="group flex flex-col rounded-card border border-[var(--border)] bg-[var(--surface)] p-4 shadow-card transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-card-hover"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{m.flag}</span>
                <div>
                  <div className="font-semibold leading-tight">{m.country}</div>
                  <div className="text-xs text-[var(--muted)]">{m.language} · {m.code}</div>
                </div>
              </div>
              <OverallChange data={overall[m.code]} />
              {summary ? (
                <div className="mt-3 space-y-1">
                  {analysisDate && date && analysisDate !== date && (
                    <p className="text-[11px] text-warning">Analysis from {analysisDate}</p>
                  )}
                  <p className="text-xs text-[var(--muted)] line-clamp-4">{summary}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)] italic">No analysis data yet.</p>
              )}
              {top.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {top.map((r) => (
                    <li key={r.id ?? `${r.topic}`} className="flex items-center gap-1.5 text-xs min-w-0">
                      <ActionBadge action={r.action} />
                      <span className="min-w-0 flex-1 truncate">{r.topic}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-3 text-xs text-[var(--muted)] group-hover:text-brand-600 dark:group-hover:text-brand-400">View details →</div>
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
