"use client";
import { useMemo, useState } from "react";

export interface RisingRow {
  topic: string;
  query: string;
  value: number | string | null;
}

export default function RisingQueriesTable({ rows }: { rows: RisingRow[] }) {
  const [q, setQ] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [grouped, setGrouped] = useState(false);

  const topics = useMemo(() => [...new Set(rows.map((r) => r.topic))], [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (topicFilter === "all" || r.topic === topicFilter) &&
        (!needle || r.query.toLowerCase().includes(needle) || r.topic.toLowerCase().includes(needle)),
    );
  }, [rows, q, topicFilter]);

  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<string, RisingRow[]>();
    for (const r of filtered) {
      const arr = map.get(r.topic) ?? [];
      arr.push(r);
      map.set(r.topic, arr);
    }
    return [...map.entries()];
  }, [filtered, grouped]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="font-semibold">
          Rising Queries (Google Trends){" "}
          <span className="text-xs font-normal text-[var(--muted)]">
            ({filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ""})
          </span>
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search query or coin…"
          className="rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs w-48"
        />
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          className="rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs"
        >
          <option value="all">All coins</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          onClick={() => setGrouped((g) => !g)}
          aria-pressed={grouped}
          className={`rounded-[var(--radius-control)] border px-2 py-1 text-xs ${
            grouped
              ? "border-brand-500 bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)]"
          }`}
        >
          Group by coin
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
              {!grouped && <th className="py-1.5 pr-4">Coin</th>}
              <th className="py-1.5 pr-4">Query</th>
              <th className="py-1.5">Value</th>
            </tr>
          </thead>
          {grouped && groups ? (
            groups.map(([topic, groupRows]) => (
              <tbody key={topic}>
                <tr>
                  <td colSpan={2} className="pt-3 pb-1 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                    {topic} <span className="font-normal normal-case">({groupRows.length})</span>
                  </td>
                </tr>
                {groupRows.slice(0, 40).map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    <td className="py-1.5 pr-4 font-mono">{r.query}</td>
                    <td className="py-1.5 text-positive">{typeof r.value === "number" ? `+${r.value}` : r.value}</td>
                  </tr>
                ))}
              </tbody>
            ))
          ) : (
            <tbody>
              {filtered.slice(0, 40).map((r, i) => (
                <tr key={i} className="border-b border-[var(--border)]">
                  <td className="py-1.5 pr-4 text-[var(--muted)]">{r.topic}</td>
                  <td className="py-1.5 pr-4 font-mono">{r.query}</td>
                  <td className="py-1.5 text-positive">{typeof r.value === "number" ? `+${r.value}` : r.value}</td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
        {filtered.length === 0 && (
          <p className="py-4 text-sm text-[var(--muted)] italic">No rising queries match the current filters.</p>
        )}
      </div>
    </div>
  );
}
