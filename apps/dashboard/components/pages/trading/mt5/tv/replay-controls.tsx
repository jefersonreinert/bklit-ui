import {
  Play, Pause, Square, SkipForward, SkipBack,
  ChevronFirst, ChevronLast, Gauge
} from "lucide-react";
import { cn } from "@/lib/utils";
import { settingsToIANA } from "../lib/timezone";
import type { ReplaySpeed, ReplayState } from "./use-replay";

const SPEEDS: ReplaySpeed[] = [1, 2, 5, 10, 50];

interface ReplayControlsProps {
  replay: ReplayState & {
    start: (fromIndex?: number) => void;
    stop: () => void;
    togglePlay: () => void;
    setSpeed: (speed: ReplaySpeed) => void;
    jumpTo: (index: number) => void;
    stepForward: () => void;
    stepBackward: () => void;
  };
  symbol: string;
  precision?: number;
  timezone?: string;
}

function formatDate(ts: number, tz?: string): string {
  const d = new Date(ts);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short", day: "numeric", year: "numeric",
  };
  if (tz) opts.timeZone = settingsToIANA(tz);
  return d.toLocaleDateString("en-US", opts);
}

function formatTime(ts: number, tz?: string): string {
  const d = new Date(ts);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  };
  if (tz) opts.timeZone = settingsToIANA(tz);
  return d.toLocaleTimeString("en-US", opts);
}

export function ReplayControls({ replay, symbol, precision = 5, timezone }: ReplayControlsProps) {
  const { active, playing, cursor, total, speed, currentCandle, progress } = replay;

  if (!active) return null;

  const isUp = currentCandle
    ? currentCandle.close >= currentCandle.open
    : true;

  return (
    <div className="absolute top-0 left-0 right-0 z-30 flex overflow-x-auto no-scrollbar items-center h-9 px-3 bg-card/95 backdrop-blur-sm border-b border-[var(--border)] gap-2 select-none">
      {/* Transport controls */}
      <div className="flex items-center gap-0.5">
        {/* Go to start */}
        <button
          onClick={() => replay.jumpTo(0)}
          className="h-6 w-6 flex items-center justify-center text-[var(--fg-muted)] hover:text-foreground cursor-pointer transition-colors rounded-sm hover:bg-muted"
          title="Go to start"
        >
          <ChevronFirst className="w-3.5 h-3.5" />
        </button>

        {/* Step back */}
        <button
          onClick={replay.stepBackward}
          className="h-6 w-6 flex items-center justify-center text-[var(--fg-muted)] hover:text-foreground cursor-pointer transition-colors rounded-sm hover:bg-muted"
          title="Step back"
        >
          <SkipBack className="w-3 h-3" />
        </button>

        {/* Play / Pause */}
        <button
          onClick={replay.togglePlay}
          className={cn(
            "h-7 w-7 flex items-center justify-center rounded-sm cursor-pointer transition-all",
            playing
              ? "bg-accent text-white"
              : "bg-foreground text-background hover:opacity-90"
          )}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>

        {/* Step forward */}
        <button
          onClick={replay.stepForward}
          className="h-6 w-6 flex items-center justify-center text-[var(--fg-muted)] hover:text-foreground cursor-pointer transition-colors rounded-sm hover:bg-muted"
          title="Step forward"
        >
          <SkipForward className="w-3 h-3" />
        </button>

        {/* Go to end */}
        <button
          onClick={() => replay.jumpTo(total - 1)}
          className="h-6 w-6 flex items-center justify-center text-[var(--fg-muted)] hover:text-foreground cursor-pointer transition-colors rounded-sm hover:bg-muted"
          title="Go to end"
        >
          <ChevronLast className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-[var(--border)]" />

      {/* Speed selector */}
      <div className="flex items-center gap-0.5">
        <Gauge className="w-3 h-3 text-[var(--fg-muted)] mr-0.5" />
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => replay.setSpeed(s)}
            className={cn(
              "h-5 px-1.5 text-[9px] font-black rounded-sm cursor-pointer transition-all",
              speed === s
                ? "bg-accent text-white"
                : "text-[var(--fg-muted)] hover:text-foreground hover:bg-muted"
            )}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-[var(--border)]" />

      {/* Progress scrubber */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <input
          type="range"
          min={0}
          max={total - 1}
          value={cursor}
          onChange={(e) => replay.jumpTo(Number(e.target.value))}
          className="flex-1 h-1 appearance-none bg-[var(--border)] rounded-full cursor-pointer accent-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <span className="text-[9px] font-mono text-[var(--fg-muted)] whitespace-nowrap">
          {cursor + 1} / {total}
        </span>
      </div>

      <div className="w-px h-4 bg-[var(--border)]" />

      {/* OHLC tooltip for current replay candle */}
      {currentCandle && (
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono whitespace-nowrap">
          <span className="text-[var(--fg-muted)]">{formatDate(currentCandle.time, timezone)}</span>
          <span className="text-accent font-black">{formatTime(currentCandle.time, timezone)}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--fg-muted)]">O</span>
            <span className="text-foreground">{currentCandle.open.toFixed(precision)}</span>
            <span className="text-[var(--fg-muted)]">H</span>
            <span className="text-up font-bold">{currentCandle.high.toFixed(precision)}</span>
            <span className="text-[var(--fg-muted)]">L</span>
            <span className="text-down font-bold">{currentCandle.low.toFixed(precision)}</span>
            <span className="text-[var(--fg-muted)]">C</span>
            <span className={cn("font-black", isUp ? "text-up" : "text-down")}>
              {currentCandle.close.toFixed(precision)}
            </span>
          </div>
        </div>
      )}

      <div className="w-px h-4 bg-[var(--border)]" />

      {/* Stop / Exit */}
      <button
        onClick={replay.stop}
        className="h-6 px-2 flex items-center gap-1 text-[10px] font-black text-down hover:bg-down/10 rounded-sm cursor-pointer transition-colors border border-down/30 hover:border-down"
        title="Exit replay"
      >
        <Square className="w-2.5 h-2.5" />
        EXIT
      </button>
    </div>
  );
}
