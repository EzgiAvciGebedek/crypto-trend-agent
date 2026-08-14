import Link from "next/link";
import { crawlAllCompetitors, latestAcrossCompetitors } from "@/lib/competitors";
import CompetitorFeedList from "./CompetitorFeedList";

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
        <CompetitorFeedList items={latest} />
      )}
    </section>
  );
}
