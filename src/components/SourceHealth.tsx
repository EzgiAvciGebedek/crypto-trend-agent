import { getHealth } from "@/lib/store";

// Source-health indicator for the last run (especially for Google Trends fragility).
export default async function SourceHealthBar({ date }: { date: string }) {
  const health = await getHealth(date);
  if (health.length === 0) return null;

  const ok = health.filter((h) => h.ok).length;
  const failed = health.filter((h) => !h.ok);
  const trendsFailedAll =
    health.some((h) => h.source.startsWith("gtrends")) &&
    health.filter((h) => h.source.startsWith("gtrends")).every((h) => !h.ok);

  return (
    <section className="rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Source Health</span>
        <span className="text-xs text-[var(--muted)]">{ok}/{health.length} healthy</span>
      </div>
      {trendsFailedAll && (
        <p className="mt-2 text-xs text-warning">⚠️ Google Trends data unavailable — analysis ran with RSS, market-price signals and Reddit.</p>
      )}
      {failed.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-negative">{failed.length} failed sources</summary>
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--muted)]">
            {failed.map((h, i) => (
              <li key={i}>{h.source}{h.detail ? ` — ${String(h.detail).slice(0, 60)}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
