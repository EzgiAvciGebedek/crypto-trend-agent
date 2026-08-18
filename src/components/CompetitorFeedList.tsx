"use client";
import { useMemo, useState } from "react";
import type { AggregatedItem } from "@/lib/competitors";

// Items arrive already interleaved round-robin across competitors, newest-known-date first
// within each round (see latestAcrossCompetitors); this only filters.
export default function CompetitorFeedList({ items }: { items: AggregatedItem[] }) {
  const [q, setQ] = useState("");
  const [competitor, setCompetitor] = useState("all");

  const competitors = useMemo(() => [...new Set(items.map((i) => i.competitor))].sort(), [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(
      (it) =>
        (competitor === "all" || it.competitor === competitor) &&
        (!needle || it.title.toLowerCase().includes(needle) || it.competitor.toLowerCase().includes(needle)),
    );
  }, [items, q, competitor]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or competitor…"
          className="rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs w-52"
        />
        <select
          value={competitor}
          onChange={(e) => setCompetitor(e.target.value)}
          className="rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs"
        >
          <option value="all">All competitors</option>
          {competitors.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-[11px] text-[var(--muted)]">newest per competitor, all sites represented</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--muted)] italic">No items match the current filters.</p>
      ) : (
        <ol className="space-y-2">
          {filtered.map((it, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span className="text-xs text-[var(--muted)] tabular-nums w-5 shrink-0">{i + 1}.</span>
              <div className="min-w-0">
                {it.lang && it.lang !== "en" && (
                  <span className="mr-1.5 rounded bg-[var(--surface-2)] px-1 py-0.5 text-[9px] font-semibold uppercase text-[var(--muted)]">
                    {it.lang}
                  </span>
                )}
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
    </div>
  );
}
