import { localPoint } from "@visx/event";
import type { scaleLinear, scaleTime } from "@visx/scale";
import { useCallback, useMemo, useRef, useState } from "react";
import type { LineConfig, Margin, TooltipData } from "./chart-context";

type ScaleTime = ReturnType<typeof scaleTime<number>>;
type ScaleLinear = ReturnType<typeof scaleLinear<number>>;

export interface ChartSelection {
  startX: number;
  endX: number;
  startIndex: number;
  endIndex: number;
  active: boolean;
}

interface UseChartInteractionParams {
  xScale: ScaleLinear;
  yScale: ScaleLinear;
  data: Record<string, unknown>[];
  lines: LineConfig[];
  margin: Margin;
  xAccessor: (d: Record<string, unknown>) => Date;
  bisectDate: (
    data: Record<string, unknown>[],
    date: Date,
    lo: number
  ) => number;
  canInteract: boolean;
  onPan?: (candlesDelta: number) => void;
  /** Pinch zoom: factor > 1 shows more candles, anchored at fraction (0..1). */
  onZoom?: (factor: number, fraction: number) => void;
  innerWidth?: number;
}

interface ChartInteractionResult {
  tooltipData: TooltipData | null;
  setTooltipData: React.Dispatch<React.SetStateAction<TooltipData | null>>;
  selection: ChartSelection | null;
  clearSelection: () => void;
  interactionHandlers: {
    onMouseMove?: (event: React.MouseEvent<SVGGElement>) => void;
    onMouseLeave?: () => void;
    onMouseDown?: (event: React.MouseEvent<SVGGElement>) => void;
    onMouseUp?: () => void;
    onTouchStart?: (event: React.TouchEvent<SVGGElement>) => void;
    onTouchMove?: (event: React.TouchEvent<SVGGElement>) => void;
    onTouchEnd?: () => void;
  };
  interactionStyle: React.CSSProperties;
}

export function useChartInteraction({
  xScale,
  yScale,
  data,
  lines,
  margin,
  xAccessor,
  bisectDate,
  canInteract,
  onPan,
  onZoom,
  innerWidth = 1,
}: UseChartInteractionParams): ChartInteractionResult {
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
  const [selection, setSelection] = useState<ChartSelection | null>(null);

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef<number>(0);
  const isPanningRef = useRef(false);
  const panLastXRef = useRef<number>(0);
  const panAccumulatorRef = useRef<number>(0);
  // Touch: long press → crosshair mode; two fingers → pinch zoom
  const pinchDistRef = useRef<number>(0);
  const crosshairModeRef = useRef(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const resolveTooltip = useCallback(
    (pixelX: number, mouseY?: number): TooltipData | null => {
      const floatIndex = xScale.invert(pixelX);
      const index = Math.round(floatIndex);
      const d = data[index];

      if (!d) {
        return null;
      }

      const yPositions: Record<string, number> = {};
      for (const line of lines) {
        const value = d[line.dataKey];
        if (typeof value === "number") {
          yPositions[line.dataKey] = yScale(value) ?? 0;
        }
      }

      return {
        point: d,
        index: index,
        x: xScale(index) ?? 0,
        yPositions,
        mouseY,
      };
    },
    [xScale, yScale, data, lines]
  );

  const resolveIndexFromX = useCallback(
    (pixelX: number): number => {
      const floatIndex = xScale.invert(pixelX);
      return Math.max(0, Math.min(data.length - 1, Math.round(floatIndex)));
    },
    [xScale, data.length]
  );

  const getChartPoint = useCallback(
    (
      event: React.MouseEvent<SVGGElement> | React.TouchEvent<SVGGElement>,
      touchIndex = 0
    ): { x: number; y: number } | null => {
      let point: { x: number; y: number } | null = null;

      if ("touches" in event) {
        const touch = event.touches[touchIndex];
        if (!touch) {
          return null;
        }
        const svg = event.currentTarget.ownerSVGElement;
        if (!svg) {
          return null;
        }
        point = localPoint(svg, touch as unknown as MouseEvent);
      } else {
        point = localPoint(event);
      }

      if (!point) {
        return null;
      }
      return { x: point.x - margin.left, y: point.y - margin.top };
    },
    [margin.left, margin.top]
  );

  // Pixels per candle for pan calculation
  const pixelsPerCandle = useMemo(() => {
    if (data.length <= 1) return 1;
    const x0 = xScale(0) ?? 0;
    const x1 = xScale(1) ?? 0;
    return Math.abs(x1 - x0) || 1;
  }, [xScale, data.length]);

  // --- Mouse handlers ---

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGGElement>) => {
      const pt = getChartPoint(event);
      if (pt === null) {
        return;
      }

      if (isPanningRef.current && onPan) {
        const deltaX = panLastXRef.current - pt.x;
        panAccumulatorRef.current += deltaX;

        const candlesMoved = Math.trunc(panAccumulatorRef.current / pixelsPerCandle);
        if (candlesMoved !== 0) {
          onPan(candlesMoved);
          panAccumulatorRef.current -= candlesMoved * pixelsPerCandle;
        }
        panLastXRef.current = pt.x;
        return;
      }

      const tooltip = resolveTooltip(pt.x, pt.y);
      if (tooltip) {
        setTooltipData(tooltip);
      }
    },
    [getChartPoint, resolveTooltip, onPan, pixelsPerCandle]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipData(null);
    isPanningRef.current = false;
    panAccumulatorRef.current = 0;
    setSelection(null);
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGGElement>) => {
      const pt = getChartPoint(event);
      if (pt === null) {
        return;
      }
      if (onPan) {
        isPanningRef.current = true;
        panLastXRef.current = pt.x;
        panAccumulatorRef.current = 0;
        setTooltipData(null);
      }
    },
    [getChartPoint, onPan]
  );

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    panAccumulatorRef.current = 0;
    setSelection(null);
  }, []);

  // --- Touch handlers ---

  const cancelLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<SVGGElement>) => {
      cancelLongPress();
      if (event.touches.length === 1) {
        const pt = getChartPoint(event, 0);
        if (pt === null) {
          return;
        }
        touchStartRef.current = pt;
        crosshairModeRef.current = false;
        if (onPan) {
          isPanningRef.current = true;
          panLastXRef.current = pt.x;
          panAccumulatorRef.current = 0;
        }
        // Hold still for 350ms → crosshair (like MT5 / TradingView mobile)
        longPressRef.current = setTimeout(() => {
          crosshairModeRef.current = true;
          isPanningRef.current = false;
          const tooltip = resolveTooltip(pt.x, pt.y);
          if (tooltip) {
            setTooltipData(tooltip);
          }
          navigator.vibrate?.(10);
        }, 350);
      } else if (event.touches.length === 2) {
        isPanningRef.current = false;
        crosshairModeRef.current = false;
        setTooltipData(null);
        const pt0 = getChartPoint(event, 0);
        const pt1 = getChartPoint(event, 1);
        if (pt0 === null || pt1 === null) {
          return;
        }
        pinchDistRef.current = Math.hypot(pt1.x - pt0.x, pt1.y - pt0.y);
      }
    },
    [getChartPoint, onPan, resolveTooltip]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<SVGGElement>) => {
      if (event.touches.length === 1) {
        const pt = getChartPoint(event, 0);
        if (pt === null) {
          return;
        }
        const start = touchStartRef.current;
        if (start && Math.hypot(pt.x - start.x, pt.y - start.y) > 8) {
          cancelLongPress();
        }
        if (crosshairModeRef.current) {
          const tooltip = resolveTooltip(pt.x, pt.y);
          if (tooltip) {
            setTooltipData(tooltip);
          }
          return;
        }
        if (isPanningRef.current && onPan) {
          const deltaX = panLastXRef.current - pt.x;
          panAccumulatorRef.current += deltaX;
          const candlesMoved = Math.trunc(panAccumulatorRef.current / pixelsPerCandle);
          if (candlesMoved !== 0) {
            onPan(candlesMoved);
            panAccumulatorRef.current -= candlesMoved * pixelsPerCandle;
          }
          panLastXRef.current = pt.x;
        }
      } else if (event.touches.length === 2) {
        cancelLongPress();
        const pt0 = getChartPoint(event, 0);
        const pt1 = getChartPoint(event, 1);
        if (pt0 === null || pt1 === null || !onZoom) {
          return;
        }
        const dist = Math.hypot(pt1.x - pt0.x, pt1.y - pt0.y);
        const prev = pinchDistRef.current;
        if (prev > 0 && dist > 0 && Math.abs(dist - prev) > 4) {
          const center = (pt0.x + pt1.x) / 2;
          onZoom(prev / dist, Math.max(0, Math.min(1, center / innerWidth)));
          pinchDistRef.current = dist;
        }
      }
    },
    [getChartPoint, onPan, onZoom, innerWidth, pixelsPerCandle, resolveTooltip]
  );

  const handleTouchEnd = useCallback(() => {
    cancelLongPress();
    setTooltipData(null);
    isPanningRef.current = false;
    crosshairModeRef.current = false;
    panAccumulatorRef.current = 0;
    pinchDistRef.current = 0;
    setSelection(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const interactionHandlers = canInteract
    ? {
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
        onMouseDown: handleMouseDown,
        onMouseUp: handleMouseUp,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
      }
    : {};

  const interactionStyle: React.CSSProperties = {
    cursor: canInteract
      ? isPanningRef.current
        ? "grabbing"
        : "crosshair"
      : "default",
    touchAction: "none",
  };

  return {
    tooltipData,
    setTooltipData,
    selection,
    clearSelection,
    interactionHandlers,
    interactionStyle,
  };
}
