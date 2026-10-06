import type { NextRequest } from "next/server";
import type { MailDraftInput } from "@/lib/mail-types";
import { createDraft, sendMessage } from "@/lib/server/gmail";
import { withGoogle } from "@/lib/server/google-route";

export const dynamic = "force-dynamic";

interface SendBody extends MailDraftInput {
  mode?: "send" | "draft";
}

/** POST MailDraftInput + mode → sends the e-mail or saves it as a draft. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SendBody | null;
  if (!(body && typeof body.to === "string" && body.to.trim())) {
    return Response.json({ error: "missing_recipient" }, { status: 400 });
  }
  const input: MailDraftInput = {
    to: body.to,
    cc: body.cc,
    subject: String(body.subject ?? ""),
    body: String(body.body ?? ""),
    threadId: body.threadId,
    inReplyTo: body.inReplyTo,
    references: body.references,
  };
  return withGoogle(request, (token) =>
    body.mode === "draft"
      ? createDraft(token, input)
      : sendMessage(token, input)
  );
}
