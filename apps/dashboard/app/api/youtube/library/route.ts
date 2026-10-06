import type { NextRequest } from "next/server";
import { withGoogle } from "@/lib/server/google-route";
import {
  addVideo,
  createPlaylist,
  deletePlaylist,
  listItems,
  listMyPlaylists,
  listSubscriptions,
  removeItem,
  subscribe,
  unsubscribe,
  updatePlaylist,
} from "@/lib/server/youtube-library";
import type { LibAction, LibPrivacy } from "@/lib/video-library-types";

export const dynamic = "force-dynamic";

const PRIVACY: LibPrivacy[] = ["private", "unlisted", "public"];
const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;

/** GET → your playlists · GET ?id= → that playlist's videos */
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (request.nextUrl.searchParams.get("subscriptions")) {
    return withGoogle(request, async (token) => ({
      channels: await listSubscriptions(token),
    }));
  }
  return withGoogle(request, async (token) =>
    id
      ? { items: await listItems(token, id) }
      : { playlists: await listMyPlaylists(token) }
  );
}

const clean = (v: unknown) =>
  typeof v === "string" ? v.trim().slice(0, 150) : "";

type Body = Record<string, unknown>;
const privacyOf = (v: unknown): LibPrivacy | null =>
  PRIVACY.includes(v as LibPrivacy) ? (v as LibPrivacy) : null;

/** One validator per action; each returns null when the body is invalid. */
const VALIDATORS: Record<LibAction["action"], (b: Body) => LibAction | null> = {
  create: (b) =>
    clean(b.title)
      ? {
          action: "create",
          title: clean(b.title),
          privacy: privacyOf(b.privacy) ?? "private",
        }
      : null,
  rename: (b) =>
    clean(b.id) && clean(b.title)
      ? { action: "rename", id: clean(b.id), title: clean(b.title) }
      : null,
  privacy: (b) => {
    const privacy = privacyOf(b.privacy);
    return clean(b.id) && privacy
      ? { action: "privacy", id: clean(b.id), privacy }
      : null;
  },
  delete: (b) => (clean(b.id) ? { action: "delete", id: clean(b.id) } : null),
  add: (b) =>
    clean(b.id) && VIDEO_ID.test(clean(b.videoId))
      ? { action: "add", id: clean(b.id), videoId: clean(b.videoId) }
      : null,
  remove: (b) =>
    clean(b.itemId) ? { action: "remove", itemId: clean(b.itemId) } : null,
  follow: (b) =>
    CHANNEL_ID.test(clean(b.channelId))
      ? { action: "follow", channelId: clean(b.channelId) }
      : null,
  unfollow: (b) =>
    clean(b.subscriptionId)
      ? { action: "unfollow", subscriptionId: clean(b.subscriptionId) }
      : null,
};

function validate(body: Body | null): LibAction | null {
  const validator = VALIDATORS[body?.action as LibAction["action"]];
  return body && validator ? validator(body) : null;
}

/** POST LibAction → creates, renames, deletes playlists and moves videos. */
export async function POST(request: NextRequest) {
  const action = validate(
    (await request.json().catch(() => null)) as Body | null
  );
  if (!action) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  return withGoogle(request, async (token) => {
    switch (action.action) {
      case "create":
        return {
          playlist: await createPlaylist(token, action.title, action.privacy),
        };
      case "rename":
        return {
          playlist: await updatePlaylist(token, action.id, {
            title: action.title,
          }),
        };
      case "privacy":
        return {
          playlist: await updatePlaylist(token, action.id, {
            privacy: action.privacy,
          }),
        };
      case "delete":
        await deletePlaylist(token, action.id);
        return { ok: true };
      case "add":
        return { itemId: await addVideo(token, action.id, action.videoId) };
      case "follow":
        return { subscriptionId: await subscribe(token, action.channelId) };
      case "unfollow":
        await unsubscribe(token, action.subscriptionId);
        return { ok: true };
      default:
        await removeItem(token, action.itemId);
        return { ok: true };
    }
  });
}
