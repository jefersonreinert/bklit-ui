import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EN } from "../i18n/en";
import { ES } from "../i18n/es";
import { translate } from "../i18n/index";
import { IT } from "../i18n/it";
import { MT } from "../i18n/mt";

describe("i18n", () => {
  it("keeps Portuguese as the source and fills placeholders", () => {
    assert.equal(translate("Caixa", undefined, "pt"), "Caixa");
    assert.equal(
      translate("No ponto desde {time}", { time: "18:02" }, "en"),
      "Clocked in since 18:02"
    );
    assert.equal(translate("Taça {ml} ml", { ml: 125 }, "it"), "Calice 125 ml");
  });

  it("falls back to English, then to the Portuguese text", () => {
    assert.equal(translate("Caixa", undefined, "xx"), "Register");
    assert.equal(translate("Texto novo", undefined, "es"), "Texto novo");
  });

  it("has every text in every reviewed language, with the same placeholders", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [name, dict] of Object.entries({ ES, IT, MT })) {
      for (const key of Object.keys(EN)) {
        assert.ok(dict[key], `${name} lacks "${key}"`);
        assert.equal(vars(dict[key] ?? ""), vars(key), `${name}: ${key}`);
      }
    }
  });
});
