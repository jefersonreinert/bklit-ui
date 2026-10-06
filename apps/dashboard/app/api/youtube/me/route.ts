import type { NextRequest } from "next/server";
import { withGoogle } from "@/lib/server/google-route";
import { myLibrary } from "@/lib/server/youtube";

export const dynamic = "force-dynamic";

/** GET → the signed-in user's channel, playlists, subscriptions and likes. */
export function GET(request: NextRequest) {
  return withGoogle(request, (token) => myLibrary(token));
}
