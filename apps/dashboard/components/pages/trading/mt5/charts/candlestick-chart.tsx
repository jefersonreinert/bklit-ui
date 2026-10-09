import { localPoint } from "@visx/event";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { ChartProvider, type LineConfig, type Margin } from "./chart-context";
import { useChartInteraction } from "./use-chart-interaction";

export interface OHLCDataPoint {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CandlestickChartProps {
  data: OHLCDataPoint[];
  margin?: Partial<Margin>;
  animationDuration?: number;
  aspectRatio?: string;
  className?: string;
  style?: React.CSSProperties;
  candleGap?: number;
  zoomable?: boolean;
  minVisibleCandles?: number;
  zoomSpeed?: number;
  goToDate?: Date | null;
  /** Auto-scroll to keep the latest candle visible (for replay mode) */
  followLast?: boolean;
  children: ReactNode;
}

const DEFAULT_MARGIN: Margin = { top: 30, right: 60, bottom: 30, left: 10 };
const DEFAULT_VISIBLE = 200; // candles shown on initial load

function ChartInner({
  width,
  height,
  data: fullData,
  margin,
  animationDuration,
  candleGap,
  zoomable,
  minVisibleCandles,
  zoomSpeed,
  goToDate,
  followLast,
  children,
  containerRef,
}: any) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hoveredCandleIndex, setHoveredCandleIndex] = useState<number | null>(null);

  // Initial view: show the last DEFAULT_VISIBLE candles (not all data)
  const [viewRange, setViewRange] = useState<[number, number]>(() => {
    const end = Math.max(0, fullData.length - 1);
    const start = Math.max(0, end - DEFAULT_VISIBLE);
    return [start, end];
  });

  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  // Max visible candles: at least 2px per candle body
  const maxVisibleCandles = Math.max(minVisibleCandles, Math.floor(innerWidth / 2));

  // Sync viewRange when data changes
  const prevLength = useRef(fullData.length);
  useEffect(() => {
    if (fullData.length !== prevLength.current) {
      if (followLast) {
        // Replay mode: always keep the last candle visible, show last DEFAULT_VISIBLE
        const end = Math.max(0, fullData.length - 1);
        const start = Math.max(0, end - DEFAULT_VISIBLE);
        setViewRange([start, end]);
      } else if (Math.abs(fullData.length - prevLength.current) > 1 || prevLength.current === 0) {
        // Big data change (symbol switch, initial load): show last DEFAULT_VISIBLE
        const end = Math.max(0, fullData.length - 1);
        const start = Math.max(0, end - DEFAULT_VISIBLE);
        setViewRange([start, end]);
      } else if (fullData.length > prevLength.current) {
        // New candle: auto-scroll if user is near the end
        setViewRange(([start, end]) => {
          const wasAtEnd = end >= prevLength.current - 2;
          if (wasAtEnd) {
            const visibleCount = end - start;
            return [fullData.length - 1 - visibleCount, fullData.length - 1];
          }
          return [start, end];
        });
      }
      prevLength.current = fullData.length;
    }
  }, [fullData.length, followLast]);

  // Go to specific date
  useEffect(() => {
    if (!goToDate || fullData.length === 0) return;
    const targetTime = goToDate.getTime();
    // Binary search for closest candle
    let lo = 0, hi = fullData.length - 1, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const t = fullData[mid].date.getTime();
      if (t <= targetTime) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    // Center the view on that candle
    const half = Math.floor(DEFAULT_VISIBLE / 2);
    const start = Math.max(0, best - half);
    const end = Math.min(fullData.length - 1, start + DEFAULT_VISIBLE);
    setViewRange([start, end]);
  }, [goToDate, fullData.length]);

  const data = useMemo(() => {
    const [start, end] = viewRange;
    return fullData.slice(Math.max(0, Math.floor(start)), Math.min(fullData.length, Math.ceil(end) + 1));
  }, [fullData, viewRange]);

  // X Scale: index-based for perfect spacing
  const xScale = useMemo(() => {
    const domainMax = Math.max(0, data.length - 1);
    const padding = (innerWidth / Math.max(data.length, 1)) / 2;
    return scaleLinear({
      range: [padding, innerWidth - padding],
      domain: [0, domainMax],
    });
  }, [innerWidth, data.length]);

  // Y Scale: price-based, auto-fit to visible range
  const yScale = useMemo(() => {
    if (data.length === 0) return scaleLinear({ range: [innerHeight, 0], domain: [0, 100] });
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const d = data[i] as any;
      if (d.low < minVal) minVal = d.low;
      if (d.high > maxVal) maxVal = d.high;
    }
    const diff = maxVal - minVal || 1;
    return scaleLinear({
      range: [innerHeight, 0],
      domain: [minVal - diff * 0.05, maxVal + diff * 0.05],
      nice: true,
    });
  }, [innerHeight, data]);

  const columnWidth = innerWidth / Math.max(data.length, 1);
  const bandWidth = columnWidth * (1 - candleGap);

  const lines: LineConfig[] = useMemo(
    () => [{ dataKey: 'close', stroke: 'transparent', strokeWidth: 0 }],
    []
  );

  const dateLabels = useMemo(() => data.map((d: any) => d.date.toISOString()), [data]);

  const contextValue = {
    data,
    fullData,
    viewStart: Math.max(0, Math.floor(viewRange[0])),
    xScale,
    yScale,
    width,
    height,
    innerWidth,
    innerHeight,
    margin,
    columnWidth,
    bandWidth,
    containerRef,
    isLoaded,
    animationDuration,
    xAccessor: (d: any) => d.date,
    hoveredCandleIndex,
    setHoveredCandleIndex,
    lines,
    dateLabels,
    orientation: 'vertical' as const,
  };

  // Pan handler: shift viewRange by candlesDelta
  const handlePan = useCallback(
    (candlesDelta: number) => {
      setViewRange(([prevStart, prevEnd]) => {
        const visibleCount = prevEnd - prevStart;
        let newStart = prevStart + candlesDelta;
        let newEnd = prevEnd + candlesDelta;

        // Clamp to data bounds
        if (newStart < 0) {
          newStart = 0;
          newEnd = visibleCount;
        }
        if (newEnd >= fullData.length) {
          newEnd = fullData.length - 1;
          newStart = Math.max(0, newEnd - visibleCount);
        }

        return [newStart, newEnd];
      });
    },
    [fullData.length]
  );

  // Zoom: factor > 1 shows more candles, anchored at fraction (0..1) of width
  const zoomBy = useCallback(
    (factor: number, fraction: number) => {
      if (!zoomable || fullData.length <= minVisibleCandles) return;
      setViewRange(([prevStart, prevEnd]) => {
        const visibleCount = prevEnd - prevStart + 1;
        const nextCount = Math.round(
          Math.max(minVisibleCandles, Math.min(maxVisibleCandles, visibleCount * factor))
        );
        if (nextCount === visibleCount) return [prevStart, prevEnd];
        const anchor = prevStart + (prevEnd - prevStart) * fraction;
        let newStart = Math.round(anchor - (nextCount - 1) * fraction);
        let newEnd = newStart + nextCount - 1;
        if (newStart < 0) {
          newEnd = Math.min(fullData.length - 1, newEnd - newStart);
          newStart = 0;
        }
        if (newEnd >= fullData.length) {
          newStart = Math.max(0, newStart - (newEnd - fullData.length + 1));
          newEnd = fullData.length - 1;
        }
        return [newStart, newEnd];
      });
    },
    [zoomable, fullData.length, minVisibleCandles, maxVisibleCandles]
  );

  const interaction = useChartInteraction({
    xScale,
    yScale,
    data,
    lines,
    margin,
    xAccessor: (d: any) => d.date,
    bisectDate: () => 0,
    canInteract: true,
    onPan: handlePan,
    onZoom: zoomBy,
    innerWidth,
  });

  const finalContext = { ...contextValue, ...interaction };

  // Mouse wheel zoom (native listener: React's wheel listener is passive)
  const svgRef = useRef<SVGSVGElement>(null);
  const wheelRef = useRef({ zoomBy, zoomSpeed, left: margin.left, innerWidth });
  wheelRef.current = { zoomBy, zoomSpeed, left: margin.left, innerWidth };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const w = wheelRef.current;
      event.preventDefault();
      // Horizontal trackpad swipe pans
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const step = Math.trunc(event.deltaX / 8);
        if (step !== 0) handlePanRef.current(step);
        return;
      }
      const point = localPoint(el, event);
      const mouseX = point ? point.x - w.left : w.innerWidth / 2;
      const fraction = Math.max(0, Math.min(1, mouseX / w.innerWidth));
      w.zoomBy(event.deltaY < 0 ? 1 - w.zoomSpeed : 1 + w.zoomSpeed, fraction);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const handlePanRef = useRef(handlePan);
  handlePanRef.current = handlePan;

  return (
    <ChartProvider value={finalContext}>
      <svg
        width={width}
        height={height}
        ref={svgRef}
        className="overflow-hidden"
      >
        <g transform={`translate(${margin.left},${margin.top})`} {...interaction.interactionHandlers} style={interaction.interactionStyle}>
          {/* Invisible rect to capture mouse events on empty space */}
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
          />
          {children}
        </g>
      </svg>
    </ChartProvider>
  );
}

export function CandlestickChart({
  data,
  margin: marginProp,
  animationDuration = 0,
  className = "",
  style,
  candleGap = 0.2,
  zoomable = true,
  minVisibleCandles = 10,
  zoomSpeed = 0.1,
  goToDate,
  followLast,
  children,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const margin = { ...DEFAULT_MARGIN, ...marginProp };

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full min-h-0", className)}
      style={{ touchAction: "none", ...style }}
    >
      <ParentSize>
        {({ width, height }) => (
          <ChartInner
            width={width}
            height={height}
            data={data}
            margin={margin}
            animationDuration={animationDuration}
            candleGap={candleGap}
            zoomable={zoomable}
            minVisibleCandles={minVisibleCandles}
            zoomSpeed={zoomSpeed}
            goToDate={goToDate}
            followLast={followLast}
            containerRef={containerRef}
          >
            {children}
          </ChartInner>
        )}
      </ParentSize>
    </div>
  );
}
