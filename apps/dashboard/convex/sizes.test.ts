import { describe, expect, it } from "vitest";
import {
  descriptionWithSize,
  nameWithSize,
  sizeLabel,
  stripSize,
} from "../lib/inventory/sizes";

describe("bottle sizes", () => {
  it("labels sizes", () => {
    expect(sizeLabel(700)).toBe("700ml");
    expect(sizeLabel(1000)).toBe("1L");
    expect(sizeLabel(1500)).toBe("1.5L");
  });
  it("replaces the size in a name", () => {
    expect(nameWithSize("Cointreau", 1000)).toBe("Cointreau 1L");
    expect(nameWithSize("Cointreau 1L", 700)).toBe("Cointreau 700ml");
    expect(nameWithSize("Gin Tanqueray 70cl", 1000)).toBe("Gin Tanqueray 1L");
    expect(nameWithSize("Whitley Neill Rhubarb & Ginger", 700)).toBe(
      "Whitley Neill Rhubarb & Ginger 700ml"
    );
    expect(nameWithSize("Licor 43", 700)).toBe("Licor 43 700ml");
  });
  it("puts the size in the description", () => {
    expect(
      descriptionWithSize("Tia Maria Cold Brew coffee liqueur 20% · 1 L", 700)
    ).toBe("Tia Maria Cold Brew coffee liqueur 20% · 700ml");
    expect(descriptionWithSize(undefined, 750)).toBe("750ml");
    expect(stripSize("Mezcal 100% Espadín · 40% · 70 cl")).toBe(
      "Mezcal 100% Espadín · 40%"
    );
  });
});
