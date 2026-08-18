import Link from "next/link";
import { crawlAllCompetitors, type CompetitorResult } from "@/lib/competitors";
import { getLatestCompetitorContent } from "@/lib/store";

export const dynamic = "force-dynamic";

// Reads the scheduled cron's persisted results first (see /api/cron/competitors); falls
// back to a live crawl if the DB has nothing yet (schema not migrated, or first run pending).
export default async function CompetitorsPage() {
  let results = await getLatestCompetitorContent();
  if (results.length === 0) results = await crawlAllCompetitors();
  const okCount = results.filter((r) => r.ok).length;
  const totalItems = results.reduce((n, r) => n + r.items.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="text-sm text-[var(--muted)] hover:underline">← Markets</Link>
        <h1 className="text-2xl font-bold mt-2">Competitor Radar</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Latest content and new blog posts crawled from each competitor.
          {" "}
          <span className="text-[var(--muted)]">{okCount}/{results.length} sites responding · {totalItems} items</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {results.map((r) => (
          <CompetitorCard key={r.id} r={r} />
        ))}
      </div>

      <p className="text-[11px] text-[var(--muted)]">
        Content is crawled live (30-min cache). Sites without a public feed or that render fully in the browser
        may return no items — that&apos;s shown per card, not an error on our side.
      </p>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// One "adaptive card" per competitor: header and the blog/content list.
function CompetitorCard({ r }: { r: CompetitorResult }) {
  return (
    <div className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <a href={r.homepage} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
          {r.name}
        </a>
        <span
          className={`text-[10px] rounded px-1.5 py-0.5 font-medium ${
            r.ok ? "bg-positive-mild text-positive" : "bg-[var(--surface-2)] text-[var(--muted)]"
          }`}
        >
          {r.ok ? `${r.items.length} items` : "no content"}
        </span>
      </div>
      {r.sourceUsed && (
        <p className="mt-0.5 text-[11px] text-[var(--muted)] truncate">
          via {hostOf(r.sourceUsed)}
          {r.via && <span className="text-brand-500"> · rendered ({r.via})</span>}
          {r.langs && r.langs.length > 1 && (
            <span> · {r.langs.length} languages ({r.langs.join(", ").toUpperCase()})</span>
          )}
        </p>
      )}

      <div className="mt-3 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-[var(--muted)] mb-1">New content & blogs</p>
        {r.items.length === 0 ? (
          <p className="text-sm text-[var(--muted)] italic">
            {r.error?.includes("no items found")
              ? "No public feed found (site likely renders in-browser)."
              : `Could not fetch: ${r.error}`}
          </p>
        ) : (
          <ul className="space-y-2">
            {r.items.map((it, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-baseline gap-1.5">
                  {it.lang && it.lang !== "en" && (
                    <span className="shrink-0 rounded bg-[var(--surface-2)] px-1 py-0.5 text-[9px] font-semibold uppercase text-[var(--muted)]">
                      {it.lang}
                    </span>
                  )}
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {it.title}
                  </a>
                </div>
                <div className="text-[11px] text-[var(--muted)] truncate">
                  {it.isoDate && <span className="mr-1">{new Date(it.isoDate).toLocaleDateString()} ·</span>}
                  {hostOf(it.url)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
