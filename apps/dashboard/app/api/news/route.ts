import { type NextRequest, NextResponse } from "next/server";
import { fetchPublic, publicUrl } from "@/lib/server/web-fetch";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

/** Headlines from RSS/Atom feeds, newest first. */

const ITEM = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
const CDATA = /^<!\[CDATA\[([\s\S]*?)\]\]>$/;
const TAGS = /<[^>]+>/g;
const SPACES = /\s+/g;
const IMG = /<img[^>]+src=["']([^"']+)["']/i;
const MEDIA =
  /<(?:media:content|media:thumbnail|enclosure)[^>]+(?:url)=["']([^"']+)["'][^>]*>/i;
const ATOM_LINK = /<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i;
const CHANNEL_TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const MAX_FEEDS = 12;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};
const ENTITY = /&(amp|lt|gt|quot|#39|apos|nbsp);/g;
const NUM_ENTITY = /&#(\d+);/g;

function clean(raw: string | undefined) {
  if (!raw) {
    return "";
  }
  const inner = CDATA.exec(raw.trim())?.[1] ?? raw;
  return inner
    .replace(ENTITY, (m) => ENTITIES[m] ?? m)
    .replace(NUM_ENTITY, (_, n) => String.fromCharCode(Number(n)))
    .replace(TAGS, " ")
    .replace(SPACES, " ")
    .trim();
}

function tag(xml: string, name: string) {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m?.[1];
}

interface NewsItem {
  title: string;
  link: string;
  summary: string;
  image: string;
  source: string;
  feed: string;
  date: number;
}

function parse(xml: string, feedUrl: string): NewsItem[] {
  const source =
    clean(CHANNEL_TITLE.exec(xml)?.[1]) || new URL(feedUrl).hostname;
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(ITEM)) {
    const it = m[0];
    const rawDesc =
      tag(it, "description") ?? tag(it, "summary") ?? tag(it, "content") ?? "";
    const descHtml = CDATA.exec(rawDesc.trim())?.[1] ?? rawDesc;
    const link = clean(tag(it, "link")) || ATOM_LINK.exec(it)?.[1] || "";
    const date = Date.parse(
      clean(
        tag(it, "pubDate") ?? tag(it, "published") ?? tag(it, "updated") ?? ""
      )
    );
    items.push({
      title: clean(tag(it, "title")),
      link,
      summary: clean(descHtml).slice(0, 280),
      image:
        MEDIA.exec(it)?.[1] ??
        IMG.exec(descHtml.replace(ENTITY, (x) => ENTITIES[x] ?? x))?.[1] ??
        "",
      source: clean(tag(it, "source")) || source,
      feed: feedUrl,
      date: Number.isFinite(date) ? date : 0,
    });
    if (items.length >= 40) {
      break;
    }
  }
  return items.filter((i) => i.title && i.link);
}

export async function GET(request: NextRequest) {
  if (!(await hasAccess(request))) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const feeds = (request.nextUrl.searchParams.get("feeds") ?? "")
    .split("|")
    .map((f) => publicUrl(f))
    .filter((u): u is URL => Boolean(u))
    .slice(0, MAX_FEEDS);
  const results = await Promise.allSettled(
    feeds.map(async (u) => {
      const res = await fetchPublic(u, 7000);
      return parse(await res.text(), u.toString());
    })
  );
  const items = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.date - a.date)
    .slice(0, 150);
  return NextResponse.json(
    { items, failed: results.filter((r) => r.status === "rejected").length },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
