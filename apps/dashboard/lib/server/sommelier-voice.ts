import {
  AudioCollector,
  pcmToWav,
  REALTIME_MODEL,
  type RealtimeEvent,
  readAloudEvents,
} from "@/lib/sommelier/realtime";

/**
 * One spoken clip of a sommelier answer. First the Realtime API
 * (gpt-realtime-2.1-mini); while it still exists (until 2027-01-06) the
 * old Speech endpoint is the fallback. null: the page uses the phone's
 * own voice.
 */

const TIMEOUT_MS = 25_000;

interface Socket {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, fn: (e: { data?: unknown }) => void): void;
}

/**
 * Cloudflare Workers open client sockets with fetch + Upgrade (headers
 * allowed); Node uses the standard WebSocket, with the key in the
 * subprotocol as OpenAI documents for it.
 */
async function connect(key: string): Promise<Socket> {
  const url = `https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;
  if ("WebSocketPair" in globalThis) {
    const res = await fetch(url, {
      headers: { upgrade: "websocket", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    const ws = (res as Response & { webSocket?: Socket & { accept(): void } })
      .webSocket;
    if (!ws) {
      throw new Error(`realtime upgrade failed (${res.status})`);
    }
    ws.accept();
    return ws;
  }
  const ws = new WebSocket(url.replace(/^https/, "wss"), [
    "realtime",
    `openai-insecure-api-key.${key}`,
  ]);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("realtime connect failed")));
  });
  return ws as unknown as Socket;
}

export async function realtimeVoice(
  key: string,
  text: string,
  voice: string,
  langName: string
): Promise<Uint8Array> {
  const ws = await connect(key);
  const audio = new AudioCollector();
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("realtime timeout")),
        TIMEOUT_MS
      );
      const finish = (r: Uint8Array | Error) => {
        clearTimeout(timer);
        r instanceof Error ? reject(r) : resolve(r);
      };
      ws.addEventListener("message", (e) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(String(e.data));
        } catch {
          return;
        }
        const state = audio.push(event);
        if (state === "done") {
          finish(pcmToWav(audio.chunks));
        } else if (state instanceof Error) {
          finish(state);
        }
      });
      ws.addEventListener("close", () =>
        finish(new Error("realtime closed early"))
      );
      for (const event of readAloudEvents(text, voice, langName)) {
        ws.send(JSON.stringify(event));
      }
    });
  } finally {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }
}

/** The Speech endpoint: works until OpenAI shuts it down (2027-01-06). */
async function legacyVoice(
  key: string,
  text: string,
  voice: string,
  langName: string
) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
      instructions: `Speak ${langName} like a warm, relaxed sommelier talking to a guest at a wine bar: natural pace, friendly, a little smile in the voice.`,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!(res?.ok && res.body)) {
    console.error("[sommelier] legacy voice failed", res?.status);
    return null;
  }
  return new Response(res.body, {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
}

export async function naturalVoice(
  key: string,
  text: string,
  voice: string,
  langName: string
): Promise<Response | null> {
  try {
    const wav = await realtimeVoice(key, text, voice, langName);
    return new Response(wav.buffer as ArrayBuffer, {
      headers: { "content-type": "audio/wav", "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[sommelier] realtime voice failed", String(err));
  }
  return legacyVoice(key, text, voice, langName);
}
