"use client";

import {
  Area,
  AreaChart,
  ChartStatFlow,
  type ChartStatFlowFormat,
  LinearGradient,
} from "@bklitui/ui/charts";
import { curveCardinal } from "@visx/curve";
import { type ReactNode, useCallback, useId, useState } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDay } from "@/lib/format";
import { Icon, type IconName } from "@/lib/icons";
import {
  StatCardHoverBridge,
  type StatCardHoverState,
} from "./stat-card-hover-bridge";
import { TrendBadge } from "./trend-badge";

export function KpiCard({
  title,
  icon,
  value,
  label,
  trend,
  invertTrend,
  formatOptions,
  suffix,
  series,
  dataKey = "value",
  color = "var(--kpi-1)",
  footer,
}: {
  title: string;
  icon: IconName;
  value: number;
  label: string;
  trend?: number;
  invertTrend?: boolean;
  formatOptions?: ChartStatFlowFormat;
  suffix?: string;
  /** Optional sparkline series `{ date, [dataKey]: number }[]`. */
  series?: Record<string, unknown>[];
  dataKey?: string;
  color?: string;
  footer?: ReactNode;
}) {
  const gradientId = `kpi-${useId().replace(/:/g, "")}`;
  const [hover, setHover] = useState<StatCardHoverState>({
    value: null,
    label: null,
  });
  const onHover = useCallback((s: StatCardHoverState) => setHover(s), []);

  return (
    <Card className="min-w-0 gap-0 py-0">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2 font-normal text-muted-foreground text-sm">
          <span className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground">
            <Icon className="size-4" name={icon} />
          </span>
          {title}
        </CardTitle>
        {trend === undefined ? null : (
          <CardAction>
            <TrendBadge invert={invertTrend} value={trend} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-4">
        <ChartStatFlow
          formatOptions={formatOptions}
          label={hover.label ?? label}
          labelClassName="mt-0 text-xs"
          suffix={suffix}
          value={hover.value ?? value}
          valueClassName="text-2xl font-semibold leading-none tracking-tight"
        />
        {series ? (
          <div className="relative -mx-4 -mb-4 h-16 overflow-hidden [&_.relative.w-full]:aspect-auto! [&_.relative.w-full]:h-16!">
            <AreaChart
              className="w-full"
              data={series}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
              <StatCardHoverBridge
                dataKey={dataKey}
                formatLabel={formatDay}
                onHoverChange={onHover}
              />
              <LinearGradient
                from={color}
                fromOpacity={0.4}
                id={gradientId}
                to={color}
                toOpacity={0}
              />
              <Area
                curve={curveCardinal.tension(0.6)}
                dataKey={dataKey}
                fill={`url(#${gradientId})`}
                fillOpacity={1}
                showHighlight
                stroke={color}
                strokeWidth={2}
              />
            </AreaChart>
          </div>
        ) : null}
        {footer}
      </CardContent>
    </Card>
  );
}
