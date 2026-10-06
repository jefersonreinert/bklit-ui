import type { NextRequest } from "next/server";
import type { MailAction } from "@/lib/mail-types";
import { modifyMessage } from "@/lib/server/gmail";
import { withGoogle } from "@/lib/server/google-route";

export const dynamic = "force-dynamic";

const ACTIONS: MailAction[] = [
  "read",
  "unread",
  "star",
  "unstar",
  "archive",
  "trash",
  "untrash",
];

/** POST { id, action } → applies a label change to one message. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    action?: MailAction;
  } | null;
  if (!(body?.id && body.action && ACTIONS.includes(body.action))) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const { id, action } = body;
  return withGoogle(request, async (token) => {
    await modifyMessage(token, id, action);
    return { ok: true };
  });
}
