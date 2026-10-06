import type { NextRequest } from "next/server";
import { getThread } from "@/lib/server/gmail";
import { withGoogle } from "@/lib/server/google-route";

export const dynamic = "force-dynamic";

/** GET ?id=<threadId> → MailThread */
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }
  return withGoogle(request, (token) => getThread(token, id));
}
