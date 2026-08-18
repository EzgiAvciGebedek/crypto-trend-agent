import type { Action, Confidence } from "@/lib/types";
import type { ComponentProps, ReactNode } from "react";

// Small className joiner (keeps call sites tidy without a dependency).
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

// The canonical panel: token-driven surface, border, radius and elevation.
// `interactive` adds a subtle lift on hover (use for clickable cards).
export function Card({
  className,
  interactive,
  ...props
}: ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-card",
        interactive &&
          "transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-card-hover",
        className,
      )}
      {...props}
    />
  );
}

// A Card with a standard header row (title + optional right-aligned action).
export function SectionCard({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cx("p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium select-none disabled:opacity-50 disabled:pointer-events-none";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary:
    "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-2)]",
  ghost: "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1.5",
  md: "text-sm px-3.5 py-2",
};

// No hooks → safe to use inside both server and client components.
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Badges & chips
// ---------------------------------------------------------------------------

type Tone = "neutral" | "brand" | "positive" | "warning" | "negative";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] text-[var(--muted)]",
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  positive: "bg-positive-mild text-positive",
  warning: "bg-warning-mild text-warning",
  negative: "bg-negative-mild text-negative",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[tone], className)}>
      {children}
    </span>
  );
}

// A small keyword/label chip.
export function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--foreground)]/80",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Domain badges (unchanged API)
// ---------------------------------------------------------------------------

const ACTION_STYLE: Record<Action, { label: string; cls: string }> = {
  invest: { label: "INVEST", cls: "bg-positive-mild text-positive" },
  watch: { label: "WATCH", cls: "bg-warning-mild text-warning" },
  reduce: { label: "REDUCE", cls: "bg-negative-mild text-negative" },
};

export function ActionBadge({ action }: { action: Action }) {
  const s = ACTION_STYLE[action] ?? ACTION_STYLE.watch;
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${s.cls}`}>{s.label}</span>;
}

const CONF_LABEL: Record<Confidence, string> = { low: "low", medium: "medium", high: "high" };

export function ConfidenceDot({ confidence }: { confidence: Confidence }) {
  const color = confidence === "high" ? "bg-positive" : confidence === "medium" ? "bg-warning" : "bg-[var(--border-strong)]";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[var(--muted)]">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} /> {CONF_LABEL[confidence]}
    </span>
  );
}
