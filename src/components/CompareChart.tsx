"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export interface MarketBar {
  market: string;
  flag: string;
  interest: number | null;
  mentions: number;
}

// "Early entry" opportunity: darker = higher interest, lighter = lower — shows which market is strong.
function color(v: number | null): string {
  if (v === null) return "#cbd5e1";
  if (v >= 60) return "#1d4ed8";
  if (v >= 30) return "#3b82f6";
  if (v >= 10) return "#93c5fd";
  return "#dbeafe";
}

export default function CompareChart({ data }: { data: MarketBar[] }) {
  const rows = data.map((d) => ({ ...d, label: `${d.flag} ${d.market}` }));
  return (
    <div className="h-72 w-full overflow-x-auto">
      <ResponsiveContainer width="100%" height="100%" minWidth={320}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="interest" name="Interest" radius={[3, 3, 0, 0]}>
            {rows.map((r, i) => <Cell key={i} fill={color(r.interest)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
