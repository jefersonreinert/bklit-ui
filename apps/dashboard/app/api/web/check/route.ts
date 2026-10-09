import { type NextRequest, NextResponse } from "next/server";
import { embeddable, fetchPublic, publicUrl } from "@/lib/server/web-fetch";
import { hasAccess } from "@/lib/server/whatsapp";

export const dynamic = "force-dynamic";

const TITLE = /<title[^>]*>([^<]{1,200})<\/title>/i;

/** In-app browser: can this page open inside the app (frame) or not? */
export async function GET(request: NextRequest) {
  if (!(await hasAccess(request))) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const url = publicUrl(request.nextUrl.searchParams.get("url") ?? "");
  if (!url) {
    return NextResponse.json({ error: "Endereço inválido." }, { status: 400 });
  }
  try {
    const res = await fetchPublic(url);
    const final = new URL(res.url || url.toString());
    const type = res.headers.get("content-type") ?? "";
    let title = "";
    if (type.includes("text/html")) {
      const html = (await res.text()).slice(0, 60_000);
      title = TITLE.exec(html)?.[1]?.trim() ?? "";
    }
    return NextResponse.json(
      {
        url: final.toString(),
        title,
        embeddable: embeddable(res.headers, final),
      },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch {
    return NextResponse.json({
      url: url.toString(),
      title: "",
      embeddable: false,
    });
  }
}
