import type { NextRequest } from "next/server";
import { withGoogle } from "@/lib/server/google-route";
import {
  addVideo,
  createPlaylist,
  deletePlaylist,
  listItems,
  listMyPlaylists,
  removeItem,
  updatePlaylist,
} from "@/lib/server/youtube-library";
import type { LibAction, LibPrivacy } from "@/lib/video-library-types";

export const dynamic = "force-dynamic";

const PRIVACY: LibPrivacy[] = ["private", "unlisted", "public"];
const VIDEO_ID = /^[\w-]{11}$/;

/** GET → your playlists · GET ?id= → that playlist's videos */
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  return withGoogle(request, async (token) =>
    id
      ? { items: await listItems(token, id) }
      : { playlists: await listMyPlaylists(token) }
  );
}

const clean = (v: unknown) =>
  typeof v === "string" ? v.trim().slice(0, 150) : "";

function validate(body: Partial<LibAction> | null): LibAction | null {
  if (!body?.action) {
    return null;
  }
  const b = body as Record<string, unknown>;
  switch (body.action) {
    case "create":
      return clean(b.title)
        ? {
            action: "create",
            title: clean(b.title),
            privacy: PRIVACY.includes(b.privacy as LibPrivacy)
              ? (b.privacy as LibPrivacy)
              : "private",
          }
        : null;
    case "rename":
      return clean(b.id) && clean(b.title)
        ? { action: "rename", id: clean(b.id), title: clean(b.title) }
        : null;
    case "privacy":
      return clean(b.id) && PRIVACY.includes(b.privacy as LibPrivacy)
        ? {
            action: "privacy",
            id: clean(b.id),
            privacy: b.privacy as LibPrivacy,
          }
        : null;
    case "delete":
      return clean(b.id) ? { action: "delete", id: clean(b.id) } : null;
    case "add":
      return clean(b.id) && VIDEO_ID.test(clean(b.videoId))
        ? { action: "add", id: clean(b.id), videoId: clean(b.videoId) }
        : null;
    case "remove":
      return clean(b.itemId)
        ? { action: "remove", itemId: clean(b.itemId) }
        : null;
    default:
      return null;
  }
}

/** POST LibAction → creates, renames, deletes playlists and moves videos. */
export async function POST(request: NextRequest) {
  const action = validate(
    (await request.json().catch(() => null)) as Partial<LibAction> | null
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
      default:
        await removeItem(token, action.itemId);
        return { ok: true };
    }
  });
}
