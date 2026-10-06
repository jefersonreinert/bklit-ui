/** Profile and app look saved on the server (shared by every device). */
export interface StoredSettings {
  name: string;
  role: string;
  font: string;
  /** Version of the uploaded app icon; absent = default icon. */
  icon?: string;
  /** ms since epoch of the last save, used to pick the newest copy. */
  updatedAt: number;
}

export const ICON_SIZES = [180, 192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];
