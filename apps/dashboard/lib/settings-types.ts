/** Profile and app look saved on the server (shared by every device). */
export interface StoredSettings {
  name: string;
  role: string;
  font: string;
  /** Version of the uploaded app icon; absent = default icon. */
  icon?: string;
  /** Version of the uploaded profile photo; absent = initials. */
  avatar?: string;
  /** ms since epoch of the last save, used to pick the newest copy. */
  updatedAt: number;
}

/** Uploaded images: the app icon and the profile photo. */
export type ImageKind = "icon" | "avatar";

/** PNG sizes stored per image (the first is the preview / default size). */
export const IMAGE_SIZES: Record<ImageKind, readonly number[]> = {
  icon: [192, 180, 512],
  avatar: [256],
};
