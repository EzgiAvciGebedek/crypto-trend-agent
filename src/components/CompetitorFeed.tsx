import Link from "next/link";
import { crawlAllCompetitors, latestAcrossCompetitors } from "@/lib/competitors";

// Homepage summary: the 15 newest items crawled across all competitor sites.
export default async function CompetitorFeed() {
  const results = await crawlAllCompetitors();
  const latest = latestAcrossCompetitors(results, 15);
  const okCount = results.filter((r) => r.ok).length;

  return (
    <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div>
          <h2 className="font-semibold">Competitor Radar</h2>
          <p className="text-xs text-[var(--muted)]">
            Newest content across {results.length} competitor sites · {okCount} responding
          </p>
        </div>
        <Link href="/competitors" className="text-sm text-[var(--muted)] hover:text-brand-600 dark:hover:text-brand-400 hover:underline whitespace-nowrap">
          View details →
        </Link>
      </div>

      {latest.length === 0 ? (
        <p className="text-sm text-[var(--muted)] italic">
          No competitor content could be fetched right now (many of these sites are JS-rendered or block crawlers). See details for per-site status.
        </p>
      ) : (
        <ol className="space-y-2">
          {latest.map((it, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span className="text-xs text-[var(--muted)] tabular-nums w-5 shrink-0">{i + 1}.</span>
              <div className="min-w-0">
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {it.title}
                </a>
                <span className="ml-2 text-xs text-[var(--muted)] whitespace-nowrap">
                  {it.competitor}
                  {it.isoDate && <> · {new Date(it.isoDate).toLocaleDateString()}</>}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
