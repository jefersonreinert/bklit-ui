import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleFontsUrls, resolveFont } from "../fonts";
import {
  applyAiEdit,
  blankDesign,
  designFromExtracted,
  renderDesignHtml,
  textElement,
  toAiElements,
} from "../model";
import type { AiElement, ExtractedDesign } from "../types";

function ai(p: Partial<AiElement>): AiElement {
  return {
    id: "",
    type: "text",
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0,
    text: "",
    fontFamily: "",
    fontCategory: "",
    fontSize: 0,
    fontWeight: 400,
    italic: false,
    color: "",
    align: "left",
    letterSpacing: 0,
    lineHeight: 1.2,
    uppercase: false,
    fill: "",
    stroke: "",
    strokeWidth: 0,
    radius: 0,
    shape: "",
    icon: "",
    opacity: 1,
    ...p,
  };
}

describe("menu designs", () => {
  it("rebuilds a photographed menu in page pixels", () => {
    const x: ExtractedDesign = {
      name: "Tasca",
      aspect: 0.75,
      pages: [
        {
          pageIndex: 0,
          background: "#f5efe6",
          elements: [
            ai({ x: 0.1, y: 0.05, w: 0.8, h: 0.06, text: "TASCA", fontFamily: "Playfair Display", fontSize: 0.05, align: "center" }),
            ai({ type: "line", x: 0.3, y: 0.12, w: 0.4, h: 0.002, stroke: "#aa7744", strokeWidth: 2 }),
            ai({ type: "image", x: 0.4, y: 0.8, w: 0.2, h: 0.1 }),
            ai({ text: "Prato", fontFamily: "Totally Unknown!!", fontCategory: "script" }),
            ai({ text: "  " }),
          ],
        },
      ],
    };
    const { design, images } = designFromExtracted(x);
    assert.equal(design.width, 794);
    assert.equal(design.height, Math.round(794 / 0.75));
    const [page] = design.pages;
    assert.equal(page?.background, "#f5efe6");
    assert.equal(page?.elements.length, 3);
    const title = page?.elements[0];
    assert.equal(title?.type, "text");
    if (title?.type === "text") {
      assert.equal(title.x, 79.4);
      assert.equal(title.fontSize, 0.05 * design.height);
      assert.equal(title.align, "center");
    }
    const fallback = page?.elements[2];
    assert.equal(fallback?.type === "text" && fallback.fontFamily, "Great Vibes");
    assert.equal(images[0]?.regions.length, 1);
    assert.equal(images[0]?.regions[0]?.target.w, 0.2 * 794);
  });

  it("applies an AI edit: keeps ids, images and adds new elements", () => {
    const d = blankDesign();
    const page = d.pages[0];
    assert.ok(page);
    page.elements.push({
      ...textElement({ id: "img" }),
      type: "image",
      src: "https://x/y.png",
      fit: "cover",
      radius: 0,
      flipX: false,
      borderColor: "",
      borderWidth: 0,
    } as never);
    const sent = toAiElements(page);
    assert.equal(sent.length, 3);
    assert.ok(sent.every((e) => !("src" in e)));
    const title = sent[0];
    assert.ok(title);
    const next = applyAiEdit(page, {
      message: "ok",
      background: "#000000",
      elements: [
        { ...title, color: "#ff0000", fontFamily: "Lobster" },
        { ...(sent[2] as AiElement), x: 10 },
        ai({ text: "Novo", x: 5, y: 5, w: 100, h: 20, fontSize: 18 }),
      ],
    });
    assert.equal(next.background, "#000000");
    assert.equal(next.elements.length, 3);
    const t = next.elements[0];
    assert.equal(t?.id, title.id);
    assert.equal(t?.type === "text" && t.color, "#ff0000");
    assert.equal(t?.type === "text" && t.fontFamily, "Lobster");
    const img = next.elements[1];
    assert.equal(img?.type === "image" && img.src, "https://x/y.png");
    assert.equal(img?.x, 10);
    assert.equal(next.elements[2]?.type, "text");
  });

  it("exports safe standalone HTML with the fonts", () => {
    const d = blankDesign();
    d.pages[0]?.elements.push(textElement({ text: "<script>x</script>", fontFamily: "Lora" }));
    const html = renderDesignHtml(d, {});
    assert.ok(!html.includes("<script>x"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("family=Lora"));
    assert.ok(html.includes("@page { size: 794px 1123px"));
  });

  it("resolves fonts and builds Google Fonts URLs", () => {
    assert.equal(resolveFont("playfair display"), "Playfair Display");
    assert.equal(resolveFont("Merriweather"), "Merriweather");
    assert.equal(resolveFont("<bad>", "mono"), "IBM Plex Mono");
    const urls = googleFontsUrls(["Great Vibes", "bad;name"]);
    assert.equal(urls.length, 2);
    assert.ok(urls[0]?.includes("family=Great+Vibes&"));
  });
});
