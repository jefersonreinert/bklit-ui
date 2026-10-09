"use client";

import { useSyncExternalStore } from "react";
import { HUB_ID, hubNote, SEED_LOOKS, seedNotes } from "./seed";
import type { Note, NoteFile, NoteFileMeta } from "./types";

/**
 * Notes and their files live in IndexedDB on this device (images, videos and
 * PDFs are too big for localStorage). Notes are mirrored in memory so the UI
 * reads them synchronously; files are loaded on demand as object URLs.
 */

const DB_NAME = "cb-notes";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("notes")) {
        db.createObjectStore("notes", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(
  store: "notes" | "files",
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/* ------------------------------ notes store ------------------------------ */

interface State {
  ready: boolean;
  notes: Note[];
  files: NoteFileMeta[];
}

const EMPTY: State = { ready: false, notes: [], files: [] };
let state: State = EMPTY;
let loading = false;
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  for (const l of listeners) {
    l();
  }
}

async function load() {
  if (loading || state.ready) {
    return;
  }
  loading = true;
  try {
    let notes = await run<Note[]>("notes", "readonly", (s) => s.getAll());
    notes = await upgradeSeed(notes);
    if (notes.length === 0) {
      notes = seedNotes();
      await Promise.all(
        notes.map((n) => run("notes", "readwrite", (s) => s.put(n)))
      );
    }
    const files = await run<NoteFile[]>("files", "readonly", (s) => s.getAll());
    emit({
      ready: true,
      notes,
      files: files.map(({ blob: _blob, ...meta }) => meta),
    });
  } catch {
    // IndexedDB unavailable (private mode): work in memory for this session
    emit({ ready: true, notes: seedNotes(), files: [] });
  } finally {
    loading = false;
  }
}

/**
 * One-time upgrade of the starter notes saved before pages had icons,
 * covers and sub-pages. Notes the person created are never touched.
 */
async function upgradeSeed(notes: Note[]) {
  const old = notes.filter((n) => n.id in SEED_LOOKS && !("icon" in n));
  if (old.length === 0) {
    return notes;
  }
  const changed = old.map((n) => ({
    ...n,
    ...SEED_LOOKS[n.id],
    folder: SEED_LOOKS[n.id]?.parentId ? "" : n.folder,
  }));
  const added = notes.some((n) => n.id === HUB_ID) ? [] : [hubNote()];
  await Promise.all(
    [...changed, ...added].map((n) =>
      run("notes", "readwrite", (s) => s.put(n))
    )
  );
  const byId = new Map(changed.map((n) => [n.id, n]));
  return [...notes.map((n) => byId.get(n.id) ?? n), ...added];
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
}

export function useNotes() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY
  );
}

/* ------------------------------ sync hooks ------------------------------- */

export type LocalChange =
  | { kind: "save"; note: Note }
  | { kind: "delete"; id: string; at: number };

const changeListeners = new Set<(c: LocalChange) => void>();

/** Edits made on this device (the Convex sync uploads them). */
export function onLocalChange(listener: (c: LocalChange) => void) {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function notifyChange(change: LocalChange) {
  for (const l of changeListeners) {
    l(change);
  }
}

const TOMBSTONES_KEY = "cb:notes:tombstones";

/** Notes deleted here, so an older server copy can't bring them back. */
function tombstones(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(TOMBSTONES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function setTombstone(id: string, at: number | null) {
  const all = tombstones();
  if (at === null) {
    delete all[id];
  } else {
    all[id] = at;
  }
  try {
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(all));
  } catch {
    // Storage full: the server tombstone still protects other devices
  }
}

/** Deletions made here, for the sync to replay after being offline. */
export const localTombstones = () => tombstones();

/** Current notes once IndexedDB has loaded. */
export async function loadedNotes() {
  await load();
  return state.notes;
}

/**
 * Applies notes from the server: newer versions replace local ones and
 * tombstones delete them. Never echoes back as a local change.
 */
export function applyRemote(remote: (Note & { deleted: boolean })[]) {
  const byId = new Map(state.notes.map((n) => [n.id, n]));
  const dead = tombstones();
  let changed = false;
  for (const r of remote) {
    const local = byId.get(r.id);
    const deletedAt = dead[r.id];
    if (deletedAt !== undefined) {
      if (r.deleted) {
        setTombstone(r.id, null);
      }
      if (deletedAt >= r.updatedAt) {
        continue;
      }
    }
    if (local && local.updatedAt >= r.updatedAt) {
      continue;
    }
    const { deleted, ...note } = r;
    if (deleted) {
      if (local) {
        byId.delete(r.id);
        changed = true;
        run("notes", "readwrite", (s) => s.delete(r.id)).catch(() => null);
      }
      continue;
    }
    byId.set(r.id, note);
    changed = true;
    run("notes", "readwrite", (s) => s.put(note)).catch(() => null);
  }
  if (changed) {
    emit({ ...state, notes: [...byId.values()] });
  }
}

export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function saveNote(note: Note) {
  const next = { ...note, updatedAt: Date.now() };
  const exists = state.notes.some((n) => n.id === note.id);
  emit({
    ...state,
    notes: exists
      ? state.notes.map((n) => (n.id === note.id ? next : n))
      : [...state.notes, next],
  });
  run("notes", "readwrite", (s) => s.put(next)).catch(() => null);
  notifyChange({ kind: "save", note: next });
  return next;
}

export function createNote(init: Partial<Note> = {}) {
  const now = Date.now();
  return saveNote({
    id: newId(),
    title: init.title ?? "Sem título",
    folder: init.folder ?? "",
    content: init.content ?? "",
    pinned: false,
    icon: init.icon,
    cover: init.cover,
    parentId: init.parentId ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Deletes a page; its sub-pages move up to the deleted page's parent. */
export function deleteNote(id: string) {
  const removed = state.notes.find((n) => n.id === id);
  for (const child of state.notes.filter((n) => n.parentId === id)) {
    saveNote({ ...child, parentId: removed?.parentId ?? null });
  }
  emit({ ...state, notes: state.notes.filter((n) => n.id !== id) });
  run("notes", "readwrite", (s) => s.delete(id)).catch(() => null);
  const at = Date.now();
  setTombstone(id, at);
  notifyChange({ kind: "delete", id, at });
}

/** Parent chain from the root down to (not including) the note. */
export function ancestors(notes: Note[], note: Note) {
  const chain: Note[] = [];
  const seen = new Set([note.id]);
  let parent = notes.find((n) => n.id === note.parentId);
  while (parent && !seen.has(parent.id)) {
    chain.unshift(parent);
    seen.add(parent.id);
    parent = notes.find((n) => n.id === parent?.parentId);
  }
  return chain;
}

export const childrenOf = (notes: Note[], id: string) =>
  notes
    .filter((n) => n.parentId === id)
    .sort((a, b) => a.createdAt - b.createdAt);

/* --------------------------------- files --------------------------------- */

export async function addFile(
  file: File,
  opts: { library?: boolean } = {}
): Promise<NoteFileMeta> {
  const record: NoteFile = {
    id: newId(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
    createdAt: Date.now(),
    library: opts.library,
  };
  await run("files", "readwrite", (s) => s.put(record));
  const { blob: _blob, ...meta } = record;
  emit({ ...state, files: [...state.files, meta] });
  return meta;
}

const urls = new Map<string, string>();

/** Object URL for an attachment (cached for the session). */
export async function fileUrl(id: string) {
  const cached = urls.get(id);
  if (cached) {
    return cached;
  }
  const record = await run<NoteFile | undefined>("files", "readonly", (s) =>
    s.get(id)
  );
  if (!record) {
    return null;
  }
  const url = URL.createObjectURL(record.blob);
  urls.set(id, url);
  return url;
}

export const fileMeta = (id: string) => state.files.find((f) => f.id === id);

/** Removes an image from the library (pages already using it keep it). */
export async function removeFromLibrary(id: string) {
  const record = await run<NoteFile | undefined>("files", "readonly", (s) =>
    s.get(id)
  );
  if (!record) {
    return;
  }
  await run("files", "readwrite", (s) => s.put({ ...record, library: false }));
  emit({
    ...state,
    files: state.files.map((f) => (f.id === id ? { ...f, library: false } : f)),
  });
}

/** Notes and file list as they are now (for import/export). */
export const currentNotes = () => state.notes;
export const currentFiles = () => state.files;

/** The stored file itself (for export). */
export async function fileBlob(id: string) {
  const record = await run<NoteFile | undefined>("files", "readonly", (s) =>
    s.get(id)
  );
  return record?.blob ?? null;
}
