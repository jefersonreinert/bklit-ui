// drawing-engine.ts — Types, hit-testing, and utilities for SVG chart drawings
// Adapted from bklit-ui Canvas engine for Visx SVG index-based scales

// ─── Types ────────────────────────────────────────────────────────────────────

export type DrawToolType =
  | "trendline"
  | "ray"
  | "extendedline"
  | "hline"
  | "hray"
  | "vline"
  | "crossline"
  | "arrow"
  | "parallel_channel"
  | "rectangle"
  | "fibonacci"
  | "text"
  | "price_label"
  | "measure"

export interface DrawingStyle {
  color: string
  fillColor: string
  lineWidth: 1 | 2 | 3 | 4
  lineStyle: "solid" | "dashed" | "dotted"
  fontSize: number
  fontBold: boolean
  fontItalic: boolean
  showLabels: boolean
}

export const DEFAULT_STYLE: DrawingStyle = {
  color: "#2962ff",
  fillColor: "rgba(41,98,255,0.08)",
  lineWidth: 1,
  lineStyle: "solid",
  fontSize: 12,
  fontBold: false,
  fontItalic: false,
  showLabels: true,
}

/** A drawing anchor in chart-space coordinates */
export interface DrawPoint {
  price: number
  /** Time in ms (anchors drawings across pans and timeframes). */
  index: number
}

export interface Drawing {
  id: string
  type: DrawToolType
  points: DrawPoint[]
  label?: string
  style: DrawingStyle
  visible: boolean
  locked: boolean
}

export interface Point {
  x: number
  y: number
}

// ─── Tool metadata ────────────────────────────────────────────────────────────

/** How many click-points each tool needs to complete */
export function getRequiredPoints(type: DrawToolType): number {
  switch (type) {
    case "hline":
    case "vline":
    case "crossline":
    case "text":
    case "price_label":
      return 1
    case "parallel_channel":
      return 3
    default:
      return 2
  }
}

// ─── Coordinate conversion (using Visx scales) ───────────────────────────────

export function pixelToPoint(
  px: number,
  py: number,
  xScale: { invert: (v: number) => number },
  yScale: { invert: (v: number) => number },
): DrawPoint {
  return {
    index: xScale.invert(px),
    price: yScale.invert(py),
  }
}

export function pointToPixel(
  p: DrawPoint,
  xScale: (v: number) => number | undefined,
  yScale: (v: number) => number | undefined,
): Point {
  return {
    x: xScale(p.index) ?? 0,
    y: yScale(p.price) ?? 0,
  }
}

// ─── Line style → SVG stroke-dasharray ────────────────────────────────────────

export function getDashArray(style: DrawingStyle): string | undefined {
  switch (style.lineStyle) {
    case "dashed":
      return `${6 * style.lineWidth},4`
    case "dotted":
      return "2,4"
    default:
      return undefined
  }
}

// ─── Shift-constrain (45°, horizontal, vertical) ──────────────────────────────

export function constrainToAngle(anchor: Point, current: Point): Point {
  const dx = current.x - anchor.x
  const dy = current.y - anchor.y
  const angle = Math.atan2(dy, dx)
  const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  const dist = Math.hypot(dx, dy)
  return {
    x: anchor.x + Math.cos(snap) * dist,
    y: anchor.y + Math.sin(snap) * dist,
  }
}

// ─── Line extension helpers ───────────────────────────────────────────────────

export function extendToEdges(p1: Point, p2: Point, w: number, h: number): [Point, Point] {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  if (Math.abs(dx) < 0.001) return [{ x: p1.x, y: 0 }, { x: p1.x, y: h }]
  const slope = dy / dx
  return [
    { x: 0, y: p1.y - slope * p1.x },
    { x: w, y: p1.y + slope * (w - p1.x) },
  ]
}

export function extendRight(p1: Point, p2: Point, w: number, h: number): Point {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  if (Math.abs(dx) < 0.001) return { x: p1.x, y: dy >= 0 ? h : 0 }
  const slope = dy / dx
  return { x: w, y: p1.y + slope * (w - p1.x) }
}

// ─── Hit testing ──────────────────────────────────────────────────────────────

// Fingers need a larger hit area than a mouse
const COARSE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches
const HIT = COARSE ? 16 : 8

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function hitTest(
  drawing: Drawing,
  mx: number,
  my: number,
  xScale: (v: number) => number | undefined,
  yScale: (v: number) => number | undefined,
  chartW: number,
  chartH: number,
): boolean {
  if (!drawing.visible) return false
  const pts = drawing.points.map(p => pointToPixel(p, xScale, yScale))
  const p1 = pts[0]
  if (!p1) return false
  const p2 = pts[1]
  const p = { x: mx, y: my }

  switch (drawing.type) {
    case "hline":
      return Math.abs(my - p1.y) < HIT

    case "hray":
      return Math.abs(my - p1.y) < HIT && mx >= p1.x - HIT

    case "vline":
      return Math.abs(mx - p1.x) < HIT

    case "crossline":
      return Math.abs(my - p1.y) < HIT || Math.abs(mx - p1.x) < HIT

    case "trendline":
    case "arrow":
      if (!p2) return false
      return distToSegment(p, p1, p2) < HIT

    case "ray": {
      if (!p2) return false
      const far = extendRight(p1, p2, chartW, chartH)
      return distToSegment(p, p1, far) < HIT
    }

    case "extendedline": {
      if (!p2) return false
      const [e1, e2] = extendToEdges(p1, p2, chartW, chartH)
      return distToSegment(p, e1, e2) < HIT
    }

    case "rectangle":
    case "measure": {
      if (!p2) return false
      const minX = Math.min(p1.x, p2.x)
      const maxX = Math.max(p1.x, p2.x)
      const minY = Math.min(p1.y, p2.y)
      const maxY = Math.max(p1.y, p2.y)
      const onBorder =
        ((Math.abs(mx - minX) < HIT || Math.abs(mx - maxX) < HIT) && my >= minY - HIT && my <= maxY + HIT) ||
        ((Math.abs(my - minY) < HIT || Math.abs(my - maxY) < HIT) && mx >= minX - HIT && mx <= maxX + HIT)
      const inside = mx >= minX && mx <= maxX && my >= minY && my <= maxY
      return onBorder || inside
    }

    case "fibonacci": {
      if (!p2) return false
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
      const priceRange = drawing.points[0]!.price - drawing.points[1]!.price
      for (const lvl of levels) {
        const price = drawing.points[1]!.price + lvl * priceRange
        const ly = yScale(price) ?? 0
        if (Math.abs(my - ly) < HIT) return true
      }
      return distToSegment(p, p1, p2) < HIT
    }

    case "parallel_channel": {
      if (!p2) return false
      const onLine1 = distToSegment(p, p1, p2) < HIT
      const p3 = pts[2]
      if (!p3) return onLine1
      const offset = p3.y - p1.y
      const q1 = { x: p1.x, y: p1.y + offset }
      const q2 = { x: p2.x, y: p2.y + offset }
      return onLine1 || distToSegment(p, q1, q2) < HIT
    }

    case "text":
    case "price_label": {
      const tw = (drawing.label?.length ?? 5) * drawing.style.fontSize * 0.62 + 8
      const th = drawing.style.fontSize + 10
      return mx >= p1.x - 4 && mx <= p1.x + tw && my >= p1.y - th / 2 && my <= p1.y + th / 2
    }

    default:
      return false
  }
}

// ─── Handle positions ─────────────────────────────────────────────────────────

export function getHandlePositions(
  drawing: Drawing,
  xScale: (v: number) => number | undefined,
  yScale: (v: number) => number | undefined,
): Point[] {
  const pts = drawing.points.map(p => pointToPixel(p, xScale, yScale))
  switch (drawing.type) {
    case "hline":
    case "hray":
    case "crossline":
    case "text":
    case "price_label":
      return pts.slice(0, 1)
    case "vline":
      return pts.slice(0, 1)
    case "rectangle":
    case "measure": {
      const p1 = pts[0]
      const p2 = pts[1]
      if (!(p1 && p2)) return pts.slice(0, 1)
      return [p1, p2, { x: p1.x, y: p2.y }, { x: p2.x, y: p1.y }]
    }
    default:
      return pts.slice(0, 2)
  }
}

export function hitTestHandle(
  drawing: Drawing,
  mx: number,
  my: number,
  xScale: (v: number) => number | undefined,
  yScale: (v: number) => number | undefined,
): number {
  const handles = getHandlePositions(drawing, xScale, yScale)
  for (let i = 0; i < handles.length; i++) {
    const r = COARSE ? 16 : 6
    if (Math.abs(mx - handles[i]!.x) <= r && Math.abs(my - handles[i]!.y) <= r) return i
  }
  return -1
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatPrice(price: number): string {
  const absPrice = Math.abs(price)
  if (absPrice >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (absPrice >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  if (absPrice >= 0.0001) return price.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })
  return price.toString()
}

// ─── Label for tool panel mapping ─────────────────────────────────────────────

export const TOOL_LABEL_TO_TYPE: Record<string, DrawToolType> = {
  // Lines
  "Trend Line": "trendline",
  "Ray": "ray",
  "Extended Line": "extendedline",
  "Horizontal Line": "hline",
  "Horizontal Ray": "hray",
  "Vertical Line": "vline",
  "Cross Line": "crossline",
  "Arrow": "arrow",
  // Shapes
  "Parallel Channel": "parallel_channel",
  "Rectangle": "rectangle",
  // Fibonacci
  "Fib Retracement": "fibonacci",
  "Fibonacci Retracement": "fibonacci",
  // Text
  "Text": "text",
  "Price Label": "price_label",
  // Measure
  "Measure": "measure",
  "Price Range": "measure",
  "Date and Price Range": "measure",
}
