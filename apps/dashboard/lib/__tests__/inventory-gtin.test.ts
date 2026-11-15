import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeGtin, validGtin } from "../inventory/gtin";

describe("gtin", () => {
  it("accepts real codes and refuses a wrong check digit", () => {
    assert.equal(validGtin("4006381333931"), true); // EAN-13
    assert.equal(validGtin("4006381333932"), false);
    assert.equal(validGtin("5000291020706"), true);
    assert.equal(validGtin("96385074"), true); // EAN-8
    assert.equal(validGtin("036000291452"), true); // UPC-A
    assert.equal(validGtin("0000000000000"), false);
    assert.equal(validGtin("12345"), false);
  });

  it("keeps only digits", () => {
    assert.equal(normalizeGtin("5 000291 020706"), "5000291020706");
  });
});
