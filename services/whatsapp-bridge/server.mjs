import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  getContentType,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
} from "baileys";
import pino from "pino";
import {
  chatsNeedingAvatar,
  clearAuth,
  encode,
  listChats,
  listMessages,
  messageRaw,
  patchChat,
  pendingMedia,
  saveChats,
  saveContacts,
  saveMessages,
  setMediaResult,
  stats,
  touchChat,
  unreadKeys,
  uploadFile,
  useDbAuthState,
} from "./db.mjs";

/**
 * WhatsApp bridge for the Casa Brasa dashboard.
 *
 * Baileys speaks the WhatsApp Web protocol directly (no browser, ~150 MB),
 * so it fits Render's free 512 MB instance. Every chat, contact and message
 * (with full history sync), profile photos and media files are archived in
 * Supabase; the auth state lives there too, so restarts never unlink.
 *
 * Every route except /health needs the `x-bridge-secret` header:
 *   GET  /status                       { state, pairingCode, me, sync, stats }
 *   POST /pair        { phone }        pairing code ("Link with phone number")
 *   POST /logout
 *   GET  /chats?limit=                 from the archive
 *   GET  /messages?chat=&limit=&before=
 *   POST /send        { chat, text }
 *   POST /seen        { chat }
 * Browser-direct, signed by the dashboard (HMAC with BRIDGE_SECRET):
 *   GET  /media?chat=&id=&exp=&sig=    media not archived yet (downloads it)
 *   POST /upload?chat=&exp=&sig=       send a file (x-filename, x-caption)
 */

const PORT = Number(process.env.PORT ?? 10_000);
const SECRET = process.env.BRIDGE_SECRET ?? "";
const MAX_BODY = 64 * 1024;
const MAX_UPLOAD = 64 * 1024 * 1024;
const MEDIA_MAX_BYTES = Number(process.env.MEDIA_MAX_MB ?? 16) * 1024 * 1024;
const MEDIA_HISTORY_S = Number(process.env.MEDIA_HISTORY_DAYS ?? 180) * 86_400;
const PHONE = /^\d{10,15}$/;
const NON_DIGITS = /\D/g;
const UNSAFE_PATH = /[^\w.@-]/g;
const MESSAGE_SUFFIX = /Message$/;

if (SECRET.length < 24) {
  console.error("BRIDGE_SECRET (24+ characters) is required");
  process.exit(1);
}
if (!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

process.on("unhandledRejection", (e) => console.error("Unhandled:", e));

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

const state = {
  /** starting | qr | ready | disconnected */
  status: "starting",
  pairingCode: null,
  me: null,
  error: null,
  sync: { batches: 0, messages: 0, progress: null, lastAt: null },
};
let sock = null;

/* ------------------------------ messages -------------------------------- */

const TYPES = {
  conversation: "chat",
  extendedTextMessage: "chat",
  imageMessage: "image",
  videoMessage: "video",
  ptvMessage: "video",
  audioMessage: "audio",
  documentMessage: "document",
  stickerMessage: "sticker",
  locationMessage: "location",
  liveLocationMessage: "location",
  contactMessage: "vcard",
  contactsArrayMessage: "multi_vcard",
  pollCreationMessage: "poll_creation",
  pollCreationMessageV2: "poll_creation",
  pollCreationMessageV3: "poll_creation",
};
const MEDIA = new Set([
  "imageMessage",
  "videoMessage",
  "ptvMessage",
  "audioMessage",
  "documentMessage",
  "stickerMessage",
]);
const SKIP = new Set([
  "protocolMessage",
  "reactionMessage",
  "senderKeyDistributionMessage",
  "pollUpdateMessage",
  "messageContextInfo",
  "keepInChatMessage",
  "encReactionMessage",
]);

const toSeconds = (t) => {
  if (!t) {
    return 0;
  }
  if (typeof t === "object") {
    return typeof t.toNumber === "function" ? t.toNumber() : Number(t.low ?? 0);
  }
  return Number(t);
};

function textOf(type, inner) {
  if (typeof inner === "string") {
    return inner;
  }
  if (type === "location") {
    return (
      inner?.name || `${inner?.degreesLatitude},${inner?.degreesLongitude}`
    );
  }
  return (
    inner?.text ?? inner?.caption ?? inner?.name ?? inner?.displayName ?? ""
  );
}

function mediaInfo(inner) {
  return {
    mimetype: inner?.mimetype ?? null,
    filename: inner?.fileName ?? null,
    size: Number(inner?.fileLength ?? 0) || null,
    duration: inner?.seconds ?? null,
    thumb: inner?.jpegThumbnail
      ? Buffer.from(inner.jpegThumbnail).toString("base64")
      : null,
  };
}

/** WAMessage → wa_messages row (null for system/protocol messages). */
function toRow(msg, live) {
  const chat = msg.key?.remoteJid;
  if (!(chat && msg.key?.id) || chat === "status@broadcast") {
    return null;
  }
  let content = normalizeMessageContent(msg.message);
  if (content?.documentWithCaptionMessage?.message) {
    content = content.documentWithCaptionMessage.message;
  }
  const ctype = content ? getContentType(content) : undefined;
  if (!ctype || SKIP.has(ctype)) {
    return null;
  }
  const inner = content[ctype];
  const type =
    ctype === "audioMessage" && inner?.ptt
      ? "ptt"
      : (TYPES[ctype] ?? ctype.replace(MESSAGE_SUFFIX, ""));
  const ts = toSeconds(msg.messageTimestamp);
  const isMedia = MEDIA.has(ctype);
  const media = isMedia ? mediaInfo(inner) : null;
  const recent = live || Date.now() / 1000 - ts < MEDIA_HISTORY_S;
  const small = !media?.size || media.size <= MEDIA_MAX_BYTES;
  let mediaStatus = null;
  if (isMedia) {
    mediaStatus = recent && small ? "pending" : "skipped";
  }
  return {
    chat_id: chat,
    id: msg.key.id,
    from_me: Boolean(msg.key.fromMe),
    author: msg.key.participant ?? null,
    ts,
    type,
    body: textOf(type, inner),
    media,
    media_status: mediaStatus,
    raw: isMedia ? encode(msg) : null,
  };
}

/** Moves each chat's preview to its newest message in `rows`. */
async function updatePreviews(rows) {
  const newest = new Map();
  for (const r of rows) {
    const cur = newest.get(r.chat_id);
    if (!cur || r.ts > cur.ts) {
      newest.set(r.chat_id, r);
    }
  }
  for (const r of newest.values()) {
    await touchChat(r);
  }
}

async function storeMessages(messages, live) {
  const rows = messages.map((m) => toRow(m, live)).filter(Boolean);
  if (rows.length > 0) {
    await saveMessages(rows);
    await updatePreviews(rows);
  }
  return rows;
}

const chatRow = (c) => ({
  id: c.id,
  ...(c.name ? { name: c.name } : {}),
  is_group: c.id.endsWith("@g.us"),
  ...(c.unreadCount === undefined ? {} : { unread: c.unreadCount ?? 0 }),
  ...(c.archived === undefined ? {} : { archived: Boolean(c.archived) }),
  ...(c.conversationTimestamp
    ? { last_ts: toSeconds(c.conversationTimestamp) }
    : {}),
  updated_at: new Date().toISOString(),
});

const contactRow = (c) => ({
  id: c.id,
  name: c.name ?? c.verifiedName ?? null,
  notify: c.notify ?? null,
  updated_at: new Date().toISOString(),
});

/* Archive writes run one at a time so history bursts can't pile up memory */
let chain = Promise.resolve();
const enqueue = (label, fn) => {
  chain = chain.then(fn).catch((e) => console.error(`${label}:`, e.message));
  return chain;
};

/* ------------------------------- socket --------------------------------- */

function bindEvents(socket, saveCreds) {
  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", (u) => onConnection(socket, u));

  socket.ev.on("messaging-history.set", (h) =>
    enqueue("history", async () => {
      state.sync.batches += 1;
      state.sync.progress = h.progress ?? state.sync.progress;
      state.sync.lastAt = new Date().toISOString();
      await saveContacts(
        (h.contacts ?? []).filter((c) => c.id).map(contactRow)
      );
      await saveChats((h.chats ?? []).filter((c) => c.id).map(chatRow));
      const rows = await storeMessages(h.messages ?? [], false);
      state.sync.messages += rows.length;
      console.log(
        `History batch ${state.sync.batches}: ${rows.length} messages, ${h.chats?.length ?? 0} chats (progress ${h.progress ?? "?"})`
      );
    })
  );
  socket.ev.on("messages.upsert", ({ messages, type }) =>
    enqueue("messages", () => storeMessages(messages, type === "notify"))
  );
  socket.ev.on("chats.upsert", (chats) =>
    enqueue("chats", () => saveChats(chats.map(chatRow)))
  );
  socket.ev.on("chats.update", (updates) =>
    enqueue("chats", () => saveChats(updates.filter((c) => c.id).map(chatRow)))
  );
  socket.ev.on("contacts.upsert", (contacts) =>
    enqueue("contacts", () => saveContacts(contacts.map(contactRow)))
  );
  socket.ev.on("contacts.update", (contacts) =>
    enqueue("contacts", () =>
      saveContacts(contacts.filter((c) => c.id).map(contactRow))
    )
  );
}

function onConnection(socket, u) {
  if (socket !== sock) {
    return;
  }
  if (u.qr) {
    state.status = "qr";
  }
  if (u.connection === "open") {
    state.status = "ready";
    state.pairingCode = null;
    state.error = null;
    state.me = {
      name: socket.user?.name ?? null,
      number: socket.user?.id?.split(":")[0]?.split("@")[0] ?? null,
    };
    console.log("WhatsApp ready");
  }
  if (u.connection === "close") {
    const code = u.lastDisconnect?.error?.output?.statusCode;
    state.status = "disconnected";
    state.me = null;
    state.error = u.lastDisconnect?.error?.message ?? null;
    const loggedOut = code === DisconnectReason.loggedOut;
    console.log(
      `Connection closed (${code ?? "?"})${loggedOut ? ": logged out" : ""}`
    );
    setTimeout(
      () => {
        (loggedOut ? clearAuth() : Promise.resolve())
          .then(boot)
          .catch((e) => console.error("restart:", e.message));
      },
      loggedOut ? 1000 : 3000
    );
  }
}

async function start() {
  state.status = "starting";
  const { state: auth, saveCreds } = await useDbAuthState();
  const socket = makeWASocket({
    auth: {
      creds: auth.creds,
      keys: makeCacheableSignalKeyStore(auth.keys, logger),
    },
    logger,
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: true,
    markOnlineOnConnect: false,
    getMessage: async (key) =>
      (await messageRaw(key.remoteJid, key.id).catch(() => null))?.raw
        ?.message ?? undefined,
  });
  sock = socket;
  bindEvents(socket, saveCreds);
}

/* ---------------------------- media / photos ---------------------------- */

const EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
};
const safe = (s) => s.replace(UNSAFE_PATH, "_");

function extOf(media) {
  const fromName = media?.filename?.includes(".")
    ? media.filename.split(".").pop()
    : null;
  const mime = media?.mimetype?.split(";")[0] ?? "";
  return (fromName || EXT[mime] || mime.split("/")[1] || "bin").slice(0, 8);
}

async function downloadAndArchive(chatId, id) {
  const row = await messageRaw(chatId, id);
  if (!row?.raw) {
    return null;
  }
  const bytes = await downloadMediaMessage(
    row.raw,
    "buffer",
    {},
    { logger, reuploadRequest: sock.updateMediaMessage }
  );
  const mimetype =
    row.media?.mimetype?.split(";")[0] || "application/octet-stream";
  const path = `media/${safe(chatId)}/${safe(id)}.${extOf(row.media)}`;
  await uploadFile(path, bytes, mimetype);
  await setMediaResult(chatId, id, { media_path: path, media_status: "done" });
  return { bytes, mimetype, filename: row.media?.filename };
}

let mediaBusy = false;
async function mediaTick() {
  if (mediaBusy || state.status !== "ready") {
    return;
  }
  mediaBusy = true;
  try {
    for (const m of await pendingMedia(4)) {
      try {
        await downloadAndArchive(m.chat_id, m.id);
      } catch (e) {
        await setMediaResult(m.chat_id, m.id, {
          media_status: String(e.message).includes("404")
            ? "expired"
            : "failed",
        }).catch(() => null);
      }
    }
  } catch (e) {
    console.error("media:", e.message);
  } finally {
    mediaBusy = false;
  }
}

let avatarBusy = false;
async function avatarTick() {
  if (avatarBusy || state.status !== "ready") {
    return;
  }
  avatarBusy = true;
  try {
    for (const c of await chatsNeedingAvatar(2)) {
      let path = null;
      try {
        const url = await sock.profilePictureUrl(c.id, "preview");
        if (url) {
          const res = await fetch(url);
          if (res.ok) {
            path = `avatars/${safe(c.id)}.jpg`;
            await uploadFile(
              path,
              Buffer.from(await res.arrayBuffer()),
              "image/jpeg"
            );
          }
        }
      } catch {
        // no photo or privacy settings hide it
      }
      await patchChat(c.id, {
        avatar_checked_at: new Date().toISOString(),
        ...(path ? { avatar_path: path } : {}),
      });
    }
  } catch (e) {
    console.error("avatars:", e.message);
  } finally {
    avatarBusy = false;
  }
}

setInterval(mediaTick, 4000);
setInterval(avatarTick, 2500);

/* --------------------------------- HTTP --------------------------------- */

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

function send(res, status, body, extra = {}) {
  res.writeHead(status, {
    ...extra,
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req, max) {
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

async function readJson(req) {
  const raw = await readBody(req, MAX_BODY);
  try {
    return raw.length ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("invalid json"), { status: 400 });
  }
}

const fail = (message, status) => Object.assign(new Error(message), { status });

function requireReady() {
  if (state.status !== "ready" || !sock) {
    throw fail("WhatsApp is not connected", 409);
  }
}

function chatId(value) {
  if (typeof value !== "string" || !value.includes("@")) {
    throw fail("invalid chat", 400);
  }
  return value;
}

const limitOf = (url, fallback, max) =>
  Math.min(Math.max(Number(url.searchParams.get("limit")) || fallback, 1), max);

const toApiMessage = (row) => ({
  id: row.id,
  body: row.body ?? "",
  type: row.type,
  fromMe: row.from_me,
  author: row.author,
  timestamp: row.ts,
  hasMedia: Boolean(row.media),
  media: row.media,
  mediaUrl: null,
});

const routes = {
  "GET /status": async () => ({
    state: state.status,
    qr: null,
    pairingCode: state.pairingCode,
    me: state.me,
    error: state.error,
    sync: state.sync,
    stats: await stats().catch(() => null),
  }),
  "POST /pair": async (_req, _url, body) => {
    const phone = String(body.phone ?? "").replace(NON_DIGITS, "");
    if (!PHONE.test(phone)) {
      throw fail("invalid phone", 400);
    }
    if (state.status !== "qr" || !sock) {
      throw fail("not waiting for a device link", 409);
    }
    const code = await sock.requestPairingCode(phone);
    state.pairingCode = code;
    return { code };
  },
  "POST /logout": async () => {
    await sock?.logout().catch(() => null);
    return { ok: true };
  },
  "GET /chats": async (_req, url) => ({
    chats: await listChats(limitOf(url, 500, 3000)),
  }),
  "GET /messages": async (_req, url) => {
    const chat = chatId(url.searchParams.get("chat"));
    const before = Number(url.searchParams.get("before")) || undefined;
    const [chats, messages] = await Promise.all([
      listChats(3000).then((all) => all.find((c) => c.id === chat)),
      listMessages(chat, limitOf(url, 60, 3000), before),
    ]);
    return {
      chat: chats ?? {
        id: chat,
        name: chat.split("@")[0],
        isGroup: false,
        archived: false,
        unread: 0,
        timestamp: 0,
        last: null,
      },
      messages,
    };
  },
  "POST /send": async (_req, _url, body) => {
    requireReady();
    const text = String(body.text ?? "").trim();
    if (!text || text.length > 4096) {
      throw fail("invalid text", 400);
    }
    const sent = await sock.sendMessage(chatId(body.chat), { text });
    const [row] = await storeMessages([sent], true);
    return { message: toApiMessage(row) };
  },
  "POST /seen": async (_req, _url, body) => {
    const chat = chatId(body.chat);
    await patchChat(chat, { unread: 0 });
    if (state.status === "ready") {
      await sock.readMessages(await unreadKeys(chat)).catch(() => null);
    }
    return { ok: true };
  },
};

function contentFor(mimetype, bytes, filename, caption) {
  const cap = caption || undefined;
  if (mimetype.startsWith("image/")) {
    return { image: bytes, mimetype, caption: cap };
  }
  if (mimetype.startsWith("video/")) {
    return { video: bytes, mimetype, caption: cap };
  }
  if (mimetype.startsWith("audio/")) {
    return { audio: bytes, mimetype };
  }
  return { document: bytes, mimetype, fileName: filename, caption: cap };
}

async function serveMedia(res, url) {
  const chat = chatId(url.searchParams.get("chat"));
  requireReady();
  const file = await downloadAndArchive(chat, url.searchParams.get("id") ?? "");
  if (!file) {
    send(res, 404, { error: "no media" }, CORS);
    return;
  }
  const name = file.filename ?? "arquivo";
  res.writeHead(200, {
    ...CORS,
    "content-type": file.mimetype,
    "content-length": file.bytes.length,
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "private, max-age=3600",
  });
  res.end(file.bytes);
}

async function receiveUpload(req, res, url) {
  requireReady();
  const chat = chatId(url.searchParams.get("chat"));
  const bytes = await readBody(req, MAX_UPLOAD);
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
  const sent = await sock.sendMessage(
    chat,
    contentFor(mimetype, bytes, filename, caption)
  );
  const [row] = await storeMessages([sent], true);
  if (row) {
    // We already have the bytes: archive right away
    const path = `media/${safe(chat)}/${safe(row.id)}.${extOf({ filename, mimetype })}`;
    await uploadFile(path, bytes, mimetype).catch(() => null);
    await setMediaResult(chat, row.id, {
      media_path: path,
      media_status: "done",
    }).catch(() => null);
  }
  send(res, 200, { message: row ? toApiMessage(row) : null }, CORS);
}

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
    await (action === "media"
      ? serveMedia(res, url)
      : receiveUpload(req, res, url));
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

/** Starts the socket, retrying while the database is unreachable. */
function boot() {
  start().catch((e) => {
    state.status = "disconnected";
    state.error = e.message;
    console.error("start:", e.message);
    setTimeout(boot, 15_000);
  });
}
boot();
