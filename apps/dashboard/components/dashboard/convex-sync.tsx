"use client";

import { ConvexProvider, useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
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
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

type Upsert = ReturnType<typeof useMutation<typeof api.notes.upsert>>;
type Remove = ReturnType<typeof useMutation<typeof api.notes.remove>>;

/** First contact: send what the server lacks or has older, replay deletes. */
function uploadMissing(
  local: Note[],
  remote: Doc<"notes">[],
  upsert: Upsert,
  remove: Remove
) {
  const server = new Map(remote.map((r) => [r.clientId, r]));
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

function NotesSync() {
  const remote = useQuery(api.notes.list);
  const upsert = useMutation(api.notes.upsert);
  const remove = useMutation(api.notes.remove);
  const merged = useRef(false);
  const online = Array.isArray(remote);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  useEffect(() => {
    if (!remote) {
      merged.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      const local = await loadedNotes();
      if (cancelled) {
        return;
      }
      applyRemote(remote.map(toNote));
      if (merged.current) {
        return;
      }
      merged.current = true;
      uploadMissing(local, remote, upsert, remove);
    })();
    return () => {
      cancelled = true;
    };
  }, [remote, upsert, remove]);

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
