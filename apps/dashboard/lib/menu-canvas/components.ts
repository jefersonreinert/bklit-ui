/**
 * Finds the separate drawings on a page (icons, ornaments, illustrations)
 * as connected blobs of ink: a downscaled ink mask is dilated so the
 * strokes of one drawing join, then flood-filled into bounding boxes.
 * Pure functions over plain arrays, so they also run in tests.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 1 where the pixel has ink (alpha above `minAlpha`), from RGBA data. */
export function inkMask(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  minAlpha = 24
) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = (rgba[i * 4 + 3] ?? 0) > minAlpha ? 1 : 0;
  }
  return mask;
}

/**
 * Marks every cell of one line within `r` of an ink cell. `at(k)` maps
 * the k-th cell of the line to its index in the mask.
 */
function spreadLine(
  src: Uint8Array,
  dst: Uint8Array,
  n: number,
  r: number,
  at: (k: number) => number
) {
  let last = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < n; k++) {
    if (src[at(k)]) {
      last = k;
    }
    if (k - last <= r) {
      dst[at(k)] = 1;
    }
  }
  last = Number.POSITIVE_INFINITY;
  for (let k = n - 1; k >= 0; k--) {
    if (src[at(k)]) {
      last = k;
    }
    if (last - k <= r) {
      dst[at(k)] = 1;
    }
  }
}

/** Grows ink by `r` pixels (square), joining nearby strokes. */
export function dilate(
  mask: Uint8Array,
  width: number,
  height: number,
  r: number
) {
  if (r <= 0) {
    return mask;
  }
  // Separable: rows, then columns
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    spreadLine(mask, tmp, width, r, (x) => y * width + x);
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    spreadLine(tmp, out, height, r, (y) => y * width + x);
  }
  return out;
}

/** Flood-fills the blob that contains `start`; returns its box. */
function fill(
  mask: Uint8Array,
  seen: Uint8Array,
  width: number,
  height: number,
  start: number,
  members?: number[]
): Box {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  const stack = [start];
  seen[start] = 1;
  const visit = (n: number) => {
    if (mask[n] && !seen[n]) {
      seen[n] = 1;
      stack.push(n);
    }
  };
  while (stack.length) {
    const i = stack.pop() as number;
    members?.push(i);
    const x = i % width;
    const y = (i - x) / width;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    if (x > 0) {
      visit(i - 1);
    }
    if (x < width - 1) {
      visit(i + 1);
    }
    if (y > 0) {
      visit(i - width);
    }
    if (y < height - 1) {
      visit(i + width);
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Thin, hollow outlines (column frames, page borders, boxes around
 * prices): big blobs with very little ink inside their box. They are
 * returned on their own and erased from the mask, so the icons drawn
 * inside them are found separately.
 */
export function splitFrames(
  mask: Uint8Array,
  width: number,
  height: number,
  opts: { minSide?: number; maxFill?: number } = {}
) {
  const minSide = opts.minSide ?? 0.12;
  const maxFill = opts.maxFill ?? 0.08;
  const seen = new Uint8Array(mask.length);
  const frames: Box[] = [];
  const cleaned = mask.slice();
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) {
      continue;
    }
    const members: number[] = [];
    const box = fill(mask, seen, width, height, start, members);
    const big = box.w >= minSide * width || box.h >= minSide * height;
    if (big && members.length / (box.w * box.h) < maxFill) {
      frames.push(box);
      for (const i of members) {
        cleaned[i] = 0;
      }
    }
  }
  return { frames, mask: cleaned };
}

/** Bounding boxes of the 4-connected blobs of the mask. */
export function blobs(mask: Uint8Array, width: number, height: number): Box[] {
  const seen = new Uint8Array(mask.length);
  const out: Box[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] && !seen[start]) {
      out.push(fill(mask, seen, width, height, start));
    }
  }
  return out;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Merges boxes that overlap (dilation can leave nested blobs). */
export function mergeBoxes(list: Box[]): Box[] {
  const boxes = [...list];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < boxes.length && !changed; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i] as Box;
        const b = boxes[j] as Box;
        if (overlaps(a, b)) {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          boxes[i] = {
            x,
            y,
            w: Math.max(a.x + a.w, b.x + b.w) - x,
            h: Math.max(a.y + a.h, b.y + b.h) - y,
          };
          boxes.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return boxes;
}

/**
 * Drawings on an RGBA page render, as boxes in fractions (0-1) of the
 * page, sorted top to bottom, left to right. `gap` = how close (fraction
 * of the page width) two strokes must be to count as one drawing.
 */
export function detectDrawings(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  opts: { gap?: number; minSize?: number; maxArea?: number } = {}
): Box[] {
  const gap = Math.max(1, Math.round((opts.gap ?? 0.012) * width));
  const minSize = (opts.minSize ?? 0.012) * width;
  const maxArea = opts.maxArea ?? 0.9;
  const split = splitFrames(inkMask(rgba, width, height), width, height);
  const mask = dilate(split.mask, width, height, gap);
  const toFraction = (b: Box) => ({
    x: b.x / width,
    y: b.y / height,
    w: b.w / width,
    h: b.h / height,
  });
  const drawings = mergeBoxes(blobs(mask, width, height))
    .map((b) => {
      // Undo the dilation margin
      const x = Math.max(0, b.x + gap);
      const y = Math.max(0, b.y + gap);
      return {
        x,
        y,
        w: Math.max(1, Math.min(width, b.x + b.w - gap) - x),
        h: Math.max(1, Math.min(height, b.y + b.h - gap) - y),
      };
    })
    .filter(
      (b) =>
        Math.max(b.w, b.h) >= minSize &&
        (b.w * b.h) / (width * height) <= maxArea
    )
    .map(toFraction);
  return [...split.frames.map(toFraction), ...drawings].sort((a, b) =>
    Math.abs(a.y - b.y) < 0.02 ? a.x - b.x : a.y - b.y
  );
}

/**
 * Makes the paper transparent: pixels close to the background color
 * (sampled on the borders) fade out, keeping soft edges. In place.
 */
export function removeBackground(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  tolerance = 40
) {
  const samples: number[][] = [];
  const pick = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    samples.push([rgba[i] ?? 255, rgba[i + 1] ?? 255, rgba[i + 2] ?? 255]);
  };
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 40))) {
    pick(x, 0);
    pick(x, height - 1);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 40))) {
    pick(0, y);
    pick(width - 1, y);
  }
  const median = (k: number) => {
    const v = samples.map((s) => s[k] ?? 255).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)] ?? 255;
  };
  const bg = [median(0), median(1), median(2)];
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const d = Math.hypot(
      (rgba[o] ?? 0) - (bg[0] ?? 0),
      (rgba[o + 1] ?? 0) - (bg[1] ?? 0),
      (rgba[o + 2] ?? 0) - (bg[2] ?? 0)
    );
    if (d < tolerance) {
      rgba[o + 3] = 0;
    } else if (d < tolerance * 2) {
      rgba[o + 3] = Math.round(
        ((rgba[o + 3] ?? 255) * (d - tolerance)) / tolerance
      );
    }
  }
  return bg;
}

/**
 * True when the drawing is (almost) one color, so the editor can recolor
 * it like an icon: low spread of every channel over the opaque pixels.
 */
export function isMonochrome(rgba: Uint8ClampedArray | Uint8Array) {
  let n = 0;
  const sum = [0, 0, 0];
  const sq = [0, 0, 0];
  for (let i = 0; i < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 160) {
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const v = rgba[i + k] ?? 0;
      sum[k] = (sum[k] ?? 0) + v;
      sq[k] = (sq[k] ?? 0) + v * v;
    }
    n += 1;
  }
  if (n === 0) {
    return false;
  }
  return [0, 1, 2].every((k) => {
    const mean = (sum[k] ?? 0) / n;
    return Math.sqrt(Math.max(0, (sq[k] ?? 0) / n - mean * mean)) < 38;
  });
}
