import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useChart } from "./chart-context";

export interface YAxisProps {
  /** Number of ticks to show. Default: 5 */
  numTicks?: number;
  /** Format large numbers (e.g. 1000 as "1k"). Default: true */
  formatLargeNumbers?: boolean;
  /** Custom formatter for tick labels (e.g. USD). Overrides formatLargeNumbers when set. */
  formatValue?: (value: number) => string;
  /** Position of the axis. Default: "left" */
  position?: "left" | "right";
}

function formatLabel(
  value: number,
  formatLargeNumbers: boolean,
  formatValue?: (value: number) => string
): string {
  if (formatValue) {
    return formatValue(value);
  }
  if (formatLargeNumbers && value >= 1000) {
    return `${(value / 1000).toFixed(0)}k`;
  }
  return String(value);
}

export function YAxis({
  numTicks = 5,
  formatLargeNumbers = true,
  formatValue,
  position = "left",
}: YAxisProps) {
  const { yScale, margin, containerRef } = useChart();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const ticks = useMemo(() => {
    const tickValues = yScale.ticks(numTicks);
    return tickValues.map((value) => ({
      value,
      y: (yScale(value) ?? 0) + margin.top,
      label: formatLabel(value, formatLargeNumbers, formatValue),
    }));
  }, [yScale, margin.top, numTicks, formatLargeNumbers, formatValue]);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }

  const isRight = position === "right";

  return createPortal(
    <div
      className="pointer-events-none absolute top-0 bottom-0"
      style={
        isRight
          ? { right: 0, width: margin.right }
          : { left: 0, width: margin.left }
      }
    >
      {ticks.map((tick) => (
        <div
          className={
            isRight
              ? "absolute left-0 flex items-center justify-start pl-2"
              : "absolute right-0 flex items-center justify-end pr-2"
          }
          key={tick.value}
          style={{ top: tick.y, transform: "translateY(-50%)" }}
        >
          <span className="text-chart-label text-xs">{tick.label}</span>
        </div>
      ))}
    </div>,
    container
  );
}

YAxis.displayName = "YAxis";

export default YAxis;
