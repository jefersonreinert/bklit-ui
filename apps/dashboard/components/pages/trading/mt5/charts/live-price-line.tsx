import { useChart } from "./chart-context";

export function LivePriceLine({ precision = 5 }: { precision?: number }) {
  const { data, innerWidth, yScale, margin } = useChart();

  if (data.length === 0) return null;

  const lastCandle = data[data.length - 1];
  if (!lastCandle) return null;
  const close = lastCandle.close as number;
  const y = yScale(close) ?? 0;
  const PRICE_LINE_COLOR =
    close >= (lastCandle.open as number) ? "var(--up)" : "var(--down)";

  return (
    <g className="live-price-line">
      {/* Dashed line across the chart */}
      <line
        x1={0}
        y1={y}
        x2={innerWidth}
        y2={y}
        stroke={PRICE_LINE_COLOR}
        strokeWidth={1}
        strokeDasharray="4 4"
        className="opacity-70"
      />

      {/* Price label in the right margin */}
      <foreignObject
        x={innerWidth}
        y={y - 10}
        width={margin.right}
        height={20}
        className="overflow-visible"
      >
        <div
          className="flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-sm whitespace-nowrap"
          style={{
            backgroundColor: PRICE_LINE_COLOR,
            color: "#ffffff",
            marginLeft: "4px"
          }}
        >
          {close.toFixed(precision)}
        </div>
      </foreignObject>
    </g>
  );
}

LivePriceLine.displayName = "LivePriceLine";
