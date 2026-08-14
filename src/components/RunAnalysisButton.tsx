"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

export default function RunAnalysisButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function run(skipTrends: boolean) {
    setState("running");
    setMsg(
      skipTrends
        ? "Quick fill: analyzing every market without Trends… (~30s)"
        : "Collecting sources and analyzing… (may take ~1 min)",
    );
    try {
      const res = await fetch(`/api/cron/daily${skipTrends ? "?trends=0" : ""}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "unknown error");
      setState("done");
      setMsg(`Done: ${j.processedMarkets?.length ?? 0} markets processed${j.skippedMarkets?.length ? `, ${j.skippedMarkets.length} skipped` : ""}. Trends: ${(j.trendsMarkets || []).join(", ") || "none"}.`);
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => run(true)}
          disabled={state === "running"}
          title="Analyzes every market without Google Trends, so all markets finish within the time budget."
        >
          Quick fill (skip Trends)
        </Button>
        <Button onClick={() => run(false)} disabled={state === "running"}>
          {state === "running" ? "Running…" : "Run analysis now"}
        </Button>
      </div>
      {msg && (
        <span className={`text-xs max-w-xs text-right ${state === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--muted)]"}`}>{msg}</span>
      )}
    </div>
  );
}
