import { useMemo } from "react";
import { useChart } from "./chart-context";
import { formatAxisLabel } from "../lib/timezone";

export function XAxis({ numTicks = 6, timezone = "" }: { numTicks?: number; timezone?: string }) {
  const { data, xScale, innerHeight } = useChart();

  const ticks = useMemo(() => {
    if (data.length === 0) return [];
    const result = [];
    const step = Math.max(1, Math.floor(data.length / numTicks));

    // Determine if we should show dates: if visible data spans more than 24h
    const firstDate = data[0]?.date as Date | undefined;
    const lastDate = data[data.length - 1]?.date as Date | undefined;
    const spanMs = firstDate && lastDate ? lastDate.getTime() - firstDate.getTime() : 0;
    const showDate = spanMs > 24 * 60 * 60 * 1000; // > 24h

    for (let i = 0; i < data.length; i += step) {
      const d = data[i] as any;
      const date = d.date as Date;
      const label = timezone
        ? formatAxisLabel(date, timezone, showDate)
        : showDate
          ? date.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
          : date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

      result.push({
        x: xScale(i) ?? 0,
        label,
      });
    }
    return result;
  }, [data, xScale, numTicks, timezone]);

  return (
    <g className="x-axis" transform={`translate(0, ${innerHeight})`}>
      {ticks.map((tick, i) => (
        <g key={i} transform={`translate(${tick.x}, 0)`}>
          <line y2={6} stroke="var(--border)" strokeWidth={1} />
          <text
            y={20}
            fontSize={10}
            fill="var(--fg-muted)"
            textAnchor="middle"
            className="select-none"
          >
            {tick.label}
          </text>
        </g>
      ))}
    </g>
  );
}
