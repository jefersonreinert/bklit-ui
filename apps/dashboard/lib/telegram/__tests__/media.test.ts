import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Api } from "telegram/tl/index.js";
import {
  addToCalendar,
  classifyMedia,
  dateKeys,
  formatBytes,
  keyLabel,
  type MediaCalendar,
  mediaFileName,
  mediaMarker,
} from "../media";
import { describeMedia } from "../media-node";

const big = (n: number) => n as unknown as Api.long;

describe("media kinds", () => {
  it("classifies photos, videos, audio, voice, PDFs and files", () => {
    assert.equal(classifyMedia({ photo: true }), "photo");
    assert.equal(
      classifyMedia({ mimeType: "video/mp4", video: true }),
      "video"
    );
    assert.equal(
      classifyMedia({ mimeType: "audio/mpeg", audio: true, fileName: "a.mp3" }),
      "audio"
    );
    assert.equal(
      classifyMedia({ mimeType: "audio/ogg", audio: true, voice: true }),
      "voice"
    );
    assert.equal(classifyMedia({ mimeType: "application/pdf" }), "pdf");
    assert.equal(
      classifyMedia({
        mimeType: "application/octet-stream",
        fileName: "x.PDF",
      }),
      "pdf"
    );
    assert.equal(classifyMedia({ mimeType: "application/zip" }), "document");
    assert.equal(
      classifyMedia({ mimeType: "image/webp", sticker: true }),
      "sticker"
    );
    assert.equal(
      classifyMedia({ mimeType: "video/mp4", animated: true }),
      "gif"
    );
    assert.equal(classifyMedia({ mimeType: "image/png" }), "photo");
  });

  it("reads real GramJS media objects", () => {
    const photo = new Api.MessageMediaPhoto({
      photo: new Api.Photo({
        id: big(1),
        accessHash: big(1),
        fileReference: Buffer.from(""),
        date: 0,
        dcId: 2,
        sizes: [
          new Api.PhotoSize({ type: "m", w: 1, h: 1, size: 10 }),
          new Api.PhotoSizeProgressive({
            type: "y",
            w: 1,
            h: 1,
            sizes: [5, 900],
          }),
        ],
      }),
    });
    assert.deepEqual(describeMedia(photo), {
      kind: "photo",
      mime: "image/jpeg",
      size: 900,
    });
    const doc = (mimeType: string, attributes: Api.TypeDocumentAttribute[]) =>
      new Api.MessageMediaDocument({
        document: new Api.Document({
          id: big(1),
          accessHash: big(1),
          fileReference: Buffer.from(""),
          date: 0,
          mimeType,
          size: big(2048),
          dcId: 2,
          attributes,
        }),
      });
    assert.deepEqual(
      describeMedia(
        doc("application/pdf", [
          new Api.DocumentAttributeFilename({ fileName: "cardapio.pdf" }),
        ])
      ),
      {
        kind: "pdf",
        mime: "application/pdf",
        fileName: "cardapio.pdf",
        size: 2048,
      }
    );
    assert.equal(
      describeMedia(
        doc("audio/ogg", [
          new Api.DocumentAttributeAudio({ duration: 3, voice: true }),
        ])
      )?.kind,
      "voice"
    );
    assert.equal(
      describeMedia(
        doc("video/mp4", [
          new Api.DocumentAttributeVideo({ duration: 3, w: 1, h: 1 }),
        ])
      )?.kind,
      "video"
    );
    assert.equal(
      describeMedia(new Api.MessageMediaGeo({ geo: new Api.GeoPointEmpty() })),
      null
    );
    assert.equal(describeMedia(undefined), null);
  });
});

describe("names and dates", () => {
  it("names files safely", () => {
    assert.equal(mediaFileName("photo", 7, "image/jpeg"), "photo-7.jpg");
    assert.equal(mediaFileName("audio", 8, "audio/mpeg"), "audio-8.mp3");
    assert.equal(
      mediaFileName("pdf", 9, "application/pdf", "a/b:c.pdf"),
      "a_b_c.pdf"
    );
  });

  it("keys days in the person's time zone", () => {
    // 2026-10-10 02:00 UTC is still the 9th in São Paulo
    const ms = Date.UTC(2026, 9, 10, 2);
    assert.deepEqual(dateKeys(ms, "UTC"), {
      year: "2026",
      month: "2026-10",
      day: "2026-10-10",
    });
    assert.equal(dateKeys(ms, "America/Sao_Paulo").day, "2026-10-09");
    assert.equal(dateKeys(ms, "Not/AZone").day, "2026-10-10");
    assert.equal(keyLabel("2026-10"), "outubro de 2026");
    assert.equal(keyLabel("2026-10-05"), "5 de outubro de 2026");
  });

  it("builds the calendar and reads media markers", () => {
    const cal: MediaCalendar = {};
    addToCalendar(cal, { year: "2026", month: "2026-10", day: "2026-10-05" });
    addToCalendar(cal, { year: "2026", month: "2026-10", day: "2026-10-05" });
    addToCalendar(cal, { year: "2025", month: "2025-01", day: "2025-01-02" });
    assert.deepEqual(cal, {
      "2026": { "2026-10": { "2026-10-05": 2 } },
      "2025": { "2025-01": { "2025-01-02": 1 } },
    });
    assert.deepEqual(mediaMarker("Olha o menu [document: menu.pdf] [👍×2]"), {
      type: "document",
      fileName: "menu.pdf",
    });
    assert.deepEqual(mediaMarker("[photo]"), { type: "photo", fileName: null });
    assert.equal(mediaMarker("[sem mídia aqui]"), null);
    assert.equal(formatBytes(1536), "2 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5,0 MB");
  });
});
