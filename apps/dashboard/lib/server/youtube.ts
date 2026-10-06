import type {
  YtChannel,
  YtComment,
  YtDuration,
  YtOrder,
  YtPlaylist,
  YtPlaylistSummary,
  YtSearchResult,
  YtVideo,
  YtVideoDetails,
} from "@/lib/youtube-types";

/**
 * YouTube Data API v3 (public data, API key only — no user login).
 * https://developers.google.com/youtube/v3/docs
 * Quota: search.list costs 100 units, list calls cost 1 (10 000/day free).
 */

const API = "https://www.googleapis.com/youtube/v3";
const ISO_DURATION = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
/** Playlists can be huge; cap how many items we expand for durations. */
const MAX_PLAYLIST_ITEMS = 500;

export class YoutubeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const youtubeKey = () => process.env.YOUTUBE_API_KEY || null;

/**
 * `token` = the user's Google OAuth token (their own channel, private
 * playlists, subscriptions); otherwise the server API key is used.
 */
async function yt<T>(
  path: string,
  params: Record<string, string | undefined>,
  token?: string
) {
  const key = youtubeKey();
  if (!(key || token)) {
    throw new YoutubeError(503, "YOUTUBE_API_KEY não configurada");
  }
  const query = new URLSearchParams(token ? {} : { key: key ?? "" });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      query.set(k, v);
    }
  }
  const res = await fetch(
    `${API}/${path}?${query}`,
    token
      ? { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      : { next: { revalidate: 600 } }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    const reason = body.error?.errors?.[0]?.reason;
    const message =
      reason === "quotaExceeded"
        ? "Cota diária da API do YouTube esgotada. Tente amanhã."
        : (body.error?.message ?? `YouTube respondeu ${res.status}`);
    throw new YoutubeError(res.status, message);
  }
  return (await res.json()) as T;
}

export function parseIsoDuration(iso: string | undefined) {
  const m = ISO_DURATION.exec(iso ?? "");
  if (!m) {
    return 0;
  }
  const [d, h, min, s] = [m[1], m[2], m[3], m[4]].map((v) => Number(v ?? 0));
  return (d ?? 0) * 86_400 + (h ?? 0) * 3600 + (min ?? 0) * 60 + (s ?? 0);
}

interface Thumbs {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
  maxres?: { url: string };
}

const thumb = (t: Thumbs | undefined) =>
  t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? "";

const num = (v: string | undefined) => (v === undefined ? null : Number(v));

interface RawVideo {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Thumbs;
    tags?: string[];
    liveBroadcastContent?: string;
  };
  contentDetails?: { duration?: string };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

function toVideo(v: RawVideo): YtVideo {
  return {
    id: v.id,
    title: v.snippet?.title ?? "",
    description: v.snippet?.description ?? "",
    channelId: v.snippet?.channelId ?? "",
    channelTitle: v.snippet?.channelTitle ?? "",
    publishedAt: v.snippet?.publishedAt ?? "",
    thumbnail: thumb(v.snippet?.thumbnails),
    duration: parseIsoDuration(v.contentDetails?.duration),
    views: Number(v.statistics?.viewCount ?? 0),
    likes: num(v.statistics?.likeCount),
    comments: num(v.statistics?.commentCount),
    tags: v.snippet?.tags ?? [],
    live: v.snippet?.liveBroadcastContent === "live",
  };
}

/** Full details for up to 50 ids per call (1 unit each call). */
export async function videosByIds(
  ids: string[],
  token?: string
): Promise<YtVideo[]> {
  const out: YtVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await yt<{ items?: RawVideo[] }>(
      "videos",
      {
        part: "snippet,contentDetails,statistics",
        id: chunk.join(","),
        maxResults: "50",
      },
      token
    );
    const byId = new Map((res.items ?? []).map((v) => [v.id, toVideo(v)]));
    for (const id of chunk) {
      const video = byId.get(id);
      if (video) {
        out.push(video);
      }
    }
  }
  return out;
}

export async function searchVideos(opts: {
  q: string;
  order?: YtOrder;
  duration?: YtDuration;
  channelId?: string;
  publishedAfter?: string;
  pageToken?: string;
  max?: number;
}): Promise<YtSearchResult> {
  const res = await yt<{
    items?: { id?: { videoId?: string } }[];
    nextPageToken?: string;
    pageInfo?: { totalResults?: number };
  }>("search", {
    part: "id",
    type: "video",
    q: opts.q,
    order: opts.order ?? "relevance",
    videoDuration:
      opts.duration && opts.duration !== "any" ? opts.duration : undefined,
    channelId: opts.channelId,
    publishedAfter: opts.publishedAfter,
    pageToken: opts.pageToken,
    maxResults: String(Math.min(Math.max(opts.max ?? 24, 1), 50)),
    relevanceLanguage: "pt",
    safeSearch: "moderate",
  });
  const ids = (res.items ?? [])
    .map((i) => i.id?.videoId)
    .filter((id): id is string => Boolean(id));
  return {
    videos: await videosByIds(ids),
    nextPageToken: res.nextPageToken ?? null,
    totalResults: res.pageInfo?.totalResults ?? ids.length,
  };
}

async function topComments(id: string): Promise<YtComment[]> {
  try {
    const res = await yt<{
      items?: {
        snippet?: {
          topLevelComment?: {
            snippet?: {
              authorDisplayName?: string;
              textOriginal?: string;
              likeCount?: number;
              publishedAt?: string;
            };
          };
        };
      }[];
    }>("commentThreads", {
      part: "snippet",
      videoId: id,
      order: "relevance",
      maxResults: "20",
      textFormat: "plainText",
    });
    return (res.items ?? []).map((t) => {
      const c = t.snippet?.topLevelComment?.snippet;
      return {
        author: c?.authorDisplayName ?? "",
        text: c?.textOriginal ?? "",
        likes: c?.likeCount ?? 0,
        publishedAt: c?.publishedAt ?? "",
      };
    });
  } catch {
    // Comments disabled on this video
    return [];
  }
}

export async function videoDetails(id: string): Promise<YtVideoDetails> {
  const [video] = await videosByIds([id]);
  if (!video) {
    throw new YoutubeError(404, "Vídeo não encontrado ou privado");
  }
  return { ...video, topComments: await topComments(id) };
}

interface RawChannel {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    thumbnails?: Thumbs;
  };
  statistics?: {
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
    viewCount?: string;
  };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

export async function channelInfo(ref: {
  id?: string;
  handle?: string;
}): Promise<YtChannel> {
  const res = await yt<{ items?: RawChannel[] }>("channels", {
    part: "snippet,statistics,contentDetails",
    id: ref.id,
    forHandle: ref.id ? undefined : ref.handle,
  });
  const c = res.items?.[0];
  if (!c) {
    throw new YoutubeError(404, "Canal não encontrado");
  }
  return {
    id: c.id,
    title: c.snippet?.title ?? "",
    handle: c.snippet?.customUrl ?? null,
    description: c.snippet?.description ?? "",
    thumbnail: thumb(c.snippet?.thumbnails),
    subscribers: c.statistics?.hiddenSubscriberCount
      ? null
      : num(c.statistics?.subscriberCount),
    videoCount: Number(c.statistics?.videoCount ?? 0),
    viewCount: Number(c.statistics?.viewCount ?? 0),
    uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

interface RawPlaylist {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Thumbs;
  };
  contentDetails?: { itemCount?: number };
}

const toPlaylist = (p: RawPlaylist): YtPlaylistSummary => ({
  id: p.id,
  title: p.snippet?.title ?? "",
  description: p.snippet?.description ?? "",
  thumbnail: thumb(p.snippet?.thumbnails),
  itemCount: p.contentDetails?.itemCount ?? 0,
  channelTitle: p.snippet?.channelTitle ?? "",
  publishedAt: p.snippet?.publishedAt ?? "",
});

export async function channelPlaylists(
  channelId: string,
  pageToken?: string,
  token?: string
) {
  const res = await yt<{ items?: RawPlaylist[]; nextPageToken?: string }>(
    "playlists",
    {
      part: "snippet,contentDetails",
      // "mine" lists private playlists too (needs the user's token)
      ...(channelId === "mine" ? { mine: "true" } : { channelId }),
      maxResults: "50",
      pageToken,
    },
    token
  );
  return {
    playlists: (res.items ?? []).map(toPlaylist),
    nextPageToken: res.nextPageToken ?? null,
  };
}

/** Playlist info plus its videos (with durations) and the total length. */
export async function playlistDetails(
  id: string,
  limit = MAX_PLAYLIST_ITEMS,
  token?: string
): Promise<YtPlaylist> {
  const meta = await yt<{ items?: RawPlaylist[] }>(
    "playlists",
    { part: "snippet,contentDetails", id },
    token
  );
  const raw = meta.items?.[0];
  if (!raw) {
    throw new YoutubeError(404, "Playlist não encontrada ou privada");
  }
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await yt<{
      items?: { contentDetails?: { videoId?: string } }[];
      nextPageToken?: string;
    }>(
      "playlistItems",
      { part: "contentDetails", playlistId: id, maxResults: "50", pageToken },
      token
    );
    for (const item of page.items ?? []) {
      if (item.contentDetails?.videoId) {
        ids.push(item.contentDetails.videoId);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < limit);
  const videos = await videosByIds(ids.slice(0, limit), token);
  const summary = toPlaylist(raw);
  return {
    ...summary,
    channelId: raw.snippet?.channelId ?? "",
    videos,
    totalDuration: videos.reduce((sum, v) => sum + v.duration, 0),
    truncated: summary.itemCount > videos.length,
  };
}

export interface YtSubscription {
  channelId: string;
  title: string;
  thumbnail: string;
}

/** The signed-in user's channel, playlists, subscriptions and liked videos. */
export async function myLibrary(token: string) {
  const [channels, playlists, subs, liked] = await Promise.all([
    yt<{ items?: RawChannel[] }>(
      "channels",
      { part: "snippet,statistics,contentDetails", mine: "true" },
      token
    ),
    channelPlaylists("mine", undefined, token),
    yt<{
      items?: {
        snippet?: {
          title?: string;
          thumbnails?: Thumbs;
          resourceId?: { channelId?: string };
        };
      }[];
    }>(
      "subscriptions",
      { part: "snippet", mine: "true", maxResults: "50", order: "relevance" },
      token
    ),
    yt<{ items?: RawVideo[] }>(
      "videos",
      {
        part: "snippet,contentDetails,statistics",
        myRating: "like",
        maxResults: "24",
      },
      token
    ).catch(() => ({ items: [] })),
  ]);
  const c = channels.items?.[0];
  return {
    channel: c
      ? {
          id: c.id,
          title: c.snippet?.title ?? "",
          handle: c.snippet?.customUrl ?? null,
          thumbnail: thumb(c.snippet?.thumbnails),
          subscribers: num(c.statistics?.subscriberCount),
          videoCount: Number(c.statistics?.videoCount ?? 0),
        }
      : null,
    playlists: playlists.playlists,
    subscriptions: (subs.items ?? []).map(
      (i): YtSubscription => ({
        channelId: i.snippet?.resourceId?.channelId ?? "",
        title: i.snippet?.title ?? "",
        thumbnail: thumb(i.snippet?.thumbnails),
      })
    ),
    liked: (liked.items ?? []).map(toVideo),
  };
}
