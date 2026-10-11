import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectDrawings, isMonochrome, removeBackground } from "../components";

function canvas(w: number, h: number) {
  return new Uint8ClampedArray(w * h * 4);
}

function rect(
  d: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  rgb = [120, 80, 60]
) {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      const i = (y * w + x) * 4;
      d[i] = rgb[0] ?? 0;
      d[i + 1] = rgb[1] ?? 0;
      d[i + 2] = rgb[2] ?? 0;
      d[i + 3] = 255;
    }
  }
}

describe("drawing detection", () => {
  it("finds separate drawings and joins the strokes of one", () => {
    const w = 200;
    const h = 300;
    const d = canvas(w, h);
    // Glass icon made of two close strokes
    rect(d, w, 20, 20, 10, 2);
    rect(d, w, 24, 23, 2, 15);
    // A far ornament
    rect(d, w, 120, 200, 50, 4);
    const boxes = detectDrawings(d, w, h, { gap: 0.02, minSize: 0.02 });
    assert.equal(boxes.length, 2);
    const [icon, ornament] = boxes;
    assert.ok(Math.abs((icon?.x ?? 0) - 20 / w) < 0.01);
    assert.ok(Math.abs((icon?.h ?? 0) - 18 / h) < 0.01);
    assert.ok(Math.abs((ornament?.w ?? 0) - 50 / w) < 0.01);
  });

  it("separates a column frame from the icons drawn inside it", () => {
    const w = 300;
    const h = 300;
    const d = canvas(w, h);
    // Hollow frame
    rect(d, w, 20, 20, 200, 2);
    rect(d, w, 20, 250, 200, 2);
    rect(d, w, 20, 20, 2, 232);
    rect(d, w, 218, 20, 2, 232);
    // Icon touching the inside of the right edge
    rect(d, w, 205, 100, 12, 20);
    const boxes = detectDrawings(d, w, h, { gap: 0.02, minSize: 0.02 });
    assert.equal(boxes.length, 2);
    assert.ok(boxes.some((b) => Math.abs(b.w - 200 / w) < 0.01));
    assert.ok(boxes.some((b) => Math.abs(b.h - 20 / h) < 0.02));
  });

  it("makes the paper transparent and tells one-color drawings", () => {
    const w = 40;
    const h = 40;
    const d = canvas(w, h);
    rect(d, w, 0, 0, w, h, [250, 248, 240]);
    rect(d, w, 10, 10, 20, 4, [40, 30, 30]);
    removeBackground(d, w, h);
    assert.equal(d[3], 0);
    assert.equal(d[(12 * w + 15) * 4 + 3], 255);
    assert.equal(isMonochrome(d), true);
    rect(d, w, 10, 20, 20, 10, [30, 160, 220]);
    assert.equal(isMonochrome(d), false);
  });
});
