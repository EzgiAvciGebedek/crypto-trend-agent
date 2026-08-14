import { getGlobalSignals } from "@/lib/coingecko";
import { getCmcSignals } from "@/lib/coinmarketcap";
import { combineGlobalSignals, type MergedMover, type MergedTrending } from "@/lib/globalMarket";

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(1)}%`;
}

function pctClass(n: number | null): string {
  if (n === null) return "text-[var(--muted)]";
  return n >= 0 ? "text-positive" : "text-negative";
}

// Small dot marking a coin that showed up in both underlying signals — never names the
// vendors, just communicates "independently corroborated" to the reader.
function ConfirmedDot() {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-supporting"
      title="Confirmed by two independent signals"
    />
  );
}

// Blends two independent market-data providers into one "what's moving" view (no single
// provider is named in the UI — see combineGlobalSignals for the merge logic).
export default async function GlobalSignals() {
  const [cg, cmc] = await Promise.all([getGlobalSignals(), getCmcSignals()]);

  if (!cg.ok) {
    return (
      <section className="rounded-card border border-negative/30 bg-negative-mild text-negative px-4 py-3 text-sm">
        ⚠️ Could not load global market data: {cg.error}
      </section>
    );
  }

  const combined = combineGlobalSignals(cg, cmc);
  const topMovers: MergedMover[] = [...combined.gainers, ...combined.losers]
    .sort((a, b) => Math.abs(b.changePct24h) - Math.abs(a.changePct24h))
    .slice(0, 8);

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">🔥 Global Trending</h2>
        <ul className="space-y-1.5">
          {combined.trending.slice(0, 10).map((c: MergedTrending) => (
            <li key={`${c.symbol}-${c.name}`} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {c.confirmed && <ConfirmedDot />}
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-[var(--muted)]">{c.symbol}</span>
                {c.marketCapRank && <span className="text-[10px] text-[var(--muted)]">#{c.marketCapRank}</span>}
              </span>
              <span className={`text-xs tabular-nums ${pctClass(c.changePct24h)}`}>{pct(c.changePct24h)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          📊 Top Movers <span className="text-xs font-normal text-[var(--muted)]">(24h)</span>
        </h2>
        <ul className="space-y-1.5">
          {topMovers.map((m) => (
            <li key={`${m.symbol}-${m.name}`} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {m.confirmed && <ConfirmedDot />}
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-[var(--muted)]">{m.symbol}</span>
              </span>
              <span className={`text-xs tabular-nums ${pctClass(m.changePct24h)}`}>{pct(m.changePct24h)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
