import { useChart } from "./chart-context";

const LABEL_H = 18;

/** Last close of the whole series (not the visible window). */
export function useLastCandle() {
  const { data, fullData } = useChart();
  const series = fullData && fullData.length > 0 ? fullData : data;
  return series[series.length - 1] as
    | { open: number; high: number; low: number; close: number }
    | undefined;
}

/** Y of the price label, kept inside the plot when the price is off-screen. */
export function usePriceLabelY() {
  const { yScale, innerHeight } = useChart();
  const last = useLastCandle();
  if (!last) return null;
  const y = yScale(last.close) ?? 0;
  return Math.min(Math.max(y, LABEL_H / 2), innerHeight - LABEL_H / 2);
}

export function LivePriceLine({ precision = 5 }: { precision?: number }) {
  const { innerWidth, innerHeight, yScale, margin } = useChart();
  const last = useLastCandle();
  const labelY = usePriceLabelY();
  if (!last || labelY === null) return null;

  const y = yScale(last.close) ?? 0;
  const inView = y >= 0 && y <= innerHeight;
  const color = last.close >= last.open ? "var(--up)" : "var(--down)";

  return (
    <g className="live-price-line">
      {inView ? (
        <line
          className="opacity-70"
          stroke={color}
          strokeDasharray="4 4"
          strokeWidth={1}
          x1={0}
          x2={innerWidth}
          y1={y}
          y2={y}
        />
      ) : null}
      {/* Flat price tag flush with the axis, like TradingView */}
      <foreignObject
        className="overflow-visible"
        height={LABEL_H}
        width={margin.right}
        x={innerWidth}
        y={labelY - LABEL_H / 2}
      >
        <div
          className="flex h-full w-full items-center whitespace-nowrap pl-2 font-medium font-mono text-[11px] tabular-nums"
          style={{ backgroundColor: color, color: "#ffffff", borderRadius: 0 }}
        >
          {last.close.toFixed(precision)}
        </div>
      </foreignObject>
    </g>
  );
}

LivePriceLine.displayName = "LivePriceLine";
