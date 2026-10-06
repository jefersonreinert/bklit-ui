import type { YtVideo } from "./youtube-types";

/** The video library (your playlists), shared by the API route and the page. */

export type LibPrivacy = "private" | "unlisted" | "public";

export interface LibPlaylist {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  count: number;
  privacy: LibPrivacy;
  createdAt: string;
}

export interface LibItem {
  /** Playlist item id (needed to remove it). */
  itemId: string;
  addedAt: string;
  video: YtVideo;
}

export type LibAction =
  | { action: "create"; title: string; privacy: LibPrivacy }
  | { action: "rename"; id: string; title: string }
  | { action: "privacy"; id: string; privacy: LibPrivacy }
  | { action: "delete"; id: string }
  | { action: "add"; id: string; videoId: string }
  | { action: "remove"; itemId: string };

export const PRIVACY_LABELS: Record<LibPrivacy, string> = {
  private: "Privada",
  unlisted: "Não listada",
  public: "Pública",
};

/** Default playlist used by the "Salvar" button. */
export const SAVED_TITLE = "Salvos";
