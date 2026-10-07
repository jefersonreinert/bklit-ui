import { Icon, type IconName } from "@/lib/icons";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MetricTone = "good" | "warn" | "bad" | "neutral";

const toneDot: Record<MetricTone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  neutral: "bg-muted-foreground",
};

const toneLabel: Record<MetricTone, string> = {
  good: "Saudável",
  warn: "Atenção",
  bad: "Crítico",
  neutral: "Informativo",
};

/** Compact indicator tile: label, big value, reference/benchmark and status. */
export function MetricTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  children,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: IconName;
  tone?: MetricTone;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 gap-2 px-4 py-3.5", className)} size="sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
          <Icon className="size-3.5 shrink-0" name={icon} />
          <span className="truncate">{label}</span>
        </span>
        <span
          className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
          title={toneLabel[tone]}
        >
          <span className={cn("size-1.5 rounded-full", toneDot[tone])} />
          {toneLabel[tone]}
        </span>
      </div>
      <p className="font-semibold text-xl tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {children}
    </Card>
  );
}

/** Thin progress bar used inside tiles. */
export function MetricBar({
  value,
  max = 100,
}: {
  value: number;
  max?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-[var(--chart-1)] dark:bg-foreground"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
