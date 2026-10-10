import type { XPost } from "./types";

/**
 * Minimal client for the official X API v2 (app-only Bearer token):
 * username → user id, then the user's post timeline after a since_id,
 * page by page. Errors are classified so the monitor can tell an
 * authentication problem from a rate limit or an outage.
 */

export const X_API = "https://api.x.com/2";

export type XErrorKind = "auth" | "rate_limit" | "unavailable" | "bad_request";

export class XApiError extends Error {
  readonly kind: XErrorKind;
  readonly status: number;
  /** Epoch ms when the rate limit window resets (429 only). */
  readonly resetAt: number | null;
  constructor(
    kind: XErrorKind,
    status: number,
    message: string,
    resetAt: number | null = null
  ) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.resetAt = resetAt;
  }
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface RateLimit {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
}

export function readRateLimit(headers: Headers): RateLimit {
  const n = (name: string) => {
    const v = headers.get(name);
    return v === null || v === "" ? null : Number(v);
  };
  const reset = n("x-rate-limit-reset");
  return {
    limit: n("x-rate-limit-limit"),
    remaining: n("x-rate-limit-remaining"),
    resetAt: reset === null ? null : reset * 1000,
  };
}

function classify(res: Response, body: string): XApiError {
  const detail = body.slice(0, 300);
  if (res.status === 401 || res.status === 403) {
    return new XApiError(
      "auth",
      res.status,
      `X API recusou a credencial (${res.status}): ${detail}`
    );
  }
  if (res.status === 429) {
    return new XApiError(
      "rate_limit",
      429,
      "Limite de pedidos da API do X atingido.",
      readRateLimit(res.headers).resetAt
    );
  }
  if (res.status >= 500) {
    return new XApiError(
      "unavailable",
      res.status,
      `X API indisponível (${res.status}).`
    );
  }
  return new XApiError(
    "bad_request",
    res.status,
    `X API (${res.status}): ${detail}`
  );
}

export interface CallOptions {
  fetch?: FetchFn;
  timeoutMs?: number;
  retries?: number;
  /** Waits between retries (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * GET with a timeout and exponential backoff for network errors and 5xx.
 * Auth errors, rate limits and bad requests are not retried here: the
 * monitor waits for the reset time instead of hammering the API.
 */
export async function xGet<T>(
  path: string,
  bearer: string,
  opts: CallOptions = {}
): Promise<{ data: T; rateLimit: RateLimit }> {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const retries = opts.retries ?? 3;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
    }
    let res: Response;
    try {
      res = await doFetch(`${X_API}${path}`, {
        headers: { Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
    } catch (err) {
      lastError = new XApiError(
        "unavailable",
        0,
        `Sem ligação à API do X: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    if (res.ok) {
      return {
        data: (await res.json()) as T,
        rateLimit: readRateLimit(res.headers),
      };
    }
    const error = classify(res, await res.text().catch(() => ""));
    if (error.kind !== "unavailable") {
      throw error;
    }
    lastError = error;
  }
  throw lastError;
}

interface XUserResponse {
  data?: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
  };
  errors?: { detail?: string }[];
}

/** Resolves @username to the numeric user id (never assumes they match). */
export async function resolveUser(
  username: string,
  bearer: string,
  opts?: CallOptions
) {
  const { data } = await xGet<XUserResponse>(
    `/users/by/username/${encodeURIComponent(username)}?user.fields=name,username,profile_image_url`,
    bearer,
    opts
  );
  if (!data.data?.id) {
    throw new XApiError(
      "bad_request",
      404,
      data.errors?.[0]?.detail ?? `Conta @${username} não encontrada.`
    );
  }
  return data.data;
}

interface RawTweet {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  conversation_id?: string;
  note_tweet?: { text?: string };
  referenced_tweets?: { type: string; id: string }[];
  attachments?: { media_keys?: string[] };
  entities?: { urls?: { expanded_url?: string; url?: string }[] };
  public_metrics?: Record<string, number>;
}

interface RawMedia {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
}

export interface TimelineResponse {
  data?: RawTweet[];
  includes?: { media?: RawMedia[] };
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
    next_token?: string;
  };
}

export const TIMELINE_FIELDS = [
  "tweet.fields=created_at,author_id,conversation_id,referenced_tweets,attachments,entities,public_metrics,note_tweet",
  "expansions=attachments.media_keys",
  "media.fields=type,url,preview_image_url",
].join("&");

export function normalizeTweet(
  t: RawTweet,
  media: RawMedia[],
  username: string,
  authorId: string
): XPost {
  const keys = new Set(t.attachments?.media_keys ?? []);
  return {
    postId: t.id,
    authorId: t.author_id ?? authorId,
    username,
    // Long posts carry the full text in note_tweet; text is then truncated
    text: t.note_tweet?.text ?? t.text,
    createdAt: t.created_at ? Date.parse(t.created_at) : Date.now(),
    url: `https://x.com/${username}/status/${t.id}`,
    conversationId: t.conversation_id,
    references: t.referenced_tweets ?? [],
    media: media
      .filter((m) => keys.has(m.media_key))
      .map((m) => ({
        type: m.type,
        url: m.url,
        previewUrl: m.preview_image_url,
      })),
    urls: (t.entities?.urls ?? [])
      .map((u) => u.expanded_url ?? u.url ?? "")
      .filter(Boolean),
    metrics: t.public_metrics,
    raw: JSON.stringify(t),
  };
}

/** Compares X ids (decimal strings longer than 2^53) without precision loss. */
export const idGreater = (a: string, b: string) =>
  a.length === b.length ? a > b : a.length > b.length;

export interface TimelineResult {
  posts: XPost[];
  newestId: string | null;
  pages: number;
  /** More pages exist than maxPages allowed: resume from this token. */
  nextToken: string | null;
  rateLimit: RateLimit | null;
}

/**
 * Posts newer than sinceId (all pages, oldest first), or the latest
 * pages on the first run. With since_id the API pages backwards until it
 * reaches it, so an interruption of any length is recovered.
 */
export async function fetchTimeline(
  userId: string,
  username: string,
  bearer: string,
  {
    sinceId,
    startToken,
    maxPages = 5,
    pageSize = 100,
    ...opts
  }: CallOptions & {
    sinceId?: string | null;
    /** Continue an interrupted pagination. */
    startToken?: string | null;
    maxPages?: number;
    pageSize?: number;
  }
): Promise<TimelineResult> {
  const posts: XPost[] = [];
  let token: string | undefined = startToken ?? undefined;
  let pages = 0;
  let rateLimit: RateLimit | null = null;
  do {
    const params = [
      `max_results=${Math.min(100, Math.max(5, pageSize))}`,
      TIMELINE_FIELDS,
      sinceId ? `since_id=${sinceId}` : "",
      token ? `pagination_token=${encodeURIComponent(token)}` : "",
    ]
      .filter(Boolean)
      .join("&");
    const res = await xGet<TimelineResponse>(
      `/users/${userId}/tweets?${params}`,
      bearer,
      opts
    );
    rateLimit = res.rateLimit;
    const media = res.data.includes?.media ?? [];
    for (const t of res.data.data ?? []) {
      posts.push(normalizeTweet(t, media, username, userId));
    }
    token = res.data.meta?.next_token;
    pages++;
  } while (token && pages < maxPages);

  const unique = new Map(posts.map((p) => [p.postId, p]));
  const sorted = [...unique.values()].sort((a, b) =>
    idGreater(a.postId, b.postId) ? 1 : -1
  );
  return {
    posts: sorted,
    newestId: sorted.at(-1)?.postId ?? null,
    pages,
    nextToken: token ?? null,
    rateLimit,
  };
}

/**
 * App-only Bearer token from the app's API Key and API Key Secret
 * (OAuth 2.0 client credentials), for people who only have those two.
 */
export async function bearerFromKeys(
  apiKey: string,
  apiSecret: string,
  doFetch: FetchFn = fetch
): Promise<string> {
  const basic = btoa(
    `${encodeURIComponent(apiKey)}:${encodeURIComponent(apiSecret)}`
  );
  let res: Response;
  try {
    res = await doFetch("https://api.x.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new XApiError(
      "unavailable",
      0,
      `Sem ligação à API do X: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    token_type?: string;
  };
  if (!(res.ok && body.access_token)) {
    throw new XApiError(
      "auth",
      res.status,
      "O X recusou a API Key / API Secret (confira se são da mesma app)."
    );
  }
  return body.access_token;
}
