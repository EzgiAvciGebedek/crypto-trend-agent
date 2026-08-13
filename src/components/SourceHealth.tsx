import { getHealth } from "@/lib/store";

// Son çalıştırmadaki kaynak sağlığı göstergesi (özellikle Google Trends kırılganlığı için).
export default async function SourceHealthBar({ date }: { date: string }) {
  const health = await getHealth(date);
  if (health.length === 0) return null;

  const ok = health.filter((h) => h.ok).length;
  const failed = health.filter((h) => !h.ok);
  const trendsFailedAll =
    health.some((h) => h.source.startsWith("gtrends")) &&
    health.filter((h) => h.source.startsWith("gtrends")).every((h) => !h.ok);

  return (
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Source Health</span>
        <span className="text-xs text-neutral-500">{ok}/{health.length} healthy</span>
      </div>
      {trendsFailedAll && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">⚠️ Google Trends data unavailable — analysis ran with RSS + CoinGecko + Reddit.</p>
      )}
      {failed.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-red-600 dark:text-red-400">{failed.length} failed sources</summary>
          <ul className="mt-1 space-y-0.5 text-xs text-neutral-500">
            {failed.map((h, i) => (
              <li key={i}>{h.source}{h.detail ? ` — ${String(h.detail).slice(0, 60)}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
