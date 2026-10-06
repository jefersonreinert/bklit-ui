/** Shapes returned by the WhatsApp bridge (services/whatsapp-bridge). */

export type WaState = "starting" | "qr" | "ready" | "disconnected";

export interface WaBridgeStatus {
  state: WaState;
  /** Raw QR payload while waiting for a device link (for a second screen). */
  qr: string | null;
  /** 8-character code for "Link with phone number". */
  pairingCode: string | null;
  me: { name: string | null; number: string | null } | null;
  error: string | null;
}

export interface WaChat {
  id: string;
  name: string;
  isGroup: boolean;
  archived: boolean;
  unread: number;
  /** Unix seconds. */
  timestamp: number;
  last: { body: string; fromMe: boolean; type: string } | null;
}

export interface WaMessage {
  id: string;
  body: string;
  type: string;
  fromMe: boolean;
  author: string | null;
  /** Unix seconds. */
  timestamp: number;
  hasMedia: boolean;
  media: {
    mimetype: string | null;
    filename: string | null;
    size: number | null;
    /** Seconds (audio/video). */
    duration: number | null;
    /** Base64 JPEG preview for images, videos and stickers. */
    thumb: string | null;
  } | null;
  /** Short-lived signed URL to the full file on the bridge. */
  mediaUrl?: string;
}

/** What /api/whatsapp/status tells the page. */
export interface WaStatus {
  /** Bridge URL + secret are set on the server. */
  configured: boolean;
  /** WHATSAPP_ACCESS_CODE is set (the page is locked behind it). */
  locked: boolean;
  /** This browser entered the access code. */
  unlocked: boolean;
  bridge: WaBridgeStatus | null;
  /** Bridge unreachable (Space asleep, building or down). */
  offline?: boolean;
}
