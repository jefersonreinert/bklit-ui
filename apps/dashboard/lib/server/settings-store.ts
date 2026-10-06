import { del, get, list, put } from "@vercel/blob";
import {
  IMAGE_SIZES,
  type ImageKind,
  type StoredSettings,
} from "@/lib/settings-types";

/**
 * Settings persisted in a private Vercel Blob store (BLOB_READ_WRITE_TOKEN),
 * so a save survives reinstalling the Home Screen app or switching devices.
 * Reads skip the CDN cache so a save is visible right away.
 */

const SETTINGS_PATH = "settings/profile.json";
const prefix = (kind: ImageKind) => `settings/${kind}-`;
const imagePath = (kind: ImageKind, version: string, size: number) =>
  `${prefix(kind)}${version}-${size}.png`;

export const storeAvailable = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function readText(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (result?.statusCode !== 200) {
    return null;
  }
  return await new Response(result.stream).text();
}

/** Saved settings, null when nothing was saved yet; throws if the store fails. */
export async function readSettings(): Promise<StoredSettings | null> {
  if (!storeAvailable()) {
    return null;
  }
  const text = await readText(SETTINGS_PATH);
  return text ? (JSON.parse(text) as StoredSettings) : null;
}

/** Like readSettings, but a store failure reads as "nothing saved". */
export async function readSettingsSafe() {
  try {
    return await readSettings();
  } catch {
    return null;
  }
}

export async function writeSettings(settings: StoredSettings) {
  await put(SETTINGS_PATH, JSON.stringify(settings), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return settings;
}

/** Stores every size of an image under a new version; drops older ones. */
export async function writeImage(
  kind: ImageKind,
  files: Record<number, Uint8Array>
) {
  const version = Date.now().toString(36);
  await Promise.all(
    IMAGE_SIZES[kind].map((size) =>
      put(imagePath(kind, version, size), Buffer.from(files[size] ?? []), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "image/png",
      })
    )
  );
  await removeImages(kind, version);
  return version;
}

/** Deletes stored versions of an image, keeping `keep` when given. */
export async function removeImages(kind: ImageKind, keep?: string) {
  const { blobs } = await list({ prefix: prefix(kind) });
  const stale = blobs
    .filter((b) => !(keep && b.pathname.startsWith(`${prefix(kind)}${keep}-`)))
    .map((b) => b.url);
  if (stale.length > 0) {
    await del(stale);
  }
}

export async function readImage(
  kind: ImageKind,
  version: string,
  size: number
) {
  const result = await get(imagePath(kind, version, size), {
    access: "private",
    useCache: false,
  });
  return result?.statusCode === 200 ? result.stream : null;
}
