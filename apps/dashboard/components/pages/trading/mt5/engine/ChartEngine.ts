export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartSettings {
  bodyUp: string;
  bodyDown: string;
  wickUp: string;
  wickDown: string;
  borderUp: string;
  borderDown: string;
  gridEnabled: boolean;
  gridColor: string;
  background: string;
  precision: number;
  timezone: string;
}

export const DEFAULT_SETTINGS: ChartSettings = {
  bodyUp: '#e0d8c8',
  bodyDown: '#000000',
  wickUp: '#000000',
  wickDown: '#000000',
  borderUp: '#000000',
  borderDown: '#000000',
  gridEnabled: true,
  gridColor: '#d5ccbb',
  background: '#f3ede4',
  precision: 5,
  timezone: '(UTC-3) Sao Paulo'
};

/**
 * @deprecated The ChartEngine (Canvas) has been replaced by SVGChart.
 * This file is kept for type definitions.
 */
export class ChartEngine {
  constructor(_canvas: HTMLCanvasElement) {
    console.warn('ChartEngine is deprecated. Use SVGChart component instead.');
  }
  setData(_data: Candle[]) {}
  updateSettings(_settings: ChartSettings) {}
  draw() {}
}
