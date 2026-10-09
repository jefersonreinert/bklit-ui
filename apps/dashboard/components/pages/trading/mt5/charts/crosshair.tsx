import { useChart } from "./chart-context";

export function Crosshair() {
  const { tooltipData, innerWidth, innerHeight, margin, xAccessor, yScale } = useChart();

  if (!tooltipData) return null;

  const { x, point } = tooltipData;
  // Use raw mouse Y position for crosshair (follows cursor like TradingView)
  const y = tooltipData.mouseY ?? 0;

  // Get price from yScale inverse at mouse position
  const priceAtMouse = yScale.invert(y);
  const date = xAccessor(point);

  return (
    <g className="chart-crosshair pointer-events-none">
      {/* Vertical line */}
      <line
        x1={x}
        y1={0}
        x2={x}
        y2={innerHeight}
        stroke="var(--chart-crosshair)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      
      {/* Horizontal line */}
      <line
        x1={0}
        y1={y}
        x2={innerWidth}
        y2={y}
        stroke="var(--chart-crosshair)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />

      {/* Price label at right margin */}
      <foreignObject
        x={innerWidth}
        y={y - 10}
        width={margin.right + 20}
        height={20}
        className="overflow-visible"
      >
        <div 
          className="flex items-center px-1 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-100 rounded-sm whitespace-nowrap"
          style={{ 
            marginLeft: "4px",
            border: "1px solid var(--chart-grid)"
          }}
        >
          {priceAtMouse.toFixed(5)}
        </div>
      </foreignObject>

      {/* Time label at bottom margin */}
      <foreignObject
        x={x - 25}
        y={innerHeight}
        width={60}
        height={20}
        className="overflow-visible"
      >
        <div 
          className="flex items-center justify-center px-1 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-100 rounded-sm whitespace-nowrap"
          style={{ 
            marginTop: "4px",
            border: "1px solid var(--chart-grid)"
          }}
        >
          {date.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          })}
        </div>
      </foreignObject>
    </g>
  );
}

Crosshair.displayName = "Crosshair";
