"use client";

import { ConvexProvider, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  applyRemote,
  type LocalChange,
  loadedNotes,
  localTombstones,
  onLocalChange,
} from "@/lib/notes/db";
import type { Note } from "@/lib/notes/types";
import { convexClient } from "@/lib/sync/convex-client";
import { useStoresSync } from "@/lib/sync/stores";

/**
 * Keeps this device and Convex in step: notes one by one (so a note the AI
 * is writing shows up live on every screen) and each module's local store.
 * Without NEXT_PUBLIC_CONVEX_URL it renders nothing and the app stays local.
 */

const UPLOAD_DELAY_MS = 250;

function toNote(d: Doc<"notes">): Note & { deleted: boolean } {
  return {
    id: d.clientId,
    title: d.title,
    folder: d.folder,
    content: d.content,
    pinned: d.pinned,
    icon: d.icon,
    cover: d.cover,
    parentId: d.parentId ?? null,
    ...(d.origin ? { origin: d.origin } : {}),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    deleted: d.deleted,
  };
}

function toArgs(n: Note) {
  return {
    clientId: n.id,
    title: n.title,
    folder: n.folder ?? "",
    content: n.content,
    pinned: Boolean(n.pinned),
    ...(n.icon ? { icon: n.icon } : {}),
    ...(n.cover ? { cover: n.cover } : {}),
    parentId: n.parentId ?? null,
    ...(n.origin ? { origin: n.origin } : {}),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

type Upsert = ReturnType<typeof useMutation<typeof api.notes.upsert>>;
type Remove = ReturnType<typeof useMutation<typeof api.notes.remove>>;

interface ServerMeta {
  updatedAt: number;
  deleted: boolean;
}

/** First contact: send what the server lacks or has older, replay deletes. */
function uploadMissing(
  local: Note[],
  server: Map<string, ServerMeta>,
  upsert: Upsert,
  remove: Remove
) {
  for (const n of local) {
    const r = server.get(n.id);
    if (!r || r.updatedAt < n.updatedAt) {
      upsert(toArgs(n)).catch(() => null);
    }
  }
  for (const [id, at] of Object.entries(localTombstones())) {
    if (server.get(id)?.deleted === false) {
      remove({ clientId: id, updatedAt: at }).catch(() => null);
    }
  }
}

const CURSOR_KEY = "cb:notes:synced";

/** Applies a page of server changes; returns the new cursor. */
function applyPage(
  docs: Doc<"notes">[],
  server: Map<string, ServerMeta>,
  cursor: number
) {
  applyRemote(docs.map(toNote));
  for (const d of docs) {
    server.set(d.clientId, { updatedAt: d.updatedAt, deleted: d.deleted });
  }
  const last = docs.at(-1)?.syncedAt ?? cursor;
  try {
    localStorage.setItem(CURSOR_KEY, String(last));
  } catch {
    // storage full: next visit downloads again
  }
  return last;
}

/**
 * What the server has: the changes downloaded now, plus notes this device
 * already had at its saved cursor (unless they changed here since).
 */
function knownOnServer(
  local: Note[],
  server: Map<string, ServerMeta>,
  cursor: number
) {
  const known = new Map(server);
  if (cursor > 0) {
    for (const n of local) {
      if (!known.has(n.id) && n.updatedAt <= cursor) {
        known.set(n.id, { updatedAt: n.updatedAt, deleted: false });
      }
    }
  }
  return known;
}

/** Server stamp this device has caught up to (notes live in IndexedDB). */
function savedCursor() {
  try {
    return Number(localStorage.getItem(CURSOR_KEY) ?? "-1") || -1;
  } catch {
    return -1;
  }
}

/**
 * Downloads only notes changed since the last stamp this device saw, then
 * stays subscribed for new changes (one note per save, not every note).
 */
function NotesSync() {
  const [cursor, setCursor] = useState(savedCursor);
  const page = useQuery(api.notes.since, { after: cursor });
  const upsert = useMutation(api.notes.upsert);
  const remove = useMutation(api.notes.remove);
  const server = useRef(new Map<string, ServerMeta>());
  const merged = useRef(false);
  // undefined while the next page loads: keep the last known state
  const onlineRef = useRef(false);
  if (page !== undefined) {
    onlineRef.current = page !== null;
  }

  useEffect(() => {
    if (!page) {
      return;
    }
    let cancelled = false;
    (async () => {
      const local = await loadedNotes();
      if (cancelled) {
        return;
      }
      if (page.docs.length > 0) {
        setCursor(applyPage(page.docs, server.current, cursor));
      }
      if (page.more || merged.current) {
        return;
      }
      merged.current = true;
      uploadMissing(
        local,
        knownOnServer(local, server.current, cursor),
        upsert,
        remove
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [page, cursor, upsert, remove]);

  useEffect(() => {
    const pending = new Map<string, LocalChange>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      for (const change of pending.values()) {
        if (change.kind === "save") {
          upsert(toArgs(change.note)).catch(() => null);
        } else {
          remove({ clientId: change.id, updatedAt: change.at }).catch(
            () => null
          );
        }
      }
      pending.clear();
    };
    return onLocalChange((change) => {
      if (!onlineRef.current) {
        return;
      }
      pending.set(change.kind === "save" ? change.note.id : change.id, change);
      if (!timer) {
        timer = setTimeout(flush, UPLOAD_DELAY_MS);
      }
    });
  }, [upsert, remove]);

  return null;
}

function StoresSync() {
  useStoresSync();
  return null;
}

export function ConvexSync() {
  const client = convexClient();
  if (!client) {
    return null;
  }
  return (
    <ConvexProvider client={client}>
      <NotesSync />
      <StoresSync />
    </ConvexProvider>
  );
}
