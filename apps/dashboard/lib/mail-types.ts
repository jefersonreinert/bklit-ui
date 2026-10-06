/** Shapes shared by the Gmail API routes and the E-mail page. */

export interface MailAddress {
  name: string;
  email: string;
}

export interface MailSummary {
  id: string;
  threadId: string;
  from: MailAddress;
  to: string;
  subject: string;
  snippet: string;
  /** Epoch ms. */
  date: number;
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  labels: string[];
}

export interface MailAttachment {
  filename: string;
  mimeType: string;
  size: number;
}

export interface MailMessage {
  id: string;
  from: MailAddress;
  to: string;
  cc: string;
  subject: string;
  date: number;
  text: string;
  html: string | null;
  attachments: MailAttachment[];
  /** RFC 822 Message-ID, used for replies. */
  messageId: string;
  references: string;
  unread: boolean;
  starred: boolean;
}

export interface MailThread {
  id: string;
  subject: string;
  messages: MailMessage[];
}

export interface MailList {
  messages: MailSummary[];
  nextPageToken: string | null;
  unreadInbox: number;
}

export interface MailDraftInput {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export type MailAction =
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "archive"
  | "trash"
  | "untrash";

export const MAIL_FOLDERS = [
  { id: "inbox", label: "Entrada", gmail: "INBOX", icon: "IconArrowInbox" },
  { id: "starred", label: "Com estrela", gmail: "STARRED", icon: "IconStar" },
  { id: "sent", label: "Enviados", gmail: "SENT", icon: "IconPaperPlane" },
  { id: "drafts", label: "Rascunhos", gmail: "DRAFT", icon: "IconPencil" },
  { id: "all", label: "Todos", gmail: null, icon: "IconMailbox" },
  { id: "trash", label: "Lixeira", gmail: "TRASH", icon: "IconTrashCan" },
] as const;

export type MailFolderId = (typeof MAIL_FOLDERS)[number]["id"];
