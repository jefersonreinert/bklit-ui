import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTree, matchCategory } from "../pos/categories";
import { checksumOk } from "../scan/decoder";
import { createHidBuffer } from "../scan/hid";
import { analyze, assess, MESSAGES } from "../scan/quality";

const W = 320;
const H = 120;

/** Vertical bars like a 1D barcode, optionally box-blurred. */
function bars(blur = 0, bright = 1) {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inCode = x > 30 && x < W - 30;
      const dark = inCode && Math.floor((x * 7) / 13) % 3 === 0;
      g[y * W + x] = Math.round((dark ? 20 : 230) * bright);
    }
  }
  if (!blur) {
    return g;
  }
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let d = -blur; d <= blur; d++) {
        const xx = Math.min(W - 1, Math.max(0, x + d));
        s += g[y * W + xx] as number;
        n++;
      }
      out[y * W + x] = s / n;
    }
  }
  return out;
}

describe("image quality", () => {
  it("scores a sharp barcode sharper than a blurred one", () => {
    const sharp = analyze(bars(), W, H);
    const soft = analyze(bars(4), W, H);
    assert.ok(sharp.sharpness > soft.sharpness * 2, `${sharp.sharpness} vs ${soft.sharpness}`);
    assert.ok(sharp.barness > 1.6);
  });

  it("asks to fix focus, light, or position", () => {
    const blurry = assess(analyze(bars(6), W, H), { decoded: false, failed: false });
    assert.equal(blurry.message, MESSAGES.blurry);
    const dark = assess(analyze(bars(0, 0.1), W, H), { decoded: false, failed: false });
    assert.equal(dark.message, "Iluminação insuficiente.");
    const empty = assess(analyze(new Uint8Array(W * H).fill(128), W, H), {
      decoded: false,
      failed: false,
    });
    assert.equal(empty.message, "Posicione o código dentro da área de leitura.");
  });

  it("trusts the decoder: a valid read is detected", () => {
    const a = assess(analyze(bars(), W, H), { decoded: true, failed: false, width: 0.7 });
    assert.equal(a.message, "Código detectado!");
    assert.equal(a.checks.readable, "ok");
  });

  it("reports a code that keeps failing as partially hidden", () => {
    const a = assess(analyze(bars(), W, H), { decoded: false, failed: true });
    assert.equal(a.state, "partial");
  });
});

describe("EAN/UPC checksum", () => {
  it("validates check digits", () => {
    assert.equal(checksumOk("4006381333931", "EAN13"), true);
    assert.equal(checksumOk("4006381333932", "EAN13"), false);
    assert.equal(checksumOk("ABC-123", "Code128"), true);
  });
});

describe("HID barcode reader", () => {
  it("accepts a fast burst ended by Enter", () => {
    const b = createHidBuffer();
    "7891234567895".split("").forEach((c, i) => b.key(c, 1000 + i * 8));
    assert.equal(b.end(1000 + 13 * 8), "7891234567895");
  });

  it("ignores a person typing", () => {
    const b = createHidBuffer();
    "1234567".split("").forEach((c, i) => b.key(c, 1000 + i * 180));
    assert.equal(b.end(1000 + 7 * 180), null);
  });

  it("ends a scan on a pause when the reader sends no Enter", () => {
    const b = createHidBuffer();
    "12345678".split("").forEach((c, i) => b.key(c, i * 10));
    assert.equal(b.end(70 + 150, true), "12345678");
  });
});

describe("category tree", () => {
  it("merges saved rows (order, subcategories) with names in use", () => {
    const tree = buildTree(
      [
        { _id: "b", name: "Vinhos", sort: 0 },
        { _id: "a", name: "Cervejas", sort: 1 },
        { _id: "s", name: "IPA", parent: "Cervejas", sort: 0 },
      ],
      [
        { category: "Cervejas", subcategory: "IPA" },
        { category: "Cervejas", subcategory: "Lager" },
        { category: "Cervejas" },
        { category: "Petiscos" },
      ]
    );
    assert.deepEqual(tree.map((c) => [c.name, c.count]), [
      ["Vinhos", 0],
      ["Cervejas", 3],
      ["Petiscos", 1],
    ]);
    assert.deepEqual(tree[1]?.subs.map((s) => [s.name, s.count]), [
      ["IPA", 1],
      ["Lager", 1],
    ]);
    assert.equal(matchCategory(tree, "cervejas")?.name, "Cervejas");
    assert.equal(matchCategory(tree, "Vinho")?.name, "Vinhos");
  });
});
