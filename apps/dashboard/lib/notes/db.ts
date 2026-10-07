"use client";

import { useSyncExternalStore } from "react";
import { seedNotes } from "./seed";
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
    createdAt: now,
    updatedAt: now,
  });
}

export function deleteNote(id: string) {
  emit({ ...state, notes: state.notes.filter((n) => n.id !== id) });
  run("notes", "readwrite", (s) => s.delete(id)).catch(() => null);
}

/* --------------------------------- files --------------------------------- */

export async function addFile(file: File): Promise<NoteFileMeta> {
  const record: NoteFile = {
    id: newId(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
    createdAt: Date.now(),
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
