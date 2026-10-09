// drawing-layer.tsx — SVG overlay for rendering & interacting with chart drawings
import { useCallback, useMemo, useRef, useState } from "react"
import { localPoint } from "@visx/event"
import { useChart } from "../charts/chart-context"
import {
  type Drawing,
  type DrawToolType,
  type DrawPoint,
  type Point,
  DEFAULT_STYLE,
  getRequiredPoints,
  pixelToPoint,
  pointToPixel,
  getDashArray,
  hitTest,
  hitTestHandle,
  getHandlePositions,
  extendToEdges,
  extendRight,
  formatPrice,
  constrainToAngle,
} from "./drawing-engine"

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DrawingLayerProps {
  drawings: Drawing[]
  selectedId: string | null
  activeTool: DrawToolType | null
  onDrawingsChange: (drawings: Drawing[]) => void
  onSelectedChange: (id: string | null) => void
  onToolDone: () => void // called when a drawing is completed
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DrawingLayer({
  drawings,
  selectedId,
  activeTool,
  onDrawingsChange,
  onSelectedChange,
  onToolDone,
}: DrawingLayerProps) {
  const { xScale: xVisible, yScale, innerWidth, innerHeight, margin, fullData, viewStart = 0 } = useChart()

  // Drawings are anchored to time: map time ↔ fractional candle index of the
  // whole series, then to the visible window (so they stay put when panning)
  const times = useMemo(
    () => (fullData ?? []).map(d => (d.date as Date).getTime()),
    [fullData],
  )
  const xScale = useMemo(() => {
    const n = times.length
    const step = n > 1 ? times[n - 1]! - times[n - 2]! : 60_000
    const timeToIdx = (t: number) => {
      if (n === 0) return 0
      if (t <= times[0]!) return (t - times[0]!) / step
      if (t >= times[n - 1]!) return n - 1 + (t - times[n - 1]!) / step
      let lo = 0
      let hi = n - 1
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        if (times[mid]! <= t) lo = mid
        else hi = mid
      }
      const a = times[lo]!
      const b = times[hi]!
      return lo + (b > a ? (t - a) / (b - a) : 0)
    }
    const idxToTime = (i: number) => {
      if (n === 0) return 0
      if (i <= 0) return times[0]! + i * step
      if (i >= n - 1) return times[n - 1]! + (i - (n - 1)) * step
      const lo = Math.floor(i)
      return times[lo]! + (i - lo) * (times[lo + 1]! - times[lo]!)
    }
    const scale = (t: number) => xVisible(timeToIdx(t) - viewStart)
    scale.invert = (px: number) => idxToTime(xVisible.invert(px) + viewStart)
    scale.bars = (a: number, b: number) => Math.abs(Math.round(timeToIdx(a) - timeToIdx(b)))
    return scale
  }, [times, xVisible, viewStart])

  // In-progress drawing state
  const [tempPoints, setTempPoints] = useState<DrawPoint[]>([])
  const [mousePos, setMousePos] = useState<Point | null>(null)

  // Drag state
  const dragRef = useRef<{
    drawingId: string
    handleIdx: number // -1 = move whole drawing
    startMouse: Point
    startPoints: DrawPoint[]
  } | null>(null)

  // ─── Coordinate helpers ──────────────────────────────────────────────────

  const toChartPoint = useCallback(
    (e: React.MouseEvent<SVGRectElement>): Point | null => {
      const svg = e.currentTarget.ownerSVGElement
      if (!svg) return null
      const pt = localPoint(svg, e)
      if (!pt) return null
      return { x: pt.x - margin.left, y: pt.y - margin.top }
    },
    [margin.left, margin.top],
  )

  const pxToDP = useCallback(
    (px: number, py: number): DrawPoint => pixelToPoint(px, py, xScale, yScale),
    [xScale, yScale],
  )

  const dpToPx = useCallback(
    (p: DrawPoint): Point => pointToPixel(p, xScale, yScale),
    [xScale, yScale],
  )

  const xS = useCallback((v: number) => xScale(v) ?? 0, [xScale])
  const yS = useCallback((v: number) => yScale(v) ?? 0, [yScale])

  // ─── Mouse handlers ──────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (e.button !== 0) return
      const pt = toChartPoint(e)
      if (!pt) return

      // If we have an active tool, we're placing points
      if (activeTool) {
        const dp = pxToDP(pt.x, pt.y)
        const newPoints = [...tempPoints, dp]
        const required = getRequiredPoints(activeTool)

        if (newPoints.length >= required) {
          // Drawing complete
          const drawing: Drawing = {
            id: crypto.randomUUID(),
            type: activeTool,
            points: newPoints,
            style: { ...DEFAULT_STYLE },
            visible: true,
            locked: false,
            label: activeTool === "text" ? "Text" : undefined,
          }
          onDrawingsChange([...drawings, drawing])
          onSelectedChange(drawing.id)
          setTempPoints([])
          setMousePos(null)
          onToolDone()
        } else {
          setTempPoints(newPoints)
        }
        e.stopPropagation()
        return
      }

      // No active tool — check if clicking on an existing drawing
      // Check handles first (for selected drawing)
      if (selectedId) {
        const selDrawing = drawings.find(d => d.id === selectedId)
        if (selDrawing && !selDrawing.locked) {
          const handleIdx = hitTestHandle(selDrawing, pt.x, pt.y, xS, yS)
          if (handleIdx >= 0) {
            dragRef.current = {
              drawingId: selectedId,
              handleIdx,
              startMouse: pt,
              startPoints: selDrawing.points.map(p => ({ ...p })),
            }
            e.stopPropagation()
            return
          }
        }
      }

      // Check hit on any drawing (reverse order = top first)
      for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i]
        if (!d) continue
        if (hitTest(d, pt.x, pt.y, xS, yS, innerWidth, innerHeight)) {
          onSelectedChange(d.id)
          if (!d.locked) {
            dragRef.current = {
              drawingId: d.id,
              handleIdx: -1,
              startMouse: pt,
              startPoints: d.points.map(p => ({ ...p })),
            }
          }
          e.stopPropagation()
          return
        }
      }

      // Clicked empty space — deselect
      onSelectedChange(null)
    },
    [activeTool, tempPoints, drawings, selectedId, toChartPoint, pxToDP, xS, yS, innerWidth, innerHeight, onDrawingsChange, onSelectedChange, onToolDone],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const pt = toChartPoint(e)
      if (!pt) return

      setMousePos(pt)

      // Dragging a handle or moving a drawing
      if (dragRef.current) {
        const { drawingId, handleIdx, startMouse, startPoints } = dragRef.current
        const dx = pt.x - startMouse.x
        const dy = pt.y - startMouse.y
        const drawing = drawings.find(d => d.id === drawingId)
        if (!drawing) return

        let newPoints: DrawPoint[]

        if (handleIdx === -1) {
          // Move whole drawing
          newPoints = startPoints.map(sp => {
            const px = dpToPx(sp)
            return pxToDP(px.x + dx, px.y + dy)
          })
        } else {
          // Move specific handle
          newPoints = startPoints.map((sp, i) => {
            if (i !== handleIdx) return sp
            const px = dpToPx(sp)
            return pxToDP(px.x + dx, px.y + dy)
          })

          // Rectangle corner handles (2 & 3) need to update both points
          if ((drawing.type === "rectangle" || drawing.type === "measure") && handleIdx >= 2) {
            newPoints = startPoints.map(sp => ({ ...sp }))
            const px0 = dpToPx(startPoints[0]!)
            const px1 = dpToPx(startPoints[1]!)
            if (handleIdx === 2) {
              // BL corner
              newPoints[0] = pxToDP(px0.x + dx, px0.y)
              newPoints[1] = pxToDP(px1.x, px1.y + dy)
            } else {
              // TR corner
              newPoints[0] = pxToDP(px0.x, px0.y + dy)
              newPoints[1] = pxToDP(px1.x + dx, px1.y)
            }
          }
        }

        const updated = drawings.map(d =>
          d.id === drawingId ? { ...d, points: newPoints } : d,
        )
        onDrawingsChange(updated)
        e.stopPropagation()
      }
    },
    [toChartPoint, drawings, dpToPx, pxToDP, onDrawingsChange],
  )

  const handleMouseUp = useCallback(() => {
    dragRef.current = null
  }, [])

  // ─── Key handler (Delete) ───────────────────────────────────────────────

  // Handled via window event in parent (App.tsx)

  // ─── Render helpers ─────────────────────────────────────────────────────

  const renderDrawingSVG = (drawing: Drawing, isSelected: boolean, previewMouse?: Point) => {
    if (!drawing.visible) return null
    const pts = drawing.points.map(p => dpToPx(p))
    const p1 = pts[0]
    if (!p1) return null
    const p2 = pts[1] ?? previewMouse ?? p1
    const { style } = drawing
    const dash = getDashArray(style)
    const key = drawing.id

    switch (drawing.type) {
      // ── Horizontal line ──────────────────────────────────────────────
      case "hline":
        return (
          <g key={key}>
            <line x1={0} y1={p1.y} x2={innerWidth} y2={p1.y}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
            {style.showLabels && (
              <text x={4} y={p1.y - 4} fill={style.color} fontSize={10} fontFamily="monospace" opacity={0.65}>
                {formatPrice(drawing.points[0]!.price)}
              </text>
            )}
          </g>
        )

      // ── Horizontal ray ───────────────────────────────────────────────
      case "hray":
        return (
          <g key={key}>
            <line x1={p1.x} y1={p1.y} x2={innerWidth} y2={p1.y}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
          </g>
        )

      // ── Vertical line ────────────────────────────────────────────────
      case "vline":
        return (
          <g key={key}>
            <line x1={p1.x} y1={0} x2={p1.x} y2={innerHeight}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
          </g>
        )

      // ── Cross line ───────────────────────────────────────────────────
      case "crossline":
        return (
          <g key={key}>
            <line x1={0} y1={p1.y} x2={innerWidth} y2={p1.y}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
            <line x1={p1.x} y1={0} x2={p1.x} y2={innerHeight}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
            {style.showLabels && (
              <text x={p1.x + 4} y={p1.y - 4} fill={style.color} fontSize={10} fontFamily="monospace" opacity={0.65}>
                {formatPrice(drawing.points[0]!.price)}
              </text>
            )}
          </g>
        )

      // ── Trend line ───────────────────────────────────────────────────
      case "trendline":
        return (
          <g key={key}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
          </g>
        )

      // ── Ray ──────────────────────────────────────────────────────────
      case "ray": {
        const far = pts[1] ? extendRight(p1, pts[1], innerWidth, innerHeight) : p2
        return (
          <g key={key}>
            <line x1={p1.x} y1={p1.y} x2={far.x} y2={far.y}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
          </g>
        )
      }

      // ── Extended line ────────────────────────────────────────────────
      case "extendedline": {
        const ref2 = pts[1] ?? p2
        const [e1, e2] = extendToEdges(p1, ref2, innerWidth, innerHeight)
        return (
          <g key={key}>
            <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
          </g>
        )
      }

      // ── Arrow ────────────────────────────────────────────────────────
      case "arrow": {
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
        const len = Math.max(8, style.lineWidth * 5)
        const a1 = { x: p2.x - len * Math.cos(angle - Math.PI / 6), y: p2.y - len * Math.sin(angle - Math.PI / 6) }
        const a2 = { x: p2.x - len * Math.cos(angle + Math.PI / 6), y: p2.y - len * Math.sin(angle + Math.PI / 6) }
        return (
          <g key={key}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
            <line x1={p2.x} y1={p2.y} x2={a1.x} y2={a1.y}
              stroke={style.color} strokeWidth={style.lineWidth} />
            <line x1={p2.x} y1={p2.y} x2={a2.x} y2={a2.y}
              stroke={style.color} strokeWidth={style.lineWidth} />
          </g>
        )
      }

      // ── Rectangle ────────────────────────────────────────────────────
      case "rectangle": {
        const rx = Math.min(p1.x, p2.x)
        const ry = Math.min(p1.y, p2.y)
        const rw = Math.abs(p2.x - p1.x)
        const rh = Math.abs(p2.y - p1.y)
        return (
          <g key={key}>
            <rect x={rx} y={ry} width={rw} height={rh}
              fill={style.color} fillOpacity={0.06}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
          </g>
        )
      }

      // ── Measure ──────────────────────────────────────────────────────
      case "measure": {
        const rx = Math.min(p1.x, p2.x)
        const ry = Math.min(p1.y, p2.y)
        const rw = Math.abs(p2.x - p1.x)
        const rh = Math.abs(p2.y - p1.y)
        const priceDiff = pts[1] ? drawing.points[0]!.price - drawing.points[1]!.price : 0
        const indexDiff = pts[1] ? xScale.bars(drawing.points[0]!.index, drawing.points[1]!.index) : 0
        const pct = pts[1] && drawing.points[1]!.price !== 0
          ? (priceDiff / drawing.points[1]!.price) * 100 : 0
        const label = `${priceDiff >= 0 ? "+" : ""}${formatPrice(priceDiff)}  (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)  ${indexDiff}bars`
        return (
          <g key={key}>
            <rect x={rx} y={ry} width={rw} height={rh}
              fill={style.color} fillOpacity={0.08}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />
            {pts[1] && style.showLabels && (
              <text x={rx + rw / 2} y={ry + rh / 2} fill={style.color}
                fontSize={10} fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">
                {label}
              </text>
            )}
          </g>
        )
      }

      // ── Fibonacci retracement ─────────────────────────────────────────
      case "fibonacci": {
        if (!drawing.points[1] && !previewMouse) return null
        const anchorPrice = drawing.points[1]?.price ??
          (previewMouse ? pxToDP(previewMouse.x, previewMouse.y).price : drawing.points[0]!.price)
        const priceRange = drawing.points[0]!.price - anchorPrice
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
        const leftX = Math.min(p1.x, p2.x)

        return (
          <g key={key}>
            {levels.map(lvl => {
              const price = anchorPrice + lvl * priceRange
              const ly = yS(price)
              return (
                <g key={lvl}>
                  <line x1={leftX} y1={ly} x2={innerWidth - 1} y2={ly}
                    stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash}
                    opacity={lvl === 0 || lvl === 1 ? 1 : 0.55} />
                  {style.showLabels && (
                    <text x={leftX + 4} y={ly - 4} fill={style.color}
                      fontSize={10} fontFamily="monospace" opacity={0.8}>
                      {`${(lvl * 100).toFixed(1)}%  ${formatPrice(price)}`}
                    </text>
                  )}
                </g>
              )
            })}
            {/* Connector */}
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={style.color} strokeWidth={1} strokeDasharray="3,3" opacity={0.4} />
          </g>
        )
      }

      // ── Parallel channel ─────────────────────────────────────────────
      case "parallel_channel": {
        const p3 = pts[2]
        const elements: React.ReactNode[] = []
        // Main line
        elements.push(
          <line key="main" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />,
        )
        if (p3) {
          const offset = p3.y - p1.y
          const q1 = { x: p1.x, y: p1.y + offset }
          const q2 = { x: p2.x, y: p2.y + offset }
          elements.push(
            <line key="par" x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray={dash} />,
          )
          // End caps
          elements.push(
            <line key="cap1" x1={p1.x} y1={p1.y} x2={q1.x} y2={q1.y}
              stroke={style.color} strokeWidth={1} strokeDasharray="4,4" opacity={0.5} />,
          )
          elements.push(
            <line key="cap2" x1={p2.x} y1={p2.y} x2={q2.x} y2={q2.y}
              stroke={style.color} strokeWidth={1} strokeDasharray="4,4" opacity={0.5} />,
          )
          // Fill
          elements.push(
            <polygon key="fill"
              points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${q2.x},${q2.y} ${q1.x},${q1.y}`}
              fill={style.color} fillOpacity={0.05} />,
          )
        } else if (previewMouse) {
          const offset = previewMouse.y - p1.y
          elements.push(
            <line key="preview" x1={p1.x} y1={p1.y + offset} x2={p2.x} y2={p2.y + offset}
              stroke={style.color} strokeWidth={style.lineWidth} strokeDasharray="4,4" opacity={0.4} />,
          )
        }
        return <g key={key}>{elements}</g>
      }

      // ── Text ─────────────────────────────────────────────────────────
      case "text": {
        if (!drawing.label) return null
        const fontStyle = `${style.fontBold ? "bold " : ""}${style.fontItalic ? "italic " : ""}`.trim()
        return (
          <g key={key}>
            <text x={p1.x} y={p1.y} fill={style.color}
              fontSize={style.fontSize} fontFamily="monospace"
              fontWeight={style.fontBold ? "bold" : "normal"}
              fontStyle={style.fontItalic ? "italic" : "normal"}
              dominantBaseline="middle">
              {drawing.label}
            </text>
          </g>
        )
      }

      // ── Price label ───────────────────────────────────────────────────
      case "price_label": {
        const label = drawing.label ?? formatPrice(drawing.points[0]!.price)
        const tw = label.length * style.fontSize * 0.62 + 10
        const th = style.fontSize + 8
        return (
          <g key={key}>
            <rect x={p1.x} y={p1.y - th / 2} width={tw} height={th}
              fill={style.color} rx={2} />
            <text x={p1.x + 5} y={p1.y} fill="#000"
              fontSize={style.fontSize} fontFamily="monospace"
              fontWeight={style.fontBold ? "bold" : "normal"}
              dominantBaseline="middle">
              {label}
            </text>
            {/* Horizontal guide */}
            <line x1={innerWidth} y1={p1.y} x2={p1.x + tw} y2={p1.y}
              stroke={style.color} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
          </g>
        )
      }

      default:
        return null
    }
  }

  // Selection handles
  const renderHandles = (drawing: Drawing) => {
    const handles = getHandlePositions(drawing, xS, yS)
    return handles.map((h, i) => (
      <rect key={`handle-${i}`}
        x={h.x - 4} y={h.y - 4} width={8} height={8}
        fill="#080808" stroke={drawing.style.color} strokeWidth={1}
        style={{ cursor: "pointer" }} />
    ))
  }

  // In-progress preview
  const renderPreview = () => {
    if (!activeTool || tempPoints.length === 0 || !mousePos) return null
    const previewDrawing: Drawing = {
      id: "__preview__",
      type: activeTool,
      points: tempPoints,
      style: { ...DEFAULT_STYLE },
      visible: true,
      locked: false,
      label: activeTool === "text" ? "Text" : undefined,
    }
    return renderDrawingSVG(previewDrawing, false, mousePos)
  }

  // ─── Cursor ──────────────────────────────────────────────────────────────

  const cursor = activeTool
    ? "crosshair"
    : dragRef.current
      ? "grabbing"
      : "crosshair"

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <g className="drawing-layer">
      {/* Invisible event capture rect — sits on top of chart but below drawings visually */}
      <rect
        x={0} y={0}
        width={innerWidth} height={innerHeight}
        fill="transparent"
        style={{ cursor, pointerEvents: "all" }}
        onPointerDown={handleMouseDown}
        onPointerMove={handleMouseMove}
        onPointerUp={handleMouseUp}
        onPointerCancel={handleMouseUp}
        // While placing or dragging a drawing, don't pan the chart (pointer
        // events run first, so dragRef is already set here)
        onMouseDown={e => { if (activeTool || dragRef.current) e.stopPropagation() }}
        onTouchStart={e => { if (activeTool || dragRef.current) e.stopPropagation() }}
        onTouchMove={e => { if (activeTool || dragRef.current) e.stopPropagation() }}
      />

      {/* Render all drawings (hit-testing happens on the rect above) */}
      <g style={{ pointerEvents: "none" }}>
        {drawings.map(d => (
          <g key={d.id}>
            {renderDrawingSVG(d, d.id === selectedId)}
            {d.id === selectedId && renderHandles(d)}
          </g>
        ))}
      </g>

      {/* In-progress preview */}
      {renderPreview()}
    </g>
  )
}
