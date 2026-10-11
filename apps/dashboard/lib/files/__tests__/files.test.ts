import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseName, formatBytes, kindOf } from "../kinds";
import { documentLevels, luma } from "../scan";

describe("file kinds", () => {
  it("classifies by MIME type, then by extension", () => {
    assert.equal(kindOf("application/pdf", "a.bin"), "pdf");
    assert.equal(kindOf("image/svg+xml", "logo.svg"), "image");
    assert.equal(kindOf("video/quicktime", "IMG_1.MOV"), "video");
    assert.equal(kindOf("", "foto.HEIC"), "image");
    assert.equal(kindOf("application/octet-stream", "notas.md"), "sheet");
    assert.equal(kindOf("application/zip", "x.zip"), "other");
  });

  it("formats sizes and strips extensions", () => {
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1536), "1,5 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5 MB");
    assert.equal(baseName("Recibo.final.pdf"), "Recibo.final");
  });
});

describe("scan levels", () => {
  it("stretches between the dark ink and the paper", () => {
    const pixels = [
      ...new Array(10).fill(40),
      ...new Array(80).fill(170),
      ...new Array(10).fill(190),
    ];
    const { lo, hi } = documentLevels(pixels);
    assert.ok(lo >= 39 && lo < 170, `lo=${lo}`);
    assert.ok(hi >= 170 && hi <= 190, `hi=${hi}`);
  });

  it("leaves flat images alone", () => {
    assert.deepEqual(documentLevels(new Array(50).fill(128)), {
      lo: 0,
      hi: 255,
    });
    assert.equal(Math.round(luma(255, 255, 255)), 255);
  });
});
