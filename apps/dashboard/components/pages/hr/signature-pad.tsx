"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Draw a signature with a finger or mouse. Reports a PNG data URL (black
 * ink on transparent) or null when cleared.
 */
export function SignaturePad({
  onChange,
}: {
  onChange: (png: string | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
    }
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!(drawing.current && ctx)) {
      return;
    }
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    inked.current = true;
    setEmpty(false);
  };

  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) {
      return;
    }
    drawing.current = false;
    if (inked.current) {
      onChange(e.currentTarget.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const c = ref.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    inked.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        aria-label="Assine aqui"
        className="h-40 w-full touch-none rounded-xl border-2 border-dashed bg-white"
        onPointerCancel={up}
        onPointerDown={down}
        onPointerLeave={up}
        onPointerMove={move}
        onPointerUp={up}
        ref={ref}
      />
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>
          {empty ? "Assine com o dedo no quadro acima." : "Assinatura feita."}
        </span>
        <Button onClick={clear} size="sm" type="button" variant="ghost">
          Limpar
        </Button>
      </div>
    </div>
  );
}
