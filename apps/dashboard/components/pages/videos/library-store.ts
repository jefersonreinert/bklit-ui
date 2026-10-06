"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BASE_PATH, type ConnectorsStatus } from "@/lib/use-connectors";
import {
  type LibItem,
  type LibPlaylist,
  type LibPrivacy,
  SAVED_TITLE,
} from "@/lib/video-library-types";
import type { YtVideo } from "@/lib/youtube-types";

/**
 * One video library for the whole app. With the Google login (YouTube
 * permission) playlists live in the user's YouTube account and sync across
 * devices; otherwise they are kept in this browser.
 */

export type LibraryMode = "loading" | "youtube" | "local";

interface LocalPlaylist extends LibPlaylist {
  items: LibItem[];
}

interface State {
  mode: LibraryMode;
  playlists: LibPlaylist[];
  /** Videos in "Salvos" (for the bookmark toggle). */
  saved: Map<string, string>;
  error: string | null;
}

const LOCAL_KEY = "casa-brasa-video-library-v1";
const API = `${BASE_PATH}/api/youtube/library/`;

let state: State = {
  mode: "loading",
  playlists: [],
  saved: new Map(),
  error: null,
};
const listeners = new Set<() => void>();
let initializedFor: string | null = null;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) {
    l();
  }
}

/* --------------------------------- local -------------------------------- */

const uid = () =>
  `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function readLocal(): LocalPlaylist[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      return JSON.parse(raw) as LocalPlaylist[];
    }
  } catch {
    // unreadable — start fresh
  }
  return [];
}

function writeLocal(list: LocalPlaylist[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    set({
      error: "Não foi possível salvar neste navegador (armazenamento cheio).",
    });
  }
}

const summarize = (p: LocalPlaylist): LibPlaylist => ({
  id: p.id,
  title: p.title,
  description: p.description,
  privacy: p.privacy,
  createdAt: p.createdAt,
  count: p.items.length,
  thumbnail: p.items[0]?.video.thumbnail ?? "",
});

function publishLocal(list: LocalPlaylist[]) {
  const savedList = list.find((p) => p.title === SAVED_TITLE);
  set({
    playlists: list.map(summarize),
    saved: new Map(savedList?.items.map((i) => [i.video.id, i.itemId]) ?? []),
  });
}

function mutateLocal(fn: (list: LocalPlaylist[]) => LocalPlaylist[]) {
  const next = fn(readLocal());
  writeLocal(next);
  publishLocal(next);
  return next;
}

/* -------------------------------- youtube ------------------------------- */

async function api<T>(init?: { method: "POST"; body: unknown }, query = "") {
  const res = await fetch(`${API}${query}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return body;
}

async function loadYoutube() {
  const { playlists } = await api<{ playlists: LibPlaylist[] }>();
  const savedList = playlists.find((p) => p.title === SAVED_TITLE);
  const items = savedList ? await fetchItems(savedList.id) : [];
  set({
    playlists,
    saved: new Map(items.map((i) => [i.video.id, i.itemId])),
    error: null,
  });
}

function fetchItems(id: string) {
  return api<{ items: LibItem[] }>(
    undefined,
    `?id=${encodeURIComponent(id)}`
  ).then((r) => r.items);
}

/* --------------------------------- public ------------------------------- */

/** Picks the backend from the connectors status (call once per page). */
export function initLibrary(status: ConnectorsStatus | null) {
  if (!status) {
    return;
  }
  const mode: LibraryMode = status.google.youtubeManage ? "youtube" : "local";
  const key = `${mode}:${status.google.email ?? ""}`;
  if (initializedFor === key) {
    return;
  }
  initializedFor = key;
  set({ mode, error: null });
  if (mode === "local") {
    publishLocal(readLocal());
    return;
  }
  loadYoutube().catch((e: unknown) =>
    set({ error: e instanceof Error ? e.message : "Erro ao carregar" })
  );
}

export function loadItems(id: string): Promise<LibItem[]> {
  if (state.mode === "local") {
    return Promise.resolve(readLocal().find((p) => p.id === id)?.items ?? []);
  }
  return fetchItems(id);
}

export async function createPlaylist(title: string, privacy: LibPrivacy) {
  if (state.mode === "local") {
    const playlist: LocalPlaylist = {
      id: uid(),
      title,
      description: "",
      privacy,
      createdAt: new Date().toISOString(),
      count: 0,
      thumbnail: "",
      items: [],
    };
    mutateLocal((list) => [...list, playlist]);
    return summarize(playlist);
  }
  const { playlist } = await api<{ playlist: LibPlaylist }>({
    method: "POST",
    body: { action: "create", title, privacy },
  });
  set({ playlists: [playlist, ...state.playlists] });
  return playlist;
}

export async function renamePlaylist(id: string, title: string) {
  if (state.mode === "local") {
    mutateLocal((list) => list.map((p) => (p.id === id ? { ...p, title } : p)));
    return;
  }
  const { playlist } = await api<{ playlist: LibPlaylist }>({
    method: "POST",
    body: { action: "rename", id, title },
  });
  set({
    playlists: state.playlists.map((p) =>
      p.id === id ? { ...p, title: playlist.title } : p
    ),
  });
}

export async function setPrivacy(id: string, privacy: LibPrivacy) {
  if (state.mode === "local") {
    mutateLocal((list) =>
      list.map((p) => (p.id === id ? { ...p, privacy } : p))
    );
    return;
  }
  await api({ method: "POST", body: { action: "privacy", id, privacy } });
  set({
    playlists: state.playlists.map((p) =>
      p.id === id ? { ...p, privacy } : p
    ),
  });
}

export async function deletePlaylist(id: string) {
  if (state.mode === "local") {
    mutateLocal((list) => list.filter((p) => p.id !== id));
    return;
  }
  await api({ method: "POST", body: { action: "delete", id } });
  const removed = state.playlists.find((p) => p.id === id);
  set({
    playlists: state.playlists.filter((p) => p.id !== id),
    saved: removed?.title === SAVED_TITLE ? new Map() : state.saved,
  });
}

function bump(id: string, delta: number, thumbnail?: string) {
  set({
    playlists: state.playlists.map((p) =>
      p.id === id
        ? {
            ...p,
            count: Math.max(0, p.count + delta),
            thumbnail: p.thumbnail || thumbnail || "",
          }
        : p
    ),
  });
}

export async function addToPlaylist(id: string, video: YtVideo) {
  const isSaved =
    state.playlists.find((p) => p.id === id)?.title === SAVED_TITLE;
  if (state.mode === "local") {
    mutateLocal((list) =>
      list.map((p) =>
        p.id === id && !p.items.some((i) => i.video.id === video.id)
          ? {
              ...p,
              items: [
                ...p.items,
                { itemId: uid(), addedAt: new Date().toISOString(), video },
              ],
            }
          : p
      )
    );
    return;
  }
  const { itemId } = await api<{ itemId: string }>({
    method: "POST",
    body: { action: "add", id, videoId: video.id },
  });
  bump(id, 1, video.thumbnail);
  if (isSaved) {
    set({ saved: new Map(state.saved).set(video.id, itemId) });
  }
}

export async function removeFromPlaylist(id: string, itemId: string) {
  if (state.mode === "local") {
    mutateLocal((list) =>
      list.map((p) =>
        p.id === id
          ? { ...p, items: p.items.filter((i) => i.itemId !== itemId) }
          : p
      )
    );
    return;
  }
  await api({ method: "POST", body: { action: "remove", itemId } });
  bump(id, -1);
  const saved = new Map(state.saved);
  for (const [videoId, savedItem] of saved) {
    if (savedItem === itemId) {
      saved.delete(videoId);
    }
  }
  set({ saved });
}

async function savedPlaylistId() {
  const existing = state.playlists.find((p) => p.title === SAVED_TITLE);
  if (existing) {
    return existing.id;
  }
  return (await createPlaylist(SAVED_TITLE, "private")).id;
}

/** Bookmark toggle: adds to / removes from "Salvos". */
export async function toggleSaved(video: YtVideo) {
  const id = await savedPlaylistId();
  const itemId = state.saved.get(video.id);
  if (itemId) {
    await removeFromPlaylist(id, itemId);
  } else {
    await addToPlaylist(id, video);
  }
}

export function useLibrary() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}

/** Convenience: init + subscribe. */
export function useLibraryWith(status: ConnectorsStatus | null) {
  useEffect(() => initLibrary(status), [status]);
  return useLibrary();
}

/* ------------------------------ watch progress --------------------------- */

const PROGRESS_KEY = "casa-brasa-video-progress";

export interface Progress {
  /** Seconds watched. */
  t: number;
  /** Video length in seconds. */
  d: number;
  at: number;
  video?: YtVideo;
}

export function readProgress(): Record<string, Progress> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") as Record<
      string,
      Progress
    >;
  } catch {
    return {};
  }
}

export function saveProgress(id: string, p: Progress) {
  try {
    const all = readProgress();
    all[id] = p;
    // Keep the 200 most recent
    const trimmed = Object.fromEntries(
      Object.entries(all)
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, 200)
    );
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(trimmed));
  } catch {
    // storage unavailable — progress just isn't remembered
  }
}
