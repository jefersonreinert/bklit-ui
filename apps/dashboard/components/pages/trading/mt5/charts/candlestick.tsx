import { useChart } from "./chart-context";

interface CandlestickProps {
  animate?: boolean;
  positiveFill?: string;
  negativeFill?: string;
  positiveWickFill?: string;
  negativeWickFill?: string;
  positiveBorder?: string;
  negativeBorder?: string;
}

export function Candlestick({
  positiveFill = "#e0d8c8",
  negativeFill = "#000000",
  positiveWickFill = "#000000",
  negativeWickFill = "#000000",
  positiveBorder = "#000000",
  negativeBorder = "#000000",
}: CandlestickProps) {
  const { data, xScale, yScale, bandWidth } = useChart();

  // Adaptive rendering based on zoom level
  // bandWidth < 1px: single line (high→low), colored by direction
  // bandWidth 1-3px: thin body + wick, no border stroke
  // bandWidth >= 3px: full candle with body, wick, and border
  const bw = bandWidth ?? 1;
  const mode = bw < 1 ? "line" : bw < 3 ? "thin" : "full";

  return (
    <g className="chart-candlesticks">
      {data.map((d: any, index: number) => {
        const x = xScale(index) ?? 0;
        const yOpen = yScale(d.open) ?? 0;
        const yClose = yScale(d.close) ?? 0;
        const yHigh = yScale(d.high) ?? 0;
        const yLow = yScale(d.low) ?? 0;
        const isUp = d.close >= d.open;

        if (mode === "line") {
          // Ultra-zoomed-out: single vertical line, colored by direction
          return (
            <line
              key={index}
              x1={x}
              y1={yHigh}
              x2={x}
              y2={yLow}
              stroke={isUp ? positiveFill : negativeFill}
              strokeWidth={Math.max(0.5, bw)}
            />
          );
        }

        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
        const bodyLeft = x - bw / 2;
        const fill = isUp ? positiveFill : negativeFill;
        const wickColor = isUp ? positiveWickFill : negativeWickFill;

        if (mode === "thin") {
          // Medium zoom: body rect + wick, no border stroke
          return (
            <g key={index}>
              <line
                x1={x}
                y1={yHigh}
                x2={x}
                y2={yLow}
                stroke={wickColor}
                strokeWidth={1}
              />
              <rect
                x={bodyLeft}
                y={bodyTop}
                width={bw}
                height={bodyHeight}
                fill={fill}
                rx={0}
              />
            </g>
          );
        }

        // Full candle: body + wick + border
        const borderColor = isUp ? positiveBorder : negativeBorder;
        return (
          <g key={index}>
            <line
              x1={x}
              y1={yHigh}
              x2={x}
              y2={yLow}
              stroke={wickColor}
              strokeWidth={1.5}
            />
            <rect
              x={bodyLeft}
              y={bodyTop}
              width={bw}
              height={bodyHeight}
              fill={fill}
              stroke={borderColor}
              strokeWidth={0.5}
              rx={1}
            />
          </g>
        );
      })}
    </g>
  );
}
