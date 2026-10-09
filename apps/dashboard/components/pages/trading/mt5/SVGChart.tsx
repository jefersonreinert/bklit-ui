import { useMemo } from "react";
import useMeasure from "react-use-measure";
import {
  CandlestickChart,
  Candlestick,
  Grid,
  XAxis,
  YAxis,
  ChartTooltip,
  LivePriceLine,
  Crosshair,
  useChart,
} from "./charts";
import type { Candle, ChartSettings } from "./engine/ChartEngine";
import { DrawingLayer, type DrawingLayerProps } from "./tv/drawing-layer";
import { formatTooltipDate, tzShortLabel } from "./lib/timezone";

interface SVGChartProps {
  data: Candle[];
  settings: ChartSettings;
  activeTF?: string;
  drawingProps?: DrawingLayerProps;
  goToDate?: Date | null;
  /** When true, auto-scroll follows the last candle (replay mode) */
  followLast?: boolean;
}

/** Phones: one line of OHLC at the top instead of the floating tooltip. */
function OhlcLegend({ precision }: { precision: number }) {
  const { tooltipData, data } = useChart();
  const point = (tooltipData?.point ?? data[data.length - 1]) as
    | { open: number; high: number; low: number; close: number }
    | undefined;
  if (!point) return null;
  const color = point.close >= point.open ? "var(--up)" : "var(--down)";
  const item = (k: string, v: number) => (
    <tspan>
      <tspan fill="var(--fg-muted)">{k} </tspan>
      <tspan fill={color}>{v.toFixed(precision)}  </tspan>
    </tspan>
  );
  return (
    <text x={4} y={-6} fontSize={10} className="select-none font-mono" style={{ whiteSpace: "pre" }}>
      {item("O", point.open)}
      {item("H", point.high)}
      {item("L", point.low)}
      {item("C", point.close)}
    </text>
  );
}

export function SVGChart({ data, settings, drawingProps, goToDate, followLast }: SVGChartProps) {
  const [ref, bounds] = useMeasure();
  // Convert MT5 Candle[] to OHLCDataPoint[]
  const ohlcData = useMemo(() =>
    data.map(c => ({
      date: new Date(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
    [data]
  );

  const precision = settings.precision ?? 5;
  const timezone = settings.timezone || "";
  const tzLabel = tzShortLabel(timezone);
  const compact = bounds.width > 0 && bounds.width < 640;

  // Right axis wide enough for the longest price label
  const right = useMemo(() => {
    let max = 0;
    for (const c of data) if (c.high > max) max = c.high;
    return Math.ceil(max.toFixed(precision).length * 7.2) + 18;
  }, [data, precision]);

  if (ohlcData.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--fg-muted)] font-black uppercase text-[10px] tracking-widest opacity-30">
        Loading symbol data...
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="w-full h-full select-none"
      style={{ background: settings.background }}
    >
      <CandlestickChart
        data={ohlcData}
        animationDuration={0}
        zoomable
        margin={{ top: compact ? 18 : 20, right, bottom: 30, left: compact ? 4 : 10 }}
        goToDate={goToDate}
        followLast={followLast}
      >
        {settings.gridEnabled ? (
          <Grid stroke={settings.gridColor} strokeOpacity={0.3} vertical horizontal />
        ) : null}

        <Candlestick
          animate={false}
          positiveFill={settings.bodyUp}
          negativeFill={settings.bodyDown}
          positiveWickFill={settings.wickUp}
          negativeWickFill={settings.wickDown}
          positiveBorder={settings.borderUp}
          negativeBorder={settings.borderDown}
        />

        <LivePriceLine precision={precision} />

        <Crosshair />

        {compact ? (
          <OhlcLegend precision={precision} />
        ) : (
          <ChartTooltip
            showCrosshair={false}
            showDatePill={false}
            rows={(point) => {
              if (!point) return [];
              const date = point.date as Date;
              const dateStr = timezone
                ? formatTooltipDate(date, timezone)
                : date.toLocaleString("pt-BR");
              const isUp = (point.close as number) >= (point.open as number);
              const color = isUp ? "var(--up)" : "var(--down)";
              return [
                { label: dateStr + (tzLabel ? ` ${tzLabel}` : ""), value: "", color: "var(--fg-muted)" },
                { label: "Abertura", value: (point.open as number).toFixed(precision), color: "var(--fg-muted)" },
                { label: "Máxima", value: (point.high as number).toFixed(precision), color: "var(--up)" },
                { label: "Mínima", value: (point.low as number).toFixed(precision), color: "var(--down)" },
                { label: "Fechamento", value: (point.close as number).toFixed(precision), color: color },
              ];
            }}
          />
        )}

        {/* Drawing layer — rendered above candles/crosshair */}
        {drawingProps && <DrawingLayer {...drawingProps} />}

        <XAxis numTicks={Math.max(2, Math.floor((bounds.width || 800) / 120))} timezone={timezone} />

        <YAxis
          position="right"
          numTicks={Math.max(4, Math.floor((bounds.height || 600) / 70))}
          formatValue={(v) => v.toFixed(precision)}
        />
      </CandlestickChart>
    </div>
  );
}
