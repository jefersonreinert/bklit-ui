import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bestByName,
  lineNet,
  nameScore,
  normalizeName,
  perUnitGuess,
  toBase,
} from "../inventory/match";

const bottle = { unit: "ml" as const, size: 700 };
const line = (description: string, unit = "", packSize: number | null = null, packUnit = "") => ({
  description,
  unit,
  packSize,
  packUnit,
});

describe("invoice matching", () => {
  it("normalizes names", () => {
    assert.equal(normalizeName("  Albariño  Rías-Baixas 75cl "), "albarino rias baixas 75cl");
  });

  it("scores names without sizes and packaging", () => {
    assert.ok(nameScore("TANQUERAY LONDON DRY GIN 70CL", "Gin Tanqueray London Dry 70cl") > 0.85);
    assert.ok(nameScore("Gordons Gin 6x70cl", "Gin Tanqueray 70cl") < 0.6);
    // A case size glued together ("6X70CL") is size, not a name word
    assert.equal(nameScore("TANQUERAY GIN 6X70CL", "Gin Tanqueray 70cl"), 1);
    assert.equal(nameScore("70cl", "Gin"), 0);
    // An abbreviated brand is not another product that starts the same way
    assert.ok(nameScore("MARG. STILL 275ML X 24 BCRS", "Margarita") < 0.5);
    assert.ok(nameScore("Albarinos Rias Baixas", "Albarino Rias Baixas") > 0.9);
    const hit = bestByName("Aperol 1L", [
      { id: "a", name: "Campari 1L" },
      { id: "b", name: "Aperol Aperitivo 1L" },
    ]);
    assert.equal(hit?.item.id, "b");
    assert.equal(bestByName("Cleaning cloth", [{ id: "a", name: "Gin" }]), null);
  });

  it("converts printed contents to the base unit", () => {
    assert.equal(toBase(0.75, "l", "ml"), 750);
    assert.equal(toBase(70, "cl", "ml"), 700);
    assert.equal(toBase(5, "kg", "g"), 5000);
    assert.equal(toBase(5, "kg", "ml"), null);
  });

  it("knows how many base units one invoiced unit holds", () => {
    assert.equal(perUnitGuess(line("Gordons Gin 6x70cl", "case"), bottle), 4200);
    assert.equal(perUnitGuess(line("Tanqueray 70cl", "btl", 0.7, "l"), bottle), 700);
    assert.equal(perUnitGuess(line("Tanqueray case x 6", "case"), bottle), 4200);
    assert.equal(perUnitGuess(line("Tanqueray", "btl"), bottle), 700);
    // A case with no count: the reviewer must say
    assert.equal(perUnitGuess(line("Tanqueray", "case"), bottle), null);
    assert.equal(perUnitGuess(line("Coca-Cola can 24x", "tray"), { unit: "un", size: 1 }), 24);
    assert.equal(perUnitGuess(line("Lemons", "kg", 1, "kg"), { unit: "g", size: 1000 }), 1000);
  });

  it("takes the net cost of a line", () => {
    assert.equal(lineNet({ quantity: 3, unitPrice: 12.5, lineTotal: 44.25, vatRate: 18 }), 37.5);
    assert.equal(lineNet({ quantity: 3, unitPrice: null, lineTotal: 37.5, vatRate: null }), 37.5);
    assert.equal(lineNet({ quantity: 1, unitPrice: null, lineTotal: null, vatRate: null }), 0);
  });
});
