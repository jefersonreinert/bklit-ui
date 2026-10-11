"use client";

import {
  type CSSProperties,
  memo,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import iconData from "@/lib/icons/icon-data.json";
import {
  boxStyle,
  iconSvg,
  shapeSvg,
  textStyle,
} from "@/lib/menu-canvas/model";
import type {
  Design,
  DesignElement,
  DesignPage,
  TextElement,
} from "@/lib/menu-canvas/types";
import { cn } from "@/lib/utils";

/**
 * The page being edited: renders every element at its position and lets
 * the user select (shift for several), drag, resize from the 8 handles,
 * rotate from the top handle and double-click texts to type, with snap
 * guides to the page and the other elements.
 */

const ICONS = iconData as Record<string, string>;
const SNAP = 6;
const ROTATE_SNAP = 4;

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: { id: Handle; sx: number; sy: number; style: CSSProperties }[] =
  [
    {
      id: "nw",
      sx: -1,
      sy: -1,
      style: { left: 0, top: 0, cursor: "nwse-resize" },
    },
    {
      id: "n",
      sx: 0,
      sy: -1,
      style: { left: "50%", top: 0, cursor: "ns-resize" },
    },
    {
      id: "ne",
      sx: 1,
      sy: -1,
      style: { left: "100%", top: 0, cursor: "nesw-resize" },
    },
    {
      id: "e",
      sx: 1,
      sy: 0,
      style: { left: "100%", top: "50%", cursor: "ew-resize" },
    },
    {
      id: "se",
      sx: 1,
      sy: 1,
      style: { left: "100%", top: "100%", cursor: "nwse-resize" },
    },
    {
      id: "s",
      sx: 0,
      sy: 1,
      style: { left: "50%", top: "100%", cursor: "ns-resize" },
    },
    {
      id: "sw",
      sx: -1,
      sy: 1,
      style: { left: 0, top: "100%", cursor: "nesw-resize" },
    },
    {
      id: "w",
      sx: -1,
      sy: 0,
      style: { left: 0, top: "50%", cursor: "ew-resize" },
    },
  ];

interface Guides {
  x: number[];
  y: number[];
}

type Gesture =
  | {
      kind: "move";
      startX: number;
      startY: number;
      origin: Map<string, { x: number; y: number }>;
      before: DesignPage;
    }
  | {
      kind: "resize";
      handle: (typeof HANDLES)[number];
      startX: number;
      startY: number;
      el: DesignElement;
      height: number;
      before: DesignPage;
    }
  | {
      kind: "rotate";
      cx: number;
      cy: number;
      el: DesignElement;
      before: DesignPage;
    };

export interface StageProps {
  design: Design;
  page: DesignPage;
  scale: number;
  selected: string[];
  editingId: string | null;
  onSelect: (ids: string[]) => void;
  onEdit: (id: string | null) => void;
  /** Live change (no history entry). */
  onLive: (page: DesignPage) => void;
  /** Finished change: `before` goes to the undo history. */
  onCommit: (page: DesignPage, before: DesignPage) => void;
}

/** Edges and centers an element can snap to. */
function snapTargets(design: Design, page: DesignPage, skip: Set<string>) {
  const xs = [0, design.width / 2, design.width];
  const ys = [0, design.height / 2, design.height];
  for (const e of page.elements) {
    if (skip.has(e.id) || e.hidden) {
      continue;
    }
    xs.push(e.x, e.x + e.w / 2, e.x + e.w);
    if (e.type === "text") {
      ys.push(e.y);
    } else {
      ys.push(e.y, e.y + e.h / 2, e.y + e.h);
    }
  }
  return { xs, ys };
}

/** Best snap offset for the given edges, and the guide it lines up with. */
function snapAxis(edges: number[], targets: number[], tolerance: number) {
  let best: { delta: number; at: number } | null = null;
  for (const edge of edges) {
    for (const t of targets) {
      const d = t - edge;
      if (
        Math.abs(d) <= tolerance &&
        (!best || Math.abs(d) < Math.abs(best.delta))
      ) {
        best = { delta: d, at: t };
      }
    }
  }
  return best;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function resized(
  g: Extract<Gesture, { kind: "resize" }>,
  dx: number,
  dy: number,
  keepRatio: boolean
): DesignElement {
  const { el, handle } = g;
  const cos = Math.cos(rad(el.rotation));
  const sin = Math.sin(rad(el.rotation));
  // Pointer delta in the element's own (rotated) axes
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const h0 = g.height;
  let w = Math.max(8, el.w + handle.sx * lx);
  let h = Math.max(4, h0 + handle.sy * ly);
  const corner = handle.sx !== 0 && handle.sy !== 0;
  if (corner && keepRatio) {
    const k = Math.max(w / el.w, h / h0);
    w = el.w * k;
    h = h0 * k;
  }
  const dw = w - el.w;
  const dh = h - h0;
  // Keep the opposite edge in place: the center moves half the growth
  const cxl = (handle.sx * dw) / 2;
  const cyl = (handle.sy * dh) / 2;
  const cx = el.x + el.w / 2 + cxl * cos - cyl * sin;
  const cy = el.y + h0 / 2 + cxl * sin + cyl * cos;
  const next = { ...el, x: cx - w / 2, y: cy - h / 2, w, h };
  if (el.type === "text") {
    if (corner) {
      const k = w / el.w;
      return {
        ...(next as TextElement),
        fontSize: Math.max(4, Math.round(el.fontSize * k * 10) / 10),
        letterSpacing: el.letterSpacing * k,
      };
    }
    // Side handles only change the text width
    return { ...next, y: el.y, h: el.h } as TextElement;
  }
  return next as DesignElement;
}

type MoveGesture = Extract<Gesture, { kind: "move" }>;

/** Bounding box of the elements being moved, at their start position. */
function startBox(g: MoveGesture, moving: DesignElement[]) {
  const at = (m: DesignElement) => g.origin.get(m.id) ?? { x: m.x, y: m.y };
  return {
    left: Math.min(...moving.map((m) => at(m).x)),
    top: Math.min(...moving.map((m) => at(m).y)),
    right: Math.max(...moving.map((m) => at(m).x + m.w)),
    bottom: Math.max(
      ...moving.map((m) => at(m).y + (m.type === "text" ? 0 : m.h))
    ),
    textOnly: moving.every((m) => m.type === "text"),
  };
}

function moveStep(
  g: MoveGesture,
  e: PointerEvent,
  cur: DesignPage,
  design: Design,
  scale: number
) {
  let dx = (e.clientX - g.startX) / scale;
  let dy = (e.clientY - g.startY) / scale;
  const moving = cur.elements.filter((x) => g.origin.has(x.id));
  const guides: Guides = { x: [], y: [] };
  if (!e.altKey && moving.length) {
    const b = startBox(g, moving);
    const targets = snapTargets(design, cur, new Set(g.origin.keys()));
    const sx = snapAxis(
      [b.left + dx, (b.left + b.right) / 2 + dx, b.right + dx],
      targets.xs,
      SNAP / scale
    );
    const sy = snapAxis(
      b.textOnly
        ? [b.top + dy]
        : [b.top + dy, (b.top + b.bottom) / 2 + dy, b.bottom + dy],
      targets.ys,
      SNAP / scale
    );
    if (sx) {
      dx += sx.delta;
      guides.x.push(sx.at);
    }
    if (sy) {
      dy += sy.delta;
      guides.y.push(sy.at);
    }
  }
  return {
    guides,
    page: {
      ...cur,
      elements: cur.elements.map((x) => {
        const o = g.origin.get(x.id);
        return o
          ? { ...x, x: Math.round(o.x + dx), y: Math.round(o.y + dy) }
          : x;
      }),
    },
  };
}

function resizeStep(
  g: Extract<Gesture, { kind: "resize" }>,
  e: PointerEvent,
  cur: DesignPage,
  scale: number
): DesignPage {
  const dx = (e.clientX - g.startX) / scale;
  const dy = (e.clientY - g.startY) / scale;
  // Images and icons keep their proportions unless Shift is held
  const fixed = g.el.type === "image" || g.el.type === "icon";
  const next = resized(g, dx, dy, fixed ? !e.shiftKey : e.shiftKey);
  return {
    ...cur,
    elements: cur.elements.map((x) => (x.id === g.el.id ? next : x)),
  };
}

function rotateStep(
  g: Extract<Gesture, { kind: "rotate" }>,
  e: PointerEvent,
  cur: DesignPage
): DesignPage {
  let angle =
    (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180) / Math.PI + 90;
  angle = ((angle + 540) % 360) - 180;
  const nearest = Math.round(angle / 45) * 45;
  if (e.shiftKey) {
    angle = Math.round(angle / 15) * 15;
  } else if (Math.abs(angle - nearest) < ROTATE_SNAP) {
    angle = nearest;
  }
  return {
    ...cur,
    elements: cur.elements.map((x) =>
      x.id === g.el.id ? { ...x, rotation: Math.round(angle) } : x
    ),
  };
}

const ElementView = memo(function ElementView({
  el,
  editing,
  onTextDone,
}: {
  el: DesignElement;
  editing: boolean;
  onTextDone: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (editing && node) {
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  switch (el.type) {
    case "text":
      return editing ? (
        // biome-ignore lint/a11y/useSemanticElements: rich inline editing needs contentEditable
        <div
          className="outline-none"
          contentEditable
          onBlur={(e) => onTextDone(e.currentTarget.innerText)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          ref={ref}
          role="textbox"
          style={textStyle(el) as CSSProperties}
          suppressContentEditableWarning
          tabIndex={0}
        >
          {el.text}
        </div>
      ) : (
        <div style={textStyle(el) as CSSProperties}>{el.text || " "}</div>
      );
    case "image":
      return el.src ? (
        // biome-ignore lint/performance/noImgElement: user images on a free canvas
        <img
          alt=""
          className="pointer-events-none size-full select-none"
          draggable={false}
          height={el.h}
          src={el.src}
          style={{
            objectFit: el.fit,
            borderRadius: el.radius,
            border: el.borderWidth
              ? `${el.borderWidth}px solid ${el.borderColor || "#000"}`
              : undefined,
            transform: el.flipX ? "scaleX(-1)" : undefined,
          }}
          width={el.w}
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-black/10 text-xs">
          Imagem
        </div>
      );
    case "shape":
      return (
        <div
          className="size-full"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG built from escaped numbers/colors
          dangerouslySetInnerHTML={{ __html: shapeSvg(el) }}
        />
      );
    case "icon":
      return (
        <div
          className="size-full"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: bundled icon paths
          dangerouslySetInnerHTML={{
            __html: iconSvg(el, ICONS[el.icon] ?? ""),
          }}
        />
      );
    default:
      return null;
  }
});

export function DesignStage({
  design,
  page,
  scale,
  selected,
  editingId,
  onSelect,
  onEdit,
  onLive,
  onCommit,
}: StageProps) {
  const gesture = useRef<Gesture | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });

  const finish = () => {
    const g = gesture.current;
    gesture.current = null;
    setGuides({ x: [], y: [] });
    if (g && pageRef.current !== g.before) {
      onCommit(pageRef.current, g.before);
    }
  };

  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) {
      return;
    }
    const cur = pageRef.current;
    if (g.kind === "move") {
      const r = moveStep(g, e, cur, design, scale);
      setGuides(r.guides);
      onLive(r.page);
      return;
    }
    onLive(
      g.kind === "resize" ? resizeStep(g, e, cur, scale) : rotateStep(g, e, cur)
    );
  };

  const listen = () => {
    const up = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      finish();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const startMove = (e: ReactPointerEvent, el: DesignElement) => {
    if (e.button !== 0 || editingId === el.id) {
      return;
    }
    e.stopPropagation();
    let ids = selected;
    if (e.shiftKey || e.metaKey) {
      ids = selected.includes(el.id)
        ? selected.filter((x) => x !== el.id)
        : [...selected, el.id];
    } else if (!selected.includes(el.id)) {
      ids = [el.id];
    }
    onSelect(ids);
    const movable = page.elements.filter(
      (x) => ids.includes(x.id) && !x.locked
    );
    if (movable.length === 0) {
      return;
    }
    gesture.current = {
      kind: "move",
      startX: e.clientX,
      startY: e.clientY,
      origin: new Map(movable.map((m) => [m.id, { x: m.x, y: m.y }])),
      before: page,
    };
    listen();
  };

  const startResize = (
    e: ReactPointerEvent,
    el: DesignElement,
    handle: (typeof HANDLES)[number]
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const node = (e.currentTarget as HTMLElement).parentElement;
    gesture.current = {
      kind: "resize",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      el,
      height: el.type === "text" ? (node?.offsetHeight ?? el.h) : el.h,
      before: page,
    };
    listen();
  };

  const startRotate = (e: ReactPointerEvent, el: DesignElement) => {
    e.stopPropagation();
    e.preventDefault();
    const box = (
      e.currentTarget as HTMLElement
    ).parentElement?.getBoundingClientRect();
    if (!box) {
      return;
    }
    gesture.current = {
      kind: "rotate",
      cx: box.left + box.width / 2,
      cy: box.top + box.height / 2,
      el,
      before: page,
    };
    listen();
  };

  const single =
    selected.length === 1
      ? page.elements.find((x) => x.id === selected[0])
      : undefined;
  const handleSize = 10 / scale;

  return (
    <div
      className="relative shrink-0 shadow-xl ring-1 ring-black/10"
      style={{ width: design.width * scale, height: design.height * scale }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left overflow-hidden"
        onPointerDown={() => {
          onSelect([]);
          onEdit(null);
        }}
        style={{
          width: design.width,
          height: design.height,
          transform: `scale(${scale})`,
          background: page.background,
          backgroundImage: page.backgroundImage
            ? `url("${page.backgroundImage}")`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {page.elements.map((el) =>
          el.hidden ? null : (
            // biome-ignore lint/a11y/noStaticElementInteractions: canvas element, keyboard handled by the editor
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: canvas element, keyboard handled by the editor
            <div
              className={cn(
                "touch-none",
                el.locked ? "cursor-default" : "cursor-move",
                selected.includes(el.id) &&
                  "outline outline-[#8b5cf6] outline-offset-0"
              )}
              data-el={el.id}
              key={el.id}
              onDoubleClick={() => {
                if (el.type === "text" && !el.locked) {
                  onEdit(el.id);
                }
              }}
              onPointerDown={(e) => startMove(e, el)}
              style={{
                ...(boxStyle(el) as CSSProperties),
                outlineWidth: selected.includes(el.id) ? 2 / scale : 0,
              }}
            >
              <ElementView
                editing={editingId === el.id}
                el={el}
                onTextDone={(text) => {
                  onEdit(null);
                  if (el.type === "text" && text !== el.text) {
                    const before = pageRef.current;
                    onCommit(
                      {
                        ...before,
                        elements: before.elements.map((x) =>
                          x.id === el.id ? { ...x, text } : x
                        ),
                      },
                      before
                    );
                  }
                }}
              />
              {single?.id === el.id && !el.locked && editingId !== el.id ? (
                <>
                  {HANDLES.filter(
                    (h) => el.type !== "text" || h.sy === 0 || h.sx !== 0
                  ).map((h) => (
                    <span
                      aria-hidden
                      className="absolute rounded-full border border-[#8b5cf6] bg-white"
                      key={h.id}
                      onPointerDown={(e) => startResize(e, el, h)}
                      style={{
                        ...h.style,
                        width: handleSize,
                        height: handleSize,
                        marginLeft: -handleSize / 2,
                        marginTop: -handleSize / 2,
                        borderWidth: 1.5 / scale,
                      }}
                    />
                  ))}
                  <span
                    aria-hidden
                    className="absolute left-1/2 flex items-center justify-center rounded-full border border-[#8b5cf6] bg-white"
                    onPointerDown={(e) => startRotate(e, el)}
                    style={{
                      top: -32 / scale,
                      width: handleSize * 1.6,
                      height: handleSize * 1.6,
                      marginLeft: -handleSize * 0.8,
                      borderWidth: 1.5 / scale,
                      cursor: "grab",
                    }}
                  />
                </>
              ) : null}
            </div>
          )
        )}
        {guides.x.map((x) => (
          <span
            className="pointer-events-none absolute top-0 bg-[#ec4899]"
            key={`gx${x}`}
            style={{ left: x, width: 1 / scale, height: design.height }}
          />
        ))}
        {guides.y.map((y) => (
          <span
            className="pointer-events-none absolute left-0 bg-[#ec4899]"
            key={`gy${y}`}
            style={{ top: y, height: 1 / scale, width: design.width }}
          />
        ))}
      </div>
    </div>
  );
}
