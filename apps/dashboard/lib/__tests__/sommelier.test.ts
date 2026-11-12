import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog, mentioned, nameScore, titleCase } from "../sommelier/catalog";
import { forSpeech, takeSentences } from "../sommelier/prompt";
import { cleanTurns } from "../server/sommelier";
import { AudioCollector, PCM_RATE, pcmToWav, readAloudEvents } from "../sommelier/realtime";

describe("sommelier catalog", () => {
  it("matches the same wine across sources", () => {
    assert.ok(nameScore("Mar de Frades Albarino Rias Baixas", "MAR DE FRADES ALBARIÑO") >= 0.6);
    assert.ok(nameScore("Gallo Signature", "Gallo Family Red") < 0.6);
    assert.equal(titleCase("DI MAJO NORANTE GRECO"), "Di Majo Norante Greco");
  });

  it("merges dispenser, POS and cellar notes", () => {
    const wines = buildCatalog({
      positions: [
        { sku: "1", wine: "MAR DE FRADES ALBARIÑO", doses: [25, 125], prices: [1.5, 7], residueMl: 300 },
      ],
      wmWines: [{ sku: "1", title2: "ALBARIÑO", origin: "SPAIN" }],
      products: [
        {
          name: "Mar de Frades Albarino Rias Baixas",
          category: "White Wine",
          price: 41,
          available: true,
          wine: { color: "white", country: "Spain", takeaway: 22.5, pours: [{ ml: 125, price: 6 }] },
        },
        { name: "Old Red", category: "Red Wine", price: 30, available: false, wine: { color: "red" } },
      ],
      cellar: [
        { name: "Mar de Frades Albariño", tastingNotes: "Citrus and sea breeze.", foodPairing: ["Oysters"] },
      ],
    });
    assert.equal(wines.length, 1);
    const w = wines[0];
    assert.ok(w);
    assert.equal(w.onTap, true);
    assert.deepEqual(w.pours, [{ ml: 25, price: 1.5 }, { ml: 125, price: 7 }]);
    assert.equal(w.bottle, 41);
    assert.equal(w.notes, "Citrus and sea breeze.");
    assert.deepEqual(w.pairing, ["Oysters"]);
  });

  it("finds the wines an answer talks about", () => {
    const list = [{ name: "Colle Vecchio" }, { name: "Tinto Pesquera Crianza" }, { name: "Gallo Signature" }];
    const hits = mentioned("Start with the Tinto Pesquera, then the Colle Vecchio.", list);
    assert.deepEqual(hits.map((h) => h.name), ["Tinto Pesquera Crianza", "Colle Vecchio"]);
  });
});

describe("sommelier speech and turns", () => {
  it("speaks whole sentences as they stream", () => {
    const a = takeSentences("Hello there. I would pour the Colle Vecchio for you. It is");
    assert.deepEqual(a.sentences, ["Hello there. I would pour the Colle Vecchio for you."]);
    assert.equal(a.rest, " It is");
    assert.equal(forSpeech("**Try** the €6.50 glass"), "Try the 6.50 euros glass");
  });

  it("keeps alternating turns that start with the guest", () => {
    const t = cleanTurns([
      { role: "assistant", content: "Hi" },
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "assistant", content: "c" },
      { role: "user", content: "d" },
    ]);
    assert.deepEqual(t.map((x) => x.role), ["user", "assistant", "user"]);
    assert.equal(t[0]?.content, "a\nb");
  });
});

describe("sommelier realtime voice", () => {
  it("asks for one out-of-band audio response in the chosen voice", () => {
    const [session, response] = readAloudEvents("Try the Nero d'Avola.", "marin", "English") as unknown as [
      { session: { audio: { output: { voice: string; format: { rate: number } } } } },
      { type: string; response: { conversation: string; input: { content: { text: string }[] }[] } },
    ];
    assert.equal(session.session.audio.output.voice, "marin");
    assert.equal(session.session.audio.output.format.rate, PCM_RATE);
    assert.equal(response.type, "response.create");
    assert.equal(response.response.conversation, "none");
    assert.match(response.response.input[0]?.content[0]?.text ?? "", /Nero d'Avola/);
  });

  it("collects audio deltas into a playable WAV", () => {
    const audio = new AudioCollector();
    const pcm = Buffer.from([1, 0, 2, 0, 3, 0]).toString("base64");
    assert.equal(audio.push({ type: "response.created" }), "more");
    assert.equal(audio.push({ type: "response.output_audio.delta", delta: pcm }), "more");
    assert.equal(audio.push({ type: "response.output_audio.delta", delta: pcm }), "more");
    assert.equal(audio.push({ type: "response.done", response: { status: "completed" } }), "done");
    const wav = pcmToWav(audio.chunks);
    const head = Buffer.from(wav.subarray(0, 44));
    assert.equal(head.toString("ascii", 0, 4), "RIFF");
    assert.equal(head.toString("ascii", 8, 12), "WAVE");
    assert.equal(head.readUInt32LE(24), 24_000);
    assert.equal(head.readUInt32LE(40), 12);
    assert.equal(wav.length, 56);
  });

  it("reports failures so the old voice can take over", () => {
    assert.ok(new AudioCollector().push({ type: "error", error: { message: "bad key" } }) instanceof Error);
    assert.ok(new AudioCollector().push({ type: "response.done", response: { status: "completed" } }) instanceof Error);
    assert.ok(new AudioCollector().push({ type: "response.done", response: { status: "failed" } }) instanceof Error);
  });
});
