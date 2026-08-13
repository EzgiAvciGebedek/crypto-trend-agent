import type { CryptoOverall } from "@/lib/types";

function Delta({ label, value }: { label: string; value: number | null }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-neutral-400">{label}</span>
        <span className="text-neutral-400 text-xs">—</span>
      </div>
    );
  }
  const n = Number(value);
  const cls = n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-red-600 dark:text-red-400" : "text-neutral-500";
  const arrow = n > 0 ? "▲" : n < 0 ? "▼" : "→";
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] text-neutral-400">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${cls}`}>
        {arrow}{n > 0 ? "+" : ""}{n.toFixed(0)}%
      </span>
    </div>
  );
}

// Overall crypto search-interest change for a market (daily / weekly / monthly).
export default function OverallChange({ data }: { data: CryptoOverall | undefined }) {
  return (
    <div className="mt-3 rounded-md bg-neutral-50 dark:bg-neutral-800/40 px-2 py-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">Crypto search interest</span>
        {data?.date && <span className="text-[10px] text-neutral-400">as of {data.date}</span>}
      </div>
      <div className="flex items-center justify-around">
        <Delta label="1d" value={data?.change_1d ?? null} />
        <Delta label="7d" value={data?.change_7d ?? null} />
        <Delta label="30d" value={data?.change_30d ?? null} />
      </div>
    </div>
  );
}
