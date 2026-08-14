"use client";
import { useMemo, useState } from "react";
import { ActionBadge } from "./ui";
import CopyButton from "./CopyButton";
import type { Action } from "@/lib/types";

export interface ChangeInfo {
  kind: "rising" | "interest" | "none";
  value: number | string | null;
}

export interface KeywordRow {
  keyword: string;
  topic: string;
  action: Action;
  change: ChangeInfo;
}

const BID_LABEL: Record<Action, string> = { invest: "Raise bid", watch: "Watch", reduce: "Lower bid" };

function ChangeCell({ change }: { change: ChangeInfo }) {
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
        {arrow} {n > 0 ? "+" : ""}{n.toFixed(0)}% <span className="text-[10px] text-[var(--muted)]">7d</span>
      </span>
    );
  }
  return <span className="text-[var(--muted)]" title="No Trends data">—</span>;
}

// Numeric proxy used only for sorting (display keeps its original formatted label).
function changeMagnitude(c: ChangeInfo): number {
  if (typeof c.value === "number") return c.value;
  if (c.kind === "rising") return Infinity; // a "🚀 Breakout" label beats any numeric %
  return -Infinity;
}

type SortDir = "none" | "desc" | "asc";

export default function KeywordsTable({ rows }: { rows: KeywordRow[] }) {
  const [q, setQ] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState<"all" | Action>("all");
  const [grouped, setGrouped] = useState(true);
  const [sortDir, setSortDir] = useState<SortDir>("none");

  const topics = useMemo(() => [...new Set(rows.map((r) => r.topic))], [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter(
      (r) =>
        (topicFilter === "all" || r.topic === topicFilter) &&
        (actionFilter === "all" || r.action === actionFilter) &&
        (!needle || r.keyword.toLowerCase().includes(needle) || r.topic.toLowerCase().includes(needle)),
    );
    if (sortDir !== "none") {
      out = [...out].sort((a, b) => {
        const d = changeMagnitude(b.change) - changeMagnitude(a.change);
        return sortDir === "desc" ? d : -d;
      });
    }
    return out;
  }, [rows, q, topicFilter, actionFilter, sortDir]);

  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<string, KeywordRow[]>();
    for (const r of filtered) {
      const arr = map.get(r.topic) ?? [];
      arr.push(r);
      map.set(r.topic, arr);
    }
    return [...map.entries()]; // preserves first-seen topic order
  }, [filtered, grouped]);

  const copyText = filtered.map((r) => r.keyword).join("\n");

  function cycleSort() {
    setSortDir((d) => (d === "none" ? "desc" : d === "desc" ? "asc" : "none"));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="font-semibold">
          Suggested Keywords{" "}
          <span className="text-xs font-normal text-[var(--muted)]">
            ({filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ""} keywords)
          </span>
        </h2>
        <CopyButton text={copyText} label={filtered.length !== rows.length ? "Copy filtered" : "Copy all"} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search keyword or topic…"
          className="rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs w-48"
        />
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          className="rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs"
        >
          <option value="all">All topics</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as "all" | Action)}
          className="rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs"
        >
          <option value="all">All actions</option>
          <option value="invest">Invest</option>
          <option value="watch">Watch</option>
          <option value="reduce">Reduce</option>
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
          Group by topic
        </button>
        {(q || topicFilter !== "all" || actionFilter !== "all") && (
          <button
            onClick={() => { setQ(""); setTopicFilter("all"); setActionFilter("all"); }}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-1.5 pr-4">Keyword</th>
              {!grouped && <th className="py-1.5 pr-4">Topic</th>}
              <th className="py-1.5 pr-4 select-none">
                <button onClick={cycleSort} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  Search Interest Δ
                  {sortDir !== "none" && <span>{sortDir === "desc" ? "▼" : "▲"}</span>}
                </button>
              </th>
              <th className="py-1.5">Bid Action</th>
            </tr>
          </thead>
          {grouped && groups ? (
            groups.map(([topic, groupRows]) => (
              <tbody key={topic}>
                <tr>
                  <td colSpan={3} className="pt-3 pb-1 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                    {topic} <span className="font-normal normal-case">({groupRows.length})</span>
                  </td>
                </tr>
                {groupRows.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    <td className="py-1.5 pr-4 font-mono">{r.keyword}</td>
                    <td className="py-1.5 pr-4"><ChangeCell change={r.change} /></td>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <ActionBadge action={r.action} />
                        <span className="text-xs text-[var(--muted)]">{BID_LABEL[r.action]}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))
          ) : (
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-b border-[var(--border)]">
                  <td className="py-1.5 pr-4 font-mono">{r.keyword}</td>
                  <td className="py-1.5 pr-4 text-[var(--muted)]">{r.topic}</td>
                  <td className="py-1.5 pr-4"><ChangeCell change={r.change} /></td>
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <ActionBadge action={r.action} />
                      <span className="text-xs text-[var(--muted)]">{BID_LABEL[r.action]}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
        {filtered.length === 0 && (
          <p className="py-4 text-sm text-[var(--muted)] italic">No keywords match the current filters.</p>
        )}
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        Search Interest Δ: if the keyword matches a Google Trends &quot;rising query&quot;, its rise value;
        otherwise the coin/term&apos;s Trends interest change over the last 7 days. &quot;—&quot; when no Trends data.
      </p>
    </div>
  );
}
