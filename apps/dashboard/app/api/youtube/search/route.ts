import type { NextRequest } from "next/server";
import { searchVideos } from "@/lib/server/youtube";
import { ytRoute } from "@/lib/server/youtube-route";
import {
  YT_DURATIONS,
  YT_ORDERS,
  type YtDuration,
  type YtOrder,
} from "@/lib/youtube-types";

export const dynamic = "force-dynamic";

/** GET ?q=&order=&duration=&channelId=&pageToken= → YtSearchResult */
export function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const order = p.get("order") as YtOrder | null;
  const duration = p.get("duration") as YtDuration | null;
  return ytRoute(request, () =>
    searchVideos({
      q: (p.get("q") ?? "").slice(0, 200),
      order: YT_ORDERS.some((o) => o.id === order)
        ? (order as YtOrder)
        : undefined,
      duration: YT_DURATIONS.some((d) => d.id === duration)
        ? (duration as YtDuration)
        : undefined,
      channelId: p.get("channelId") ?? undefined,
      pageToken: p.get("pageToken") ?? undefined,
    })
  );
}
