import type { Action, Confidence } from "@/lib/types";

const ACTION_STYLE: Record<Action, { label: string; cls: string }> = {
  invest: { label: "INVEST", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  watch: { label: "WATCH", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  reduce: { label: "REDUCE", cls: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" },
};

export function ActionBadge({ action }: { action: Action }) {
  const s = ACTION_STYLE[action] ?? ACTION_STYLE.watch;
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${s.cls}`}>{s.label}</span>;
}

const CONF_LABEL: Record<Confidence, string> = { low: "low", medium: "medium", high: "high" };

export function ConfidenceDot({ confidence }: { confidence: Confidence }) {
  const color = confidence === "high" ? "bg-emerald-500" : confidence === "medium" ? "bg-amber-500" : "bg-neutral-400";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} /> {CONF_LABEL[confidence]}
    </span>
  );
}
