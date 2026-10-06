/** Shapes shared by the YouTube API routes, the YouTube page and AI tools. */

export interface YtVideo {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  /** Seconds. 0 for live streams. */
  duration: number;
  views: number;
  likes: number | null;
  comments: number | null;
  tags: string[];
  live: boolean;
}

export interface YtComment {
  author: string;
  text: string;
  likes: number;
  publishedAt: string;
}

export interface YtVideoDetails extends YtVideo {
  topComments: YtComment[];
}

export interface YtChannel {
  id: string;
  title: string;
  handle: string | null;
  description: string;
  thumbnail: string;
  subscribers: number | null;
  videoCount: number;
  viewCount: number;
  uploadsPlaylistId: string | null;
}

export interface YtPlaylistSummary {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  itemCount: number;
  channelTitle: string;
  publishedAt: string;
}

export interface YtPlaylist extends YtPlaylistSummary {
  channelId: string;
  videos: YtVideo[];
  /** Sum of the listed videos' durations, in seconds. */
  totalDuration: number;
  /** True when the playlist has more videos than were loaded. */
  truncated: boolean;
}

export interface YtSearchResult {
  videos: YtVideo[];
  nextPageToken: string | null;
  totalResults: number;
}

export interface YtTranscriptSegment {
  /** Seconds from the start, or null when the line has no timestamp. */
  start: number | null;
  text: string;
}

export interface YtTranscript {
  videoId: string;
  segments: YtTranscriptSegment[];
  text: string;
  model: string;
}

export type YtOrder = "relevance" | "date" | "viewCount" | "rating";
export type YtDuration = "any" | "short" | "medium" | "long";

export const YT_ORDERS: { id: YtOrder; label: string }[] = [
  { id: "relevance", label: "Relevância" },
  { id: "date", label: "Mais recentes" },
  { id: "viewCount", label: "Mais vistos" },
  { id: "rating", label: "Mais bem avaliados" },
];

export const YT_DURATIONS: { id: YtDuration; label: string }[] = [
  { id: "any", label: "Qualquer duração" },
  { id: "short", label: "Até 4 min" },
  { id: "medium", label: "4 a 20 min" },
  { id: "long", label: "Mais de 20 min" },
];

const VIDEO_ID = /^[\w-]{11}$/;
const URL_VIDEO =
  /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/;
const URL_PLAYLIST = /[?&]list=([\w-]+)/;
const URL_CHANNEL_ID = /\/channel\/(UC[\w-]{22})/;
const URL_HANDLE = /(?:youtube\.com\/)?(@[\w.-]+)/;
const HAS_DIGIT = /\d/;
const HAS_UPPER = /[A-Z]/;

export type YtLink =
  | { kind: "video"; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "channel"; id: string }
  | { kind: "handle"; handle: string };

/** Recognizes a pasted YouTube URL, @handle or bare video id. */
export function parseYtLink(input: string): YtLink | null {
  const value = input.trim();
  const video = URL_VIDEO.exec(value);
  const playlist = URL_PLAYLIST.exec(value);
  if (playlist?.[1] && !video) {
    return { kind: "playlist", id: playlist[1] };
  }
  if (video?.[1]) {
    return { kind: "video", id: video[1] };
  }
  const channel = URL_CHANNEL_ID.exec(value);
  if (channel?.[1]) {
    return { kind: "channel", id: channel[1] };
  }
  const handle = URL_HANDLE.exec(value);
  if (handle?.[1] && (value.startsWith("@") || value.includes("youtube.com"))) {
    return { kind: "handle", handle: handle[1] };
  }
  if (VIDEO_ID.test(value) && HAS_DIGIT.test(value) && HAS_UPPER.test(value)) {
    return { kind: "video", id: value };
  }
  return null;
}

export function formatDuration(seconds: number) {
  if (!seconds) {
    return "—";
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** "3 h 12 min" style, for playlist totals. */
export function formatLongDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (!h) {
    return `${m} min`;
  }
  return m ? `${h} h ${m} min` : `${h} h`;
}
