"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunAnalysisButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function run() {
    setState("running");
    setMsg("Collecting sources and analyzing… (may take ~1 min)");
    try {
      const res = await fetch("/api/cron/daily", { method: "POST" });
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
      <button
        onClick={run}
        disabled={state === "running"}
        className="rounded-md bg-neutral-900 text-white text-sm px-3 py-2 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {state === "running" ? "Running…" : "Run analysis now"}
      </button>
      {msg && (
        <span className={`text-xs max-w-xs text-right ${state === "error" ? "text-red-600 dark:text-red-400" : "text-neutral-500"}`}>{msg}</span>
      )}
    </div>
  );
}
