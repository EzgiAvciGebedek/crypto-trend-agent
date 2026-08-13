import { getGlobalSignals } from "@/lib/coingecko";

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(1)}%`;
}

function pctClass(n: number | null): string {
  if (n === null) return "text-neutral-500";
  return n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

// Async server component — CoinGecko global signals (live).
export default async function GlobalSignals() {
  const { trending, markets, ok, error } = await getGlobalSignals();

  const topMovers = [...markets]
    .filter((m) => m.change24hPct !== null)
    .sort((a, b) => Math.abs(b.change24hPct!) - Math.abs(a.change24hPct!))
    .slice(0, 8);

  if (!ok) {
    return (
      <section className="rounded-lg border border-red-300 bg-red-50 text-red-800 px-4 py-3 text-sm dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
        ⚠️ Could not load CoinGecko data: {error}
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          🔥 Global Trending <span className="text-xs font-normal text-neutral-500">(CoinGecko)</span>
        </h2>
        <ul className="space-y-1.5">
          {trending.slice(0, 10).map((c) => (
            <li key={c.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-neutral-500">{c.symbol}</span>
                {c.marketCapRank && (
                  <span className="text-[10px] text-neutral-400">#{c.marketCapRank}</span>
                )}
              </span>
              <span className={`text-xs tabular-nums ${pctClass(c.priceChange24hUsd)}`}>
                {pct(c.priceChange24hUsd)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          📊 Top Movers <span className="text-xs font-normal text-neutral-500">(24h, EUR)</span>
        </h2>
        <ul className="space-y-1.5">
          {topMovers.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-neutral-500">{m.symbol}</span>
              </span>
              <span className={`text-xs tabular-nums ${pctClass(m.change24hPct)}`}>
                {pct(m.change24hPct)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
