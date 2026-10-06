import type {
  MailAction,
  MailAddress,
  MailAttachment,
  MailDraftInput,
  MailList,
  MailMessage,
  MailSummary,
  MailThread,
} from "@/lib/mail-types";

/** Thin Gmail REST v1 client (https://developers.google.com/gmail/api). */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const ADDRESS = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/;
const NEWLINES = /\r?\n/g;
const NON_ASCII = /[^ -~]/;

export class GoogleApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export async function gmailFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new GoogleApiError(
      res.status,
      body.error?.message ?? `Gmail request failed (${res.status})`
    );
  }
  return (await res.json()) as T;
}

const header = (part: GmailPart | undefined, name: string) =>
  part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value ?? "";

export function parseAddress(raw: string): MailAddress {
  const match = ADDRESS.exec(raw);
  if (match) {
    const email = match[2]?.trim() ?? "";
    return { name: match[1]?.trim() || email, email };
  }
  const email = raw.trim();
  return { name: email, email };
}

const decode = (data: string | undefined) =>
  data ? Buffer.from(data, "base64url").toString("utf8") : "";

function hasAttachment(part: GmailPart | undefined): boolean {
  if (!part) {
    return false;
  }
  if (part.filename && part.body?.attachmentId) {
    return true;
  }
  return (part.parts ?? []).some(hasAttachment);
}

function summarize(m: GmailMessage): MailSummary {
  const labels = m.labelIds ?? [];
  return {
    id: m.id,
    threadId: m.threadId,
    from: parseAddress(header(m.payload, "From")),
    to: header(m.payload, "To"),
    subject: header(m.payload, "Subject") || "(sem assunto)",
    snippet: m.snippet ?? "",
    date: Number(m.internalDate ?? 0),
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    hasAttachments: hasAttachment(m.payload),
    labels,
  };
}

export async function listMessages(
  token: string,
  opts: { label: string | null; q?: string; pageToken?: string; max?: number }
): Promise<MailList> {
  const params = new URLSearchParams({ maxResults: String(opts.max ?? 25) });
  if (opts.label) {
    params.set("labelIds", opts.label);
  }
  if (opts.q) {
    params.set("q", opts.q);
  }
  if (opts.pageToken) {
    params.set("pageToken", opts.pageToken);
  }
  if (opts.label === "TRASH") {
    params.set("includeSpamTrash", "true");
  }
  const [list, inbox] = await Promise.all([
    gmailFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      token,
      `/messages?${params}`
    ),
    gmailFetch<{ messagesUnread?: number }>(token, "/labels/INBOX").catch(
      () => ({ messagesUnread: 0 })
    ),
  ]);
  const meta = ["From", "To", "Subject", "Date"]
    .map((h) => `metadataHeaders=${h}`)
    .join("&");
  const messages = await Promise.all(
    (list.messages ?? []).map((m) =>
      gmailFetch<GmailMessage>(
        token,
        `/messages/${m.id}?format=metadata&${meta}`
      ).then(summarize)
    )
  );
  return {
    messages,
    nextPageToken: list.nextPageToken ?? null,
    unreadInbox: inbox.messagesUnread ?? 0,
  };
}

interface Bodies {
  text: string;
  html: string | null;
  attachments: MailAttachment[];
}

function walk(part: GmailPart | undefined, out: Bodies) {
  if (!part) {
    return;
  }
  if (part.filename && part.body?.attachmentId) {
    out.attachments.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    });
    return;
  }
  if (part.mimeType === "text/plain" && !out.text) {
    out.text = decode(part.body?.data);
  } else if (part.mimeType === "text/html" && !out.html) {
    out.html = decode(part.body?.data);
  }
  for (const child of part.parts ?? []) {
    walk(child, out);
  }
}

function toMessage(m: GmailMessage): MailMessage {
  const bodies: Bodies = { text: "", html: null, attachments: [] };
  walk(m.payload, bodies);
  const labels = m.labelIds ?? [];
  return {
    id: m.id,
    from: parseAddress(header(m.payload, "From")),
    to: header(m.payload, "To"),
    cc: header(m.payload, "Cc"),
    subject: header(m.payload, "Subject") || "(sem assunto)",
    date: Number(m.internalDate ?? 0),
    text: bodies.text,
    html: bodies.html,
    attachments: bodies.attachments,
    messageId:
      header(m.payload, "Message-ID") || header(m.payload, "Message-Id"),
    references: header(m.payload, "References"),
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
  };
}

export async function getThread(
  token: string,
  id: string
): Promise<MailThread> {
  const thread = await gmailFetch<{ id: string; messages?: GmailMessage[] }>(
    token,
    `/threads/${encodeURIComponent(id)}?format=full`
  );
  const messages = (thread.messages ?? []).map(toMessage);
  return {
    id: thread.id,
    subject: messages[0]?.subject ?? "(sem assunto)",
    messages,
  };
}

/** RFC 2047 encoded-word for non-ASCII header values. */
const encodeHeader = (value: string) =>
  NON_ASCII.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;

const clean = (value: string | undefined) =>
  (value ?? "").replace(NEWLINES, " ").trim();

export function buildRaw(input: MailDraftInput) {
  const lines = [
    `To: ${clean(input.to)}`,
    ...(input.cc ? [`Cc: ${clean(input.cc)}`] : []),
    `Subject: ${encodeHeader(clean(input.subject))}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${clean(input.inReplyTo)}`] : []),
    ...(input.references || input.inReplyTo
      ? [
          `References: ${clean(`${input.references ?? ""} ${input.inReplyTo ?? ""}`)}`,
        ]
      : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.body, "utf8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export function sendMessage(token: string, input: MailDraftInput) {
  return gmailFetch<{ id: string; threadId: string }>(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: buildRaw(input), threadId: input.threadId }),
  });
}

export function createDraft(token: string, input: MailDraftInput) {
  return gmailFetch<{ id: string; message: { id: string; threadId: string } }>(
    token,
    "/drafts",
    {
      method: "POST",
      body: JSON.stringify({
        message: { raw: buildRaw(input), threadId: input.threadId },
      }),
    }
  );
}

export function modifyMessage(token: string, id: string, action: MailAction) {
  const path = `/messages/${encodeURIComponent(id)}`;
  if (action === "trash" || action === "untrash") {
    return gmailFetch(token, `${path}/${action}`, { method: "POST" });
  }
  const change: Record<
    Exclude<MailAction, "trash" | "untrash">,
    { addLabelIds?: string[]; removeLabelIds?: string[] }
  > = {
    read: { removeLabelIds: ["UNREAD"] },
    unread: { addLabelIds: ["UNREAD"] },
    star: { addLabelIds: ["STARRED"] },
    unstar: { removeLabelIds: ["STARRED"] },
    archive: { removeLabelIds: ["INBOX"] },
  };
  return gmailFetch(token, `${path}/modify`, {
    method: "POST",
    body: JSON.stringify(change[action]),
  });
}
