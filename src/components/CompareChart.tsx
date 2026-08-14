"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export interface MarketBar {
  market: string;
  flag: string;
  interest: number | null;
  mentions: number;
}

// "Early entry" opportunity: darker = higher interest, lighter = lower — shows which market is strong.
// Brand teal intensity scale (matches the app's design tokens); a flat mid-teal is used for the
// mentions fallback since raw counts aren't a normalized 0-100 score.
function interestColor(v: number | null): string {
  if (v === null) return "#4b4b52";
  if (v >= 60) return "#006c75";
  if (v >= 30) return "#14b8b8";
  if (v >= 10) return "#5fd1c4";
  return "#99e0d4";
}
const MENTIONS_COLOR = "#14b8b8";

export type CompareMetric = "interest" | "mentions";

// `metric` picks which field drives the bars: Trends interest (0-100, fixed axis) or news
// mention counts (auto-scaled axis) — used as a fallback when Trends has no data for the topic.
export default function CompareChart({ data, metric = "interest" }: { data: MarketBar[]; metric?: CompareMetric }) {
  const rows = data.map((d) => ({
    ...d,
    label: `${d.flag} ${d.market}`,
    value: metric === "interest" ? d.interest : d.mentions,
  }));
  return (
    <div className="h-72 w-full overflow-x-auto">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 10 }} domain={metric === "interest" ? [0, 100] : [0, "auto"]} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="value" name={metric === "interest" ? "Interest" : "Mentions"} radius={[3, 3, 0, 0]}>
            {rows.map((r, i) => (
              <Cell key={i} fill={metric === "interest" ? interestColor(r.interest) : MENTIONS_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
