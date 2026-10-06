import { type NextRequest, NextResponse } from "next/server";
import {
  basePath,
  cookieOptions,
  PENDING_COOKIE,
  startAuthorization,
} from "@/lib/server/notion-connector";
import { connectorsSecret } from "@/lib/server/sealed-cookie";

export const dynamic = "force-dynamic";

/** Only same-site relative paths ("/ia/"), never "//evil.com". */
function safeReturnTo(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

/** Redirects the browser to Notion's consent screen (OAuth + PKCE). */
export async function GET(request: NextRequest) {
  const back = new URL(`${basePath()}/conectores/`, request.nextUrl.origin);
  if (!connectorsSecret()) {
    back.searchParams.set("error", "missing_secret");
    return NextResponse.redirect(back);
  }
  try {
    const { authorizeUrl, pendingCookie, pendingMaxAge } =
      await startAuthorization(
        request,
        safeReturnTo(
          request.nextUrl.searchParams.get("returnTo"),
          back.pathname
        )
      );
    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set(
      PENDING_COOKIE,
      pendingCookie,
      cookieOptions(request, pendingMaxAge)
    );
    return res;
  } catch {
    back.searchParams.set("error", "notion_unavailable");
    return NextResponse.redirect(back);
  }
}
