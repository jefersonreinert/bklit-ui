import { timingSafeEqual } from "node:crypto";
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
 */

const { Client, LocalAuth, RemoteAuth } = wwebjs;

const PORT = Number(process.env.PORT ?? 7860);
const SECRET = process.env.BRIDGE_SECRET ?? "";
const SESSION_REPO = process.env.HF_SESSION_REPO;
const HF_TOKEN = process.env.HF_TOKEN;
const MAX_BODY = 64 * 1024;
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

function send(res, status, body) {
  res.writeHead(status, {
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

function messageSummary(m) {
  return {
    id: m.id._serialized,
    body: m.body ?? "",
    type: m.type,
    fromMe: m.fromMe,
    author: m.author ?? null,
    timestamp: m.timestamp,
    hasMedia: m.hasMedia,
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
        .filter((c) => !c.archived)
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        .slice(0, limitOf(url, 40, 100))
        .map(chatSummary),
    };
  },
  "GET /messages": async (_req, url) => {
    requireReady();
    const chat = await chatFrom(url.searchParams.get("chat"));
    const messages = await chat.fetchMessages({ limit: limitOf(url, 50, 200) });
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

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://bridge");
    if (url.pathname === "/health" || url.pathname === "/") {
      send(res, 200, { ok: true, state: state.status });
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
