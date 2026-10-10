"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CellarWine } from "@/lib/cellar/types";
import { renderMenuHtml } from "@/lib/menu-studio/render";
import { PAPER_SIZES } from "@/lib/menu-studio/templates";
import type { MenuDoc } from "@/lib/menu-studio/types";

const MM_TO_PX = 96 / 25.4;

/** The menu at real paper size, scaled down to fit the panel. */
export function MenuPreview({
  doc,
  wines,
}: {
  doc: MenuDoc;
  wines: CellarWine[];
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [boxWidth, setBoxWidth] = useState(600);
  const [height, setHeight] = useState(1123);

  const paper = PAPER_SIZES[doc.style.paper];
  const pageMm = doc.style.landscape ? paper.h : paper.w;
  const pageWidth = Math.round(pageMm * MM_TO_PX);
  const scale = Math.min(1, boxWidth / pageWidth);

  const html = useMemo(
    () => renderMenuHtml(doc, wines, { preview: true }),
    [doc, wines]
  );

  useEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        setBoxWidth(entry.contentRect.width);
      }
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // Fit the frame to the menu's height (again once web fonts arrive)
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    const measure = () => {
      // The page itself, so the frame can also shrink when content goes
      const page = frame.contentDocument?.querySelector(".page");
      if (page instanceof HTMLElement) {
        setHeight(page.offsetHeight);
      }
    };
    const onLoad = () => {
      measure();
      frame.contentDocument?.fonts?.ready.then(measure).catch(() => undefined);
    };
    frame.addEventListener("load", onLoad);
    return () => frame.removeEventListener("load", onLoad);
  }, []);

  return (
    <div className="w-full" ref={boxRef}>
      <div
        className="overflow-hidden rounded-lg shadow-lg ring-1 ring-border"
        style={{ height: height * scale, width: pageWidth * scale }}
      >
        <iframe
          className="origin-top-left border-0 bg-white"
          ref={frameRef}
          sandbox="allow-same-origin"
          srcDoc={html}
          style={{
            height,
            transform: `scale(${scale})`,
            width: pageWidth,
          }}
          title="Prévia do cardápio"
        />
      </div>
    </div>
  );
}
