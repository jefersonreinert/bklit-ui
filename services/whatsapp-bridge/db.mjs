import { createClient } from "@supabase/supabase-js";
import { BufferJSON, initAuthCreds, proto } from "baileys";

/**
 * Supabase archive: WhatsApp auth state, chats, contacts, every message and
 * its media (bucket "wa-media"). Uses the service key; tables have RLS on,
 * so nothing is readable with the public key.
 */

export const BUCKET = "wa-media";
const BATCH = 400;
const SIGNED_URL_S = 60 * 60;

export const db = createClient(
  // Placeholder keeps the import from throwing; server.mjs exits with a clear message
  process.env.SUPABASE_URL || "http://supabase.invalid",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "missing",
  { auth: { persistSession: false } }
);

const encode = (value) =>
  JSON.parse(JSON.stringify(value, BufferJSON.replacer));
const decode = (value) => JSON.parse(JSON.stringify(value), BufferJSON.reviver);

function check({ error }, what) {
  if (error) {
    throw new Error(`${what}: ${error.message}`);
  }
}

/* ------------------------------ auth state ------------------------------ */

async function readAuth(id) {
  const { data, error } = await db
    .from("wa_auth")
    .select("value")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`auth read: ${error.message}`);
  }
  return data ? decode(data.value) : null;
}

/** Baileys auth state stored in wa_auth (like useMultiFileAuthState). */
export async function useDbAuthState() {
  const creds = (await readAuth("creds")) ?? initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const { data, error } = await db
            .from("wa_auth")
            .select("id, value")
            .in(
              "id",
              ids.map((id) => `${type}-${id}`)
            );
          if (error) {
            throw new Error(`auth keys: ${error.message}`);
          }
          const found = new Map(data.map((r) => [r.id, decode(r.value)]));
          const out = {};
          for (const id of ids) {
            let value = found.get(`${type}-${id}`) ?? null;
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            out[id] = value;
          }
          return out;
        },
        set: async (data) => {
          const upserts = [];
          const removals = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                upserts.push({ id: key, value: encode(value) });
              } else {
                removals.push(key);
              }
            }
          }
          for (let i = 0; i < upserts.length; i += BATCH) {
            check(
              await db.from("wa_auth").upsert(upserts.slice(i, i + BATCH)),
              "auth upsert"
            );
          }
          if (removals.length > 0) {
            check(
              await db.from("wa_auth").delete().in("id", removals),
              "auth delete"
            );
          }
        },
      },
    },
    saveCreds: async () => {
      check(
        await db.from("wa_auth").upsert({ id: "creds", value: encode(creds) }),
        "creds save"
      );
    },
  };
}

export async function clearAuth() {
  check(await db.from("wa_auth").delete().neq("id", ""), "auth clear");
}

/* -------------------------------- archive ------------------------------- */

async function upsertBatches(table, rows, options = {}) {
  for (let i = 0; i < rows.length; i += BATCH) {
    check(
      await db.from(table).upsert(rows.slice(i, i + BATCH), options),
      `${table} upsert`
    );
  }
}

export const saveChats = (rows) => upsertBatches("wa_chats", rows);
export const saveContacts = (rows) => upsertBatches("wa_contacts", rows);
/** New messages only: re-delivered ones keep their archived media state. */
export const saveMessages = (rows) =>
  upsertBatches("wa_messages", rows, {
    onConflict: "chat_id,id",
    ignoreDuplicates: true,
  });

export { encode };

export async function patchChat(id, patch) {
  check(
    await db
      .from("wa_chats")
      .upsert({ id, ...patch, updated_at: new Date().toISOString() }),
    "chat patch"
  );
}

/** Updates the chat's preview if this message is newer than the stored one. */
export async function touchChat(row) {
  const { data } = await db
    .from("wa_chats")
    .select("last_ts")
    .eq("id", row.chat_id)
    .maybeSingle();
  if (data && Number(data.last_ts) > row.ts) {
    return;
  }
  await patchChat(row.chat_id, {
    last_ts: row.ts,
    last_body: row.body?.slice(0, 300) ?? null,
    last_type: row.type,
    last_from_me: row.from_me,
    is_group: row.chat_id.endsWith("@g.us"),
  });
}

export async function messageRaw(chatId, id) {
  const { data, error } = await db
    .from("wa_messages")
    .select("raw, media, media_path, type")
    .eq("chat_id", chatId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data ? { ...data, raw: data.raw ? decode(data.raw) : null } : null;
}

export async function setMediaResult(chatId, id, patch) {
  check(
    await db
      .from("wa_messages")
      .update(patch)
      .eq("chat_id", chatId)
      .eq("id", id),
    "media result"
  );
}

export async function pendingMedia(limit) {
  const { data, error } = await db
    .from("wa_messages")
    .select("chat_id, id")
    .eq("media_status", "pending")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function chatsNeedingAvatar(limit) {
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data, error } = await db
    .from("wa_chats")
    .select("id")
    .or(`avatar_checked_at.is.null,avatar_checked_at.lt.${week}`)
    .order("last_ts", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function uploadFile(path, bytes, contentType) {
  check(
    await db.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true }),
    "storage upload"
  );
}

/** Signed URLs for many storage paths at once (path → url). */
export async function signPaths(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrls(unique, SIGNED_URL_S);
  if (error) {
    return new Map();
  }
  return new Map(
    data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])
  );
}

/* -------------------------------- reading ------------------------------- */

export async function listChats(limit) {
  const { data, error } = await db
    .from("wa_chats")
    .select("*")
    .order("last_ts", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  const ids = data.map((c) => c.id);
  const contacts = new Map();
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data: rows } = await db
      .from("wa_contacts")
      .select("id, name, notify")
      .in("id", ids.slice(i, i + BATCH));
    for (const r of rows ?? []) {
      contacts.set(r.id, r);
    }
  }
  const urls = await signPaths(data.map((c) => c.avatar_path));
  return data.map((c) => {
    const contact = contacts.get(c.id);
    return {
      id: c.id,
      name: c.name || contact?.name || contact?.notify || c.id.split("@")[0],
      isGroup: c.is_group,
      archived: c.archived,
      unread: c.unread,
      timestamp: Number(c.last_ts) || 0,
      avatarUrl: urls.get(c.avatar_path) ?? null,
      last: c.last_type
        ? {
            body: c.last_body ?? "",
            fromMe: Boolean(c.last_from_me),
            type: c.last_type,
          }
        : null,
    };
  });
}

/** Messages of a chat, newest `limit` (optionally before a timestamp), oldest first. */
export async function listMessages(chatId, limit, before) {
  let query = db
    .from("wa_messages")
    .select(
      "id, from_me, author, ts, type, body, media, media_path, media_status"
    )
    .eq("chat_id", chatId)
    .order("ts", { ascending: false })
    .limit(limit);
  if (before) {
    query = query.lt("ts", before);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  const urls = await signPaths(data.map((m) => m.media_path));
  return data.reverse().map((m) => ({
    id: m.id,
    body: m.body ?? "",
    type: m.type,
    fromMe: m.from_me,
    author: m.author,
    timestamp: Number(m.ts),
    hasMedia: Boolean(m.media),
    media: m.media,
    mediaStatus: m.media_status,
    mediaUrl: urls.get(m.media_path) ?? null,
  }));
}

export async function unreadKeys(chatId) {
  const { data } = await db
    .from("wa_messages")
    .select("id, author")
    .eq("chat_id", chatId)
    .eq("from_me", false)
    .order("ts", { ascending: false })
    .limit(20);
  return (data ?? []).map((m) => ({
    remoteJid: chatId,
    id: m.id,
    fromMe: false,
    participant: m.author ?? undefined,
  }));
}

export async function stats() {
  const [chats, messages, media] = await Promise.all([
    db.from("wa_chats").select("id", { count: "exact", head: true }),
    db.from("wa_messages").select("id", { count: "exact", head: true }),
    db
      .from("wa_messages")
      .select("id", { count: "exact", head: true })
      .eq("media_status", "done"),
  ]);
  return {
    chats: chats.count ?? 0,
    messages: messages.count ?? 0,
    mediaArchived: media.count ?? 0,
  };
}
