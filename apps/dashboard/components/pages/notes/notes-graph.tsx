"use client";

import { useEffect, useRef } from "react";
import type { GraphEdge, GraphNode, GraphNodeKind } from "@/lib/notes/links";

/**
 * Force-directed graph of notes, tags and unresolved links on a canvas:
 * nodes repel, links pull, everything settles with a soft glow. Pan with a
 * drag on the background, zoom with the wheel/pinch, drag nodes, tap to open.
 */

const COLORS: Record<GraphNodeKind, string> = {
  note: "#9cc46b",
  tag: "#d4a27f",
  ghost: "#8a8a8a",
};
const ACTIVE = "#d97757";
const REST = 120;
const REPULSION = 6000;
const SPRING = 0.02;
const GRAVITY = 0.012;
const DAMPING = 0.82;
const MIN_ALPHA = 0.003;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
}

type SimEdge = [SimNode, SimNode];

interface View {
  x: number;
  y: number;
  k: number;
}

const radius = (n: GraphNode) =>
  n.kind === "note" ? 4 + Math.sqrt(n.degree) * 2.4 : 3 + Math.sqrt(n.degree);

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/* ------------------------------- simulation ------------------------------ */

function repel(nodes: SimNode[], alpha: number) {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i] as SimNode;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j] as SimNode;
      const dx = b.x - a.x || 0.01;
      const dy = b.y - a.y || 0.01;
      const d2 = Math.max(dx * dx + dy * dy, 25);
      const d = Math.sqrt(d2);
      const f = (REPULSION / d2) * alpha;
      a.vx -= (dx / d) * f;
      a.vy -= (dy / d) * f;
      b.vx += (dx / d) * f;
      b.vy += (dy / d) * f;
    }
  }
}

function attract(edges: SimEdge[], alpha: number) {
  for (const [a, b] of edges) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - REST) * SPRING * alpha;
    a.vx += (dx / d) * f;
    a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f;
    b.vy -= (dy / d) * f;
  }
}

function integrate(nodes: SimNode[], alpha: number) {
  for (const n of nodes) {
    if (n.fixed) {
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx = (n.vx - n.x * GRAVITY * alpha) * DAMPING;
    n.vy = (n.vy - n.y * GRAVITY * alpha) * DAMPING;
    n.x += n.vx;
    n.y += n.vy;
  }
}

/* --------------------------------- drawing ------------------------------- */

interface Frame {
  ctx: CanvasRenderingContext2D;
  view: View;
  ink: string;
  lit: SimNode | null;
  near: Set<string>;
  active: string | null;
  t: number;
}

function edgeAlpha(on: boolean, anyLit: boolean) {
  if (on) {
    return 0.8;
  }
  return anyLit ? 0.06 : 0.16;
}

function drawEdges(f: Frame, edges: SimEdge[]) {
  const { ctx, view, lit } = f;
  for (const [a, b] of edges) {
    const on = Boolean(lit && (a === lit || b === lit));
    ctx.strokeStyle = on ? ACTIVE : f.ink;
    ctx.globalAlpha = edgeAlpha(on, Boolean(lit));
    ctx.lineWidth = (on ? 1.6 : 0.8) / view.k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function glow(dim: boolean, active: boolean) {
  if (dim) {
    return 0;
  }
  return active ? 22 : 10;
}

function drawLabel(f: Frame, n: SimNode, r: number) {
  const { ctx, view } = f;
  const close = f.near.has(n.id);
  if (!(view.k > 1.1 || close || n.degree >= 4)) {
    return;
  }
  const scale = Math.max(view.k, 0.6);
  ctx.globalAlpha = close || view.k > 1.4 ? 0.95 : 0.6;
  ctx.fillStyle = f.ink;
  ctx.font = `${(close ? 12 : 10.5) / scale}px ui-sans-serif, system-ui`;
  ctx.textAlign = "center";
  ctx.fillText(n.label, n.x, n.y + r + 13 / scale);
}

function drawNode(f: Frame, n: SimNode) {
  const { ctx, view } = f;
  const active = n.id === f.active;
  const dim = Boolean(f.lit) && !f.near.has(n.id);
  const pulse = active ? 1.35 + Math.sin(f.t / 400) * 0.08 : 1;
  const r = radius(n) * pulse;
  const color = active ? ACTIVE : COLORS[n.kind];
  ctx.globalAlpha = dim ? 0.18 : 1;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow(dim, active);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  if (n.kind === "ghost") {
    ctx.lineWidth = 1.2 / view.k;
    ctx.stroke();
  } else {
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  if (!dim) {
    drawLabel(f, n, r);
  }
}

function neighborhood(lit: SimNode | null, edges: SimEdge[]) {
  const near = new Set<string>();
  if (!lit) {
    return near;
  }
  near.add(lit.id);
  for (const [a, b] of edges) {
    if (a === lit || b === lit) {
      near.add(a.id);
      near.add(b.id);
    }
  }
  return near;
}

/* ------------------------------- controller ------------------------------ */

interface Drag {
  node: SimNode | null;
  sx: number;
  sy: number;
  vx: number;
  vy: number;
  moved: boolean;
}

class GraphController {
  nodes: SimNode[] = [];
  edges: SimEdge[] = [];
  active: string | null = null;
  alpha = 1;
  onOpen: (n: GraphNode) => void = () => undefined;
  private readonly view: View = { x: 0, y: 0, k: 1 };
  private readonly size = { w: 0, h: 0 };
  private ink = "#888";
  private hover: SimNode | null = null;
  private drag: Drag | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; k: number } | null = null;
  private raf = 0;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly el: HTMLCanvasElement;

  constructor(el: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.el = el;
    this.ctx = ctx;
  }

  resize = () => {
    const rect = this.el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.size.w = rect.width;
    this.size.h = rect.height;
    this.el.width = rect.width * dpr;
    this.el.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ink = getComputedStyle(this.el).color;
  };

  start() {
    const loop = (t: number) => {
      this.tick(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  private tick(t: number) {
    if (this.alpha > MIN_ALPHA) {
      repel(this.nodes, this.alpha);
      attract(this.edges, this.alpha);
      integrate(this.nodes, this.alpha);
      this.alpha *= 0.985;
    }
    const { ctx, size, view } = this;
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.translate(size.w / 2 + view.x, size.h / 2 + view.y);
    ctx.scale(view.k, view.k);
    const lit =
      this.hover ?? this.nodes.find((n) => n.id === this.active) ?? null;
    const frame: Frame = {
      ctx,
      view,
      ink: this.ink,
      lit,
      near: neighborhood(lit, this.edges),
      active: this.active,
      t,
    };
    drawEdges(frame, this.edges);
    for (const n of this.nodes) {
      drawNode(frame, n);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private toWorld(cx: number, cy: number) {
    const rect = this.el.getBoundingClientRect();
    return {
      x: (cx - rect.left - this.size.w / 2 - this.view.x) / this.view.k,
      y: (cy - rect.top - this.size.h / 2 - this.view.y) / this.view.k,
    };
  }

  private hit(cx: number, cy: number) {
    const p = this.toWorld(cx, cy);
    let best: SimNode | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < radius(n) + 8 / this.view.k && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
  }

  down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.pinch = { d: this.pinchDistance(), k: this.view.k };
      this.drag = null;
      return;
    }
    const node = this.hit(e.clientX, e.clientY);
    if (node) {
      node.fixed = true;
    }
    this.drag = {
      node,
      sx: e.clientX,
      sy: e.clientY,
      vx: this.view.x,
      vy: this.view.y,
      moved: false,
    };
  };

  move = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (this.pinch && this.pointers.size === 2) {
      this.view.k = clampZoom(
        this.pinch.k * (this.pinchDistance() / this.pinch.d)
      );
      return;
    }
    const drag = this.drag;
    if (!drag) {
      this.hover = this.hit(e.clientX, e.clientY);
      this.el.style.cursor = this.hover ? "pointer" : "grab";
      return;
    }
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    drag.moved ||= Math.hypot(dx, dy) > 4;
    if (drag.node) {
      const p = this.toWorld(e.clientX, e.clientY);
      drag.node.x = p.x;
      drag.node.y = p.y;
      this.alpha = Math.max(this.alpha, 0.3);
    } else {
      this.view.x = drag.vx + dx;
      this.view.y = drag.vy + dy;
    }
  };

  up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.pinch = null;
    }
    const drag = this.drag;
    if (drag?.node) {
      drag.node.fixed = false;
      if (!drag.moved) {
        this.onOpen(drag.node);
      }
    }
    this.drag = null;
  };

  wheel = (e: WheelEvent) => {
    e.preventDefault();
    const { view, size } = this;
    const k = clampZoom(view.k * Math.exp(-e.deltaY / 400));
    const rect = this.el.getBoundingClientRect();
    const mx = e.clientX - rect.left - size.w / 2;
    const my = e.clientY - rect.top - size.h / 2;
    view.x = mx - ((mx - view.x) * k) / view.k;
    view.y = my - ((my - view.y) * k) / view.k;
    view.k = k;
  };

  leave = () => {
    this.hover = null;
  };
}

/** Keeps positions of nodes that survive a data change. */
function mergeNodes(prev: Map<string, SimNode>, graphNodes: GraphNode[]) {
  return graphNodes.map((g, i) => {
    const old = prev.get(g.id);
    if (old) {
      return Object.assign(old, g);
    }
    const angle = (i / Math.max(graphNodes.length, 1)) * Math.PI * 2;
    return {
      ...g,
      x: Math.cos(angle) * 160,
      y: Math.sin(angle) * 160,
      vx: 0,
      vy: 0,
      fixed: false,
    };
  });
}

export function NotesGraph({
  nodes,
  edges,
  activeId,
  onOpen,
  className,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  activeId: string | null;
  onOpen: (node: GraphNode) => void;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<GraphController | null>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!(el && ctx)) {
      return;
    }
    const c = new GraphController(el, ctx);
    controller.current = c;
    const ro = new ResizeObserver(c.resize);
    ro.observe(el);
    c.resize();
    c.start();
    el.addEventListener("pointerdown", c.down);
    el.addEventListener("pointermove", c.move);
    el.addEventListener("pointerup", c.up);
    el.addEventListener("pointercancel", c.up);
    el.addEventListener("pointerleave", c.leave);
    el.addEventListener("wheel", c.wheel, { passive: false });
    return () => {
      c.stop();
      ro.disconnect();
      el.removeEventListener("pointerdown", c.down);
      el.removeEventListener("pointermove", c.move);
      el.removeEventListener("pointerup", c.up);
      el.removeEventListener("pointercancel", c.up);
      el.removeEventListener("pointerleave", c.leave);
      el.removeEventListener("wheel", c.wheel);
      controller.current = null;
    };
  }, []);

  // Feed new data into the running simulation and reheat it
  useEffect(() => {
    const c = controller.current;
    if (!c) {
      return;
    }
    const merged = mergeNodes(new Map(c.nodes.map((n) => [n.id, n])), nodes);
    const byId = new Map(merged.map((n) => [n.id, n]));
    c.nodes = merged;
    c.edges = edges
      .map((e) => [byId.get(e.source), byId.get(e.target)] as const)
      .filter((e): e is SimEdge => Boolean(e[0] && e[1]));
    c.alpha = Math.max(c.alpha, 0.6);
  }, [nodes, edges]);

  useEffect(() => {
    if (controller.current) {
      controller.current.active = activeId;
      controller.current.onOpen = onOpen;
    }
  });

  return (
    <canvas
      aria-label="Grafo de notas"
      className={className ?? "h-full w-full touch-none text-foreground"}
      ref={canvas}
    />
  );
}
