import { describe, expect, it } from "vitest";
import { countries, findCountry, matchCountry } from "../lib/countries";

describe("country picker data", () => {
  it("names countries in the app language and saves English names", () => {
    const list = countries("pt-BR");
    expect(list.length).toBeGreaterThan(240);
    const de = list.find((c) => c.code === "de");
    expect(de).toMatchObject({ value: "Germany", label: "Alemanha" });
    // Sorted by the local name
    expect(
      list[0]?.label.localeCompare(list[1]?.label ?? "", "pt-BR")
    ).toBeLessThan(0);
  });

  it("recognises older spellings in the data", () => {
    expect(findCountry("France")?.code).toBe("fr");
    expect(findCountry("USA")?.code).toBe("us");
    expect(findCountry("Usa")?.code).toBe("us");
    expect(findCountry("United States")?.code).toBe("us");
    expect(findCountry("Potugal")?.code).toBe("pt");
    expect(findCountry("Loire Valley France")?.code).toBe("fr");
    expect(findCountry("Itália")?.code).toBe("it");
    expect(findCountry("")).toBeUndefined();
  });

  it("searches without accents in both languages", () => {
    const es = findCountry("Spain");
    expect(es && matchCountry(es, "espanh")).toBe(true);
    expect(es && matchCountry(es, "spa")).toBe(true);
    const at = findCountry("Austria");
    expect(at && matchCountry(at, "austria")).toBe(true);
  });
});
