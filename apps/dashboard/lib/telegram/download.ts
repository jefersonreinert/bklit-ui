"use client";

import { Zip, ZipPassThrough } from "fflate";

/**
 * Browser downloads of gallery files. Storage URLs live on another origin,
 * so `<a download>` alone would ignore the file name: fetch → blob → link.
 */

function saveBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export async function downloadUrl(url: string, fileName: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Não foi possível baixar ${fileName} (${res.status}).`);
  }
  saveBlob(await res.blob(), fileName);
}

export interface ZipEntry {
  url: string | null;
  fileName: string;
  /** Folder inside the zip, e.g. "2026-10-05". */
  folder?: string;
}

/** Same name twice in one folder → "foto (2).jpg". */
function uniqueName(used: Set<string>, path: string) {
  let candidate = path;
  let n = 2;
  while (used.has(candidate)) {
    const dot = path.lastIndexOf(".");
    candidate =
      dot > 0
        ? `${path.slice(0, dot)} (${n})${path.slice(dot)}`
        : `${path} (${n})`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Downloads every entry and saves them as one .zip (stored, not
 * recompressed: photos and videos are already compressed).
 */
export async function downloadZip(
  entries: ZipEntry[],
  zipName: string,
  onProgress?: (done: number, total: number) => void
) {
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((err, data) => {
    if (err) {
      failure = err;
      return;
    }
    chunks.push(data);
  });
  const used = new Set<string>();
  let done = 0;
  for (const e of entries) {
    if (!e.url) {
      continue;
    }
    const res = await fetch(e.url);
    if (res.ok) {
      const file = new ZipPassThrough(
        uniqueName(used, e.folder ? `${e.folder}/${e.fileName}` : e.fileName)
      );
      zip.add(file);
      file.push(new Uint8Array(await res.arrayBuffer()), true);
    }
    done += 1;
    onProgress?.(done, entries.length);
  }
  zip.end();
  if (failure) {
    throw failure;
  }
  saveBlob(
    new Blob(chunks as BlobPart[], { type: "application/zip" }),
    zipName
  );
}

export const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};
