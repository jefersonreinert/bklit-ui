import { useCallback, useEffect, useRef, useState } from "react";
import type { Candle } from "../engine/ChartEngine";

export type ReplaySpeed = 1 | 2 | 5 | 10 | 50;

export interface ReplayState {
  /** Is replay mode active? */
  active: boolean;
  /** Is replay currently playing (vs paused)? */
  playing: boolean;
  /** Current candle index in the full history */
  cursor: number;
  /** Total candles in replay data */
  total: number;
  /** Playback speed multiplier */
  speed: ReplaySpeed;
  /** The sliced data up to the replay cursor (what the chart shows) */
  replayData: Candle[];
  /** Current candle being replayed */
  currentCandle: Candle | null;
  /** Progress 0-1 */
  progress: number;
}

export interface UseReplayOptions {
  /** Full historical data to replay */
  fullData: Candle[];
  /** Active timeframe (for calculating interval) */
  activeTF: string;
}

export interface UseReplayReturn extends ReplayState {
  /** Start replay from a specific candle index */
  start: (fromIndex?: number) => void;
  /** Stop and exit replay mode */
  stop: () => void;
  /** Toggle play/pause */
  togglePlay: () => void;
  /** Set playback speed */
  setSpeed: (speed: ReplaySpeed) => void;
  /** Jump to a specific index */
  jumpTo: (index: number) => void;
  /** Step forward one candle */
  stepForward: () => void;
  /** Step backward one candle */
  stepBackward: () => void;
}

/** Base interval per timeframe in ms (for 1x speed) */
function getBaseInterval(tf: string): number {
  // Make replay feel smooth — not real-time speed but fast enough
  switch (tf) {
    case "1s": return 100;
    case "3s": return 150;
    case "1m": return 200;
    case "5m": return 250;
    case "15m": return 300;
    case "30m": return 350;
    case "1h": return 400;
    case "4h": return 500;
    case "D": return 600;
    case "W": return 700;
    default: return 250;
  }
}

export function useReplay({ fullData, activeTF }: UseReplayOptions): UseReplayReturn {
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [replayData, setReplayData] = useState<Candle[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorRef = useRef(0);
  const fullDataRef = useRef(fullData);

  // Keep ref in sync
  useEffect(() => {
    fullDataRef.current = fullData;
  }, [fullData]);

  // Sync cursor ref
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Advance one candle
  const advance = useCallback(() => {
    const data = fullDataRef.current;
    const cur = cursorRef.current;
    if (cur >= data.length - 1) {
      // Reached end
      clearTimer();
      setPlaying(false);
      return;
    }
    const next = cur + 1;
    cursorRef.current = next;
    setCursor(next);
    setReplayData(data.slice(0, next + 1));
  }, [clearTimer]);

  // Start/stop playback timer
  useEffect(() => {
    if (!active || !playing) {
      clearTimer();
      return;
    }

    const interval = Math.max(20, getBaseInterval(activeTF) / speed);
    timerRef.current = setInterval(advance, interval);

    return clearTimer;
  }, [active, playing, speed, activeTF, advance, clearTimer]);

  const start = useCallback((fromIndex?: number) => {
    const data = fullDataRef.current;
    if (data.length === 0) return;
    // Default: start from 20% into the data, showing the first chunk
    const startIdx = fromIndex ?? Math.max(0, Math.floor(data.length * 0.2));
    cursorRef.current = startIdx;
    setCursor(startIdx);
    setReplayData(data.slice(0, startIdx + 1));
    setActive(true);
    setPlaying(false);
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    setActive(false);
    setPlaying(false);
    setCursor(0);
    setReplayData([]);
  }, [clearTimer]);

  const togglePlay = useCallback(() => {
    setPlaying(p => !p);
  }, []);

  const jumpTo = useCallback((index: number) => {
    const data = fullDataRef.current;
    const clamped = Math.max(0, Math.min(data.length - 1, index));
    cursorRef.current = clamped;
    setCursor(clamped);
    setReplayData(data.slice(0, clamped + 1));
  }, []);

  const stepForward = useCallback(() => {
    const data = fullDataRef.current;
    if (cursorRef.current < data.length - 1) {
      jumpTo(cursorRef.current + 1);
    }
  }, [jumpTo]);

  const stepBackward = useCallback(() => {
    if (cursorRef.current > 0) {
      jumpTo(cursorRef.current - 1);
    }
  }, [jumpTo]);

  const total = fullData.length;
  const currentCandle = active && replayData.length > 0 ? replayData[replayData.length - 1] : null;
  const progress = total > 0 ? cursor / (total - 1) : 0;

  return {
    active,
    playing,
    cursor,
    total,
    speed,
    replayData,
    currentCandle: currentCandle ?? null,
    progress,
    start,
    stop,
    togglePlay,
    setSpeed,
    jumpTo,
    stepForward,
    stepBackward,
  };
}
