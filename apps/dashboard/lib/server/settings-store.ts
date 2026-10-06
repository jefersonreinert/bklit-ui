import { del, get, list, put } from "@vercel/blob";
import {
  ICON_SIZES,
  type IconSize,
  type StoredSettings,
} from "@/lib/settings-types";

/**
 * Settings persisted in a private Vercel Blob store (BLOB_READ_WRITE_TOKEN),
 * so a save survives reinstalling the Home Screen app or switching devices.
 * Reads skip the CDN cache so a save is visible right away.
 */

const SETTINGS_PATH = "settings/profile.json";
const ICON_PREFIX = "settings/icon-";
const iconPath = (version: string, size: IconSize) =>
  `${ICON_PREFIX}${version}-${size}.png`;

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

/** Stores every icon size under a new version and drops older versions. */
export async function writeIcon(files: Record<IconSize, Uint8Array>) {
  const version = Date.now().toString(36);
  await Promise.all(
    ICON_SIZES.map((size) =>
      put(iconPath(version, size), Buffer.from(files[size]), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "image/png",
      })
    )
  );
  await removeIcons(version);
  return version;
}

/** Deletes stored icons, keeping `keep` (a version) when given. */
export async function removeIcons(keep?: string) {
  const { blobs } = await list({ prefix: ICON_PREFIX });
  const stale = blobs
    .filter((b) => !(keep && b.pathname.startsWith(`${ICON_PREFIX}${keep}-`)))
    .map((b) => b.url);
  if (stale.length > 0) {
    await del(stale);
  }
}

export async function readIcon(version: string, size: IconSize) {
  const result = await get(iconPath(version, size), {
    access: "private",
    useCache: false,
  });
  return result?.statusCode === 200 ? result.stream : null;
}
