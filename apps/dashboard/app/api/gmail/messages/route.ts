import type { NextRequest } from "next/server";
import { MAIL_FOLDERS } from "@/lib/mail-types";
import { listMessages } from "@/lib/server/gmail";
import { withGoogle } from "@/lib/server/google-route";

export const dynamic = "force-dynamic";

/** GET ?folder=inbox&q=&pageToken= → MailList */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const folder =
    MAIL_FOLDERS.find((f) => f.id === params.get("folder")) ?? MAIL_FOLDERS[0];
  return withGoogle(request, (token) =>
    listMessages(token, {
      label: folder.gmail,
      q: params.get("q")?.slice(0, 200) || undefined,
      pageToken: params.get("pageToken") || undefined,
    })
  );
}
