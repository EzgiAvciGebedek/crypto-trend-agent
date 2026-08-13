"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export interface TopicMetric {
  topic: string;
  interest: number | null;
  mentions: number;
}

// Erişilebilir, açık/koyu temada okunur renkler.
const INTEREST = "#2563eb"; // mavi
const MENTIONS = "#059669"; // yeşil

export default function MarketCharts({ data }: { data: TopicMetric[] }) {
  const interestData = data.filter((d) => d.interest !== null).slice(0, 10);
  const mentionsData = data.filter((d) => d.mentions > 0).slice(0, 10);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Google Trends Interest (0-100)</h3>
        {interestData.length === 0 ? (
          <p className="text-xs text-neutral-500 italic">No Trends interest data for this market (outside rotation or unavailable).</p>
        ) : (
          <div className="h-56 w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height="100%" minWidth={280}>
              <BarChart data={interestData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                <XAxis dataKey="topic" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="interest" name="Interest" fill={INTEREST} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">News Mentions (last 24h)</h3>
        {mentionsData.length === 0 ? (
          <p className="text-xs text-neutral-500 italic">No mention data.</p>
        ) : (
          <div className="h-56 w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height="100%" minWidth={280}>
              <BarChart data={mentionsData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                <XAxis dataKey="topic" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="mentions" name="Mentions" fill={MENTIONS} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
