import type {
  LibChannel,
  LibItem,
  LibPlaylist,
  LibPrivacy,
} from "@/lib/video-library-types";
import { videosByIds, YoutubeError } from "./youtube";

/**
 * The user's own YouTube playlists, managed with their Google token
 * (scope youtube). Quota: inserts/updates/deletes cost 50 units each.
 * https://developers.google.com/youtube/v3/docs/playlists
 */

const API = "https://www.googleapis.com/youtube/v3";
const MAX_ITEMS = 500;

async function call<T>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  params: Record<string, string | undefined>,
  body?: unknown
): Promise<T> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      query.set(k, v);
    }
  }
  const res = await fetch(`${API}/${path}?${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (res.status === 204) {
    return {} as T;
  }
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; errors?: { reason?: string }[] };
  };
  if (!res.ok) {
    const reason = json.error?.errors?.[0]?.reason;
    let message = json.error?.message ?? `YouTube respondeu ${res.status}`;
    if (reason === "quotaExceeded") {
      message = "Cota diária da API do YouTube esgotada. Tente amanhã.";
    } else if (reason === "insufficientPermissions" || res.status === 403) {
      message =
        "Sua conexão com o Google não permite editar playlists. Reconecte em Conectores.";
    } else if (reason === "youtubeSignupRequired") {
      message = "Sua conta Google ainda não tem um canal do YouTube.";
    }
    throw new YoutubeError(res.status, message);
  }
  return json;
}

interface RawPlaylist {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: { medium?: { url: string }; high?: { url: string } };
  };
  status?: { privacyStatus?: LibPrivacy };
  contentDetails?: { itemCount?: number };
}

const toPlaylist = (p: RawPlaylist): LibPlaylist => ({
  id: p.id,
  title: p.snippet?.title ?? "",
  description: p.snippet?.description ?? "",
  thumbnail:
    p.snippet?.thumbnails?.high?.url ??
    p.snippet?.thumbnails?.medium?.url ??
    "",
  count: p.contentDetails?.itemCount ?? 0,
  privacy: p.status?.privacyStatus ?? "private",
  createdAt: p.snippet?.publishedAt ?? "",
});

export async function listMyPlaylists(token: string) {
  const out: LibPlaylist[] = [];
  let pageToken: string | undefined;
  do {
    const page = await call<{ items?: RawPlaylist[]; nextPageToken?: string }>(
      token,
      "GET",
      "playlists",
      {
        part: "snippet,status,contentDetails",
        mine: "true",
        maxResults: "50",
        pageToken,
      }
    );
    out.push(...(page.items ?? []).map(toPlaylist));
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 200);
  return out;
}

export async function listItems(token: string, playlistId: string) {
  const raw: { id: string; videoId: string; addedAt: string }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await call<{
      items?: {
        id: string;
        snippet?: { publishedAt?: string };
        contentDetails?: { videoId?: string };
      }[];
      nextPageToken?: string;
    }>(token, "GET", "playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
      pageToken,
    });
    for (const item of page.items ?? []) {
      if (item.contentDetails?.videoId) {
        raw.push({
          id: item.id,
          videoId: item.contentDetails.videoId,
          addedAt: item.snippet?.publishedAt ?? "",
        });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken && raw.length < MAX_ITEMS);
  const videos = new Map(
    (
      await videosByIds(
        raw.map((r) => r.videoId),
        token
      )
    ).map((v) => [v.id, v])
  );
  // Deleted/private videos have no details: drop them from the list
  return raw.flatMap((r): LibItem[] => {
    const video = videos.get(r.videoId);
    return video ? [{ itemId: r.id, addedAt: r.addedAt, video }] : [];
  });
}

export async function createPlaylist(
  token: string,
  title: string,
  privacy: LibPrivacy,
  description = ""
) {
  const created = await call<RawPlaylist>(
    token,
    "POST",
    "playlists",
    { part: "snippet,status" },
    {
      snippet: { title, description },
      status: { privacyStatus: privacy },
    }
  );
  return toPlaylist(created);
}

/** playlists.update replaces the snippet, so the description is resent. */
export async function updatePlaylist(
  token: string,
  id: string,
  changes: { title?: string; privacy?: LibPrivacy; description?: string }
) {
  const current = await call<{ items?: RawPlaylist[] }>(
    token,
    "GET",
    "playlists",
    { part: "snippet,status", id }
  );
  const p = current.items?.[0];
  if (!p) {
    throw new YoutubeError(404, "Playlist não encontrada");
  }
  const updated = await call<RawPlaylist>(
    token,
    "PUT",
    "playlists",
    { part: "snippet,status" },
    {
      id,
      snippet: {
        title: changes.title ?? p.snippet?.title ?? "",
        description: changes.description ?? p.snippet?.description ?? "",
      },
      status: {
        privacyStatus: changes.privacy ?? p.status?.privacyStatus ?? "private",
      },
    }
  );
  return toPlaylist(updated);
}

export function deletePlaylist(token: string, id: string) {
  return call(token, "DELETE", "playlists", { id });
}

export async function addVideo(
  token: string,
  playlistId: string,
  videoId: string
) {
  const item = await call<{ id: string }>(
    token,
    "POST",
    "playlistItems",
    { part: "snippet" },
    { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }
  );
  return item.id;
}

export function removeItem(token: string, itemId: string) {
  return call(token, "DELETE", "playlistItems", { id: itemId });
}

export async function listSubscriptions(token: string) {
  const out: LibChannel[] = [];
  let pageToken: string | undefined;
  do {
    const page = await call<{
      items?: {
        id: string;
        snippet?: {
          title?: string;
          thumbnails?: { default?: { url: string }; medium?: { url: string } };
          resourceId?: { channelId?: string };
        };
      }[];
      nextPageToken?: string;
    }>(token, "GET", "subscriptions", {
      part: "snippet",
      mine: "true",
      maxResults: "50",
      order: "alphabetical",
      pageToken,
    });
    for (const s of page.items ?? []) {
      if (s.snippet?.resourceId?.channelId) {
        out.push({
          channelId: s.snippet.resourceId.channelId,
          title: s.snippet.title ?? "",
          thumbnail:
            s.snippet.thumbnails?.medium?.url ??
            s.snippet.thumbnails?.default?.url ??
            "",
          subscriptionId: s.id,
        });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 300);
  return out;
}

export async function subscribe(token: string, channelId: string) {
  const sub = await call<{ id: string }>(
    token,
    "POST",
    "subscriptions",
    { part: "snippet" },
    { snippet: { resourceId: { kind: "youtube#channel", channelId } } }
  );
  return sub.id;
}

export function unsubscribe(token: string, subscriptionId: string) {
  return call(token, "DELETE", "subscriptions", { id: subscriptionId });
}
