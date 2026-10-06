import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import wwebjs from "whatsapp-web.js";
import { HfStore } from "./hf-store.mjs";

/**
 * Small HTTP API around whatsapp-web.js for the Casa Brasa dashboard.
 * Every route except /health needs the `x-bridge-secret` header.
 *
 *   GET  /health                  liveness (also keeps the Space awake)
 *   GET  /status                  { state, qr, pairingCode, me }
 *   POST /pair       { phone }    pairing code for "Link with phone number"
 *   POST /logout                  unlink this device
 *   GET  /chats?limit=40          recent chats
 *   GET  /messages?chat=&limit=   messages of a chat
 *   POST /send       { chat, text }
 *   POST /seen       { chat }
 *
 * Media goes straight between the browser and the bridge through short-lived
 * URLs signed by the dashboard (HMAC with BRIDGE_SECRET), so files are not
 * limited by the dashboard's request size and the secret stays server-side:
 *   GET  /media?chat=&id=&exp=&sig=     download a message's media
 *   POST /upload?chat=&exp=&sig=        send a file (raw body; x-filename,
 *                                       x-caption headers)
 */

const { Client, LocalAuth, MessageMedia, RemoteAuth } = wwebjs;

const PORT = Number(process.env.PORT ?? 7860);
const SECRET = process.env.BRIDGE_SECRET ?? "";
const SESSION_REPO = process.env.HF_SESSION_REPO;
const HF_TOKEN = process.env.HF_TOKEN;
const MAX_BODY = 64 * 1024;
const MAX_UPLOAD = 64 * 1024 * 1024;
const MAX_THUMB = 120_000;
const PHONE = /^\d{10,15}$/;

if (SECRET.length < 24) {
  console.error("BRIDGE_SECRET (24+ characters) is required");
  process.exit(1);
}

const authStrategy =
  SESSION_REPO && HF_TOKEN
    ? new RemoteAuth({
        store: new HfStore({ repo: SESSION_REPO, accessToken: HF_TOKEN }),
        clientId: "casa-brasa",
        backupSyncIntervalMs: 10 * 60 * 1000,
      })
    : new LocalAuth({ clientId: "casa-brasa" });

const state = {
  /** starting | qr | ready | disconnected */
  status: "starting",
  qr: null,
  pairingCode: null,
  me: null,
  error: null,
};

const client = new Client({
  authStrategy,
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      // Fit Render's free 512 MB instance
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--mute-audio",
      "--renderer-process-limit=1",
      // Optional extra flags (e.g. a proxy when testing locally)
      ...(process.env.EXTRA_CHROME_ARGS ?? "").split(" ").filter(Boolean),
    ],
  },
});

client.on("qr", (qr) => {
  state.status = "qr";
  state.qr = qr;
});
client.on("code", (code) => {
  state.pairingCode = code;
});
client.on("authenticated", () => {
  state.qr = null;
  state.pairingCode = null;
});
client.on("auth_failure", (message) => {
  state.status = "disconnected";
  state.error = message;
});
client.on("ready", () => {
  state.status = "ready";
  state.qr = null;
  state.pairingCode = null;
  state.error = null;
  state.me = {
    name: client.info?.pushname ?? null,
    number: client.info?.wid?.user ?? null,
  };
  console.log("WhatsApp ready");
});
client.on("remote_session_saved", () => console.log("Session saved"));
client.on("disconnected", (reason) => {
  state.status = "disconnected";
  state.me = null;
  state.error = String(reason);
  // Start over so a new pairing code / QR becomes available
  setTimeout(() => {
    state.status = "starting";
    client.initialize().catch((e) => {
      state.error = e.message;
    });
  }, 5000);
});

function authorized(req) {
  const given = Buffer.from(String(req.headers["x-bridge-secret"] ?? ""));
  const expected = Buffer.from(SECRET);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Checks a URL signed by the dashboard: sig = HMAC(secret, action:chat:id:exp). */
function signedOk(action, url) {
  const chat = url.searchParams.get("chat") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const exp = Number(url.searchParams.get("exp"));
  const sig = Buffer.from(url.searchParams.get("sig") ?? "");
  if (!(exp && exp * 1000 > Date.now())) {
    return false;
  }
  const expected = Buffer.from(
    createHmac("sha256", SECRET)
      .update(`${action}:${chat}:${id}:${exp}`)
      .digest("hex")
  );
  return sig.length === expected.length && timingSafeEqual(sig, expected);
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-filename, x-caption",
  "access-control-max-age": "600",
};

function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > max) {
        reject(Object.assign(new Error("file too large"), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function serveMedia(res, url) {
  requireReady();
  const msg = await client.getMessageById(url.searchParams.get("id") ?? "");
  if (!msg?.hasMedia) {
    send(res, 404, { error: "no media" }, CORS);
    return;
  }
  const media = await msg.downloadMedia();
  if (!media?.data) {
    send(res, 410, { error: "media unavailable" }, CORS);
    return;
  }
  const bytes = Buffer.from(media.data, "base64");
  const name = media.filename ?? `${msg.type}-${msg.timestamp}`;
  res.writeHead(200, {
    ...CORS,
    "content-type": media.mimetype || "application/octet-stream",
    "content-length": bytes.length,
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "private, max-age=3600",
  });
  res.end(bytes);
}

async function receiveUpload(req, res, url) {
  requireReady();
  const chat = await chatFrom(url.searchParams.get("chat"));
  const bytes = await readRaw(req, MAX_UPLOAD);
  if (bytes.length === 0) {
    send(res, 400, { error: "empty file" }, CORS);
    return;
  }
  const filename = decodeURIComponent(
    String(req.headers["x-filename"] ?? "arquivo")
  );
  const caption = decodeURIComponent(String(req.headers["x-caption"] ?? ""));
  const mimetype = String(
    req.headers["content-type"] || "application/octet-stream"
  );
  const media = new MessageMedia(
    mimetype,
    bytes.toString("base64"),
    filename,
    bytes.length
  );
  const asDocument = !INLINE_MEDIA.test(mimetype);
  const sent = await chat.sendMessage(media, {
    caption: caption || undefined,
    sendMediaAsDocument: asDocument,
  });
  send(res, 200, { message: messageSummary(sent) }, CORS);
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, {
    ...extra,
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

const limitOf = (url, fallback, max) =>
  Math.min(Math.max(Number(url.searchParams.get("limit")) || fallback, 1), max);

function chatSummary(chat) {
  const last = chat.lastMessage;
  return {
    id: chat.id._serialized,
    name: chat.name || chat.id.user,
    isGroup: chat.isGroup,
    unread: chat.unreadCount ?? 0,
    timestamp: chat.timestamp ?? 0,
    archived: Boolean(chat.archived),
    last: last
      ? { body: last.body ?? "", fromMe: last.fromMe, type: last.type }
      : null,
  };
}

const THUMB_TYPES = new Set(["image", "video", "sticker"]);
const INLINE_MEDIA = /^(image|video|audio)\//;

function messageSummary(m) {
  const raw = m._data ?? {};
  const thumb =
    m.hasMedia &&
    THUMB_TYPES.has(m.type) &&
    typeof raw.body === "string" &&
    raw.body.length < MAX_THUMB
      ? raw.body
      : null;
  return {
    id: m.id._serialized,
    body: m.body ?? "",
    type: m.type,
    fromMe: m.fromMe,
    author: m.author ?? null,
    timestamp: m.timestamp,
    hasMedia: m.hasMedia,
    media: m.hasMedia
      ? {
          mimetype: raw.mimetype ?? null,
          filename: raw.filename ?? null,
          size: raw.size ?? null,
          duration: m.duration ?? null,
          thumb,
        }
      : null,
  };
}

function requireReady() {
  if (state.status !== "ready") {
    const error = new Error("WhatsApp is not connected");
    error.status = 409;
    throw error;
  }
}

async function chatFrom(id) {
  if (typeof id !== "string" || !id.includes("@")) {
    const error = new Error("invalid chat");
    error.status = 400;
    throw error;
  }
  return await client.getChatById(id);
}

const routes = {
  "GET /status": () => ({
    state: state.status,
    qr: state.qr,
    pairingCode: state.pairingCode,
    me: state.me,
    error: state.error,
  }),
  "POST /pair": async (_req, _url, body) => {
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    if (!PHONE.test(phone)) {
      const error = new Error("invalid phone");
      error.status = 400;
      throw error;
    }
    if (state.status !== "qr") {
      const error = new Error("not waiting for a device link");
      error.status = 409;
      throw error;
    }
    const code = await client.requestPairingCode(phone, true);
    state.pairingCode = code;
    return { code };
  },
  "POST /logout": async () => {
    await client.logout();
    return { ok: true };
  },
  "GET /chats": async (_req, url) => {
    requireReady();
    const chats = await client.getChats();
    return {
      chats: chats
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        .slice(0, limitOf(url, 500, 2000))
        .map(chatSummary),
    };
  },
  "GET /messages": async (_req, url) => {
    requireReady();
    const chat = await chatFrom(url.searchParams.get("chat"));
    const messages = await chat.fetchMessages({
      limit: limitOf(url, 50, 2000),
    });
    return { chat: chatSummary(chat), messages: messages.map(messageSummary) };
  },
  "POST /send": async (_req, _url, body) => {
    requireReady();
    const text = String(body.text ?? "").trim();
    if (!text || text.length > 4096) {
      const error = new Error("invalid text");
      error.status = 400;
      throw error;
    }
    const chat = await chatFrom(body.chat);
    const sent = await chat.sendMessage(text);
    return { message: messageSummary(sent) };
  },
  "POST /seen": async (_req, _url, body) => {
    requireReady();
    const chat = await chatFrom(body.chat);
    await chat.sendSeen();
    return { ok: true };
  },
};

async function signedRoute(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const action = url.pathname.slice(1);
  const method = action === "media" ? "GET" : "POST";
  if (req.method !== method || !signedOk(action, url)) {
    send(res, 403, { error: "forbidden" }, CORS);
    return;
  }
  try {
    if (action === "media") {
      await serveMedia(res, url);
    } else {
      await receiveUpload(req, res, url);
    }
  } catch (error) {
    send(res, error.status ?? 500, { error: error.message }, CORS);
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://bridge");
    if (url.pathname === "/health" || url.pathname === "/") {
      send(res, 200, { ok: true, state: state.status });
      return;
    }
    if (url.pathname === "/media" || url.pathname === "/upload") {
      await signedRoute(req, res, url);
      return;
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) {
      send(res, 404, { error: "not_found" });
      return;
    }
    if (!authorized(req)) {
      send(res, 401, { error: "unauthorized" });
      return;
    }
    try {
      const body = req.method === "POST" ? await readJson(req) : {};
      send(res, 200, await handler(req, url, body));
    } catch (error) {
      send(res, error.status ?? 500, { error: error.message });
    }
  })
  .listen(PORT, () => console.log(`Bridge listening on ${PORT}`));

client.initialize().catch((e) => {
  state.status = "disconnected";
  state.error = e.message;
  console.error(e);
});
