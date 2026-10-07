"use client";

import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** `invert` = lower is better (e.g. expenses, turnover). */
export function TrendBadge({
  value,
  invert = false,
  className,
}: {
  value: number;
  invert?: boolean;
  className?: string;
}) {
  const up = value >= 0;
  const good = invert ? !up : up;

  return (
    <Badge
      className={cn(
        good &&
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        className
      )}
      variant={good ? "outline" : "destructive"}
    >
      <Icon
        className="size-3"
        data-icon="inline-start"
        name={up ? "IconArrowUp" : "IconArrowDown"}
      />
      {up ? "+" : ""}
      {formatPercent(value)}
    </Badge>
  );
}
