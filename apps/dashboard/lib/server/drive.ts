import { GoogleApiError } from "./gmail";

/** Read-only Google Drive v3 helpers for the assistant. */

const API = "https://www.googleapis.com/drive/v3";
const MAX_CHARS = 30_000;
const QUOTE = /'/g;
const BACKSLASH = /\\/g;

/** Google-native files are exported; plain text files are downloaded. */
const EXPORTS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

const READABLE = ["text/", "application/json", "application/xml"];

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  size?: string;
}

async function driveFetch(token: string, url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new GoogleApiError(
      res.status,
      body.error?.message ?? `Drive request failed (${res.status})`
    );
  }
  return res;
}

const escapeQuery = (v: string) =>
  v.replace(BACKSLASH, "\\\\").replace(QUOTE, "\\'");

export async function searchDrive(token: string, query: string, max = 10) {
  const q = query.trim()
    ? `(name contains '${escapeQuery(query)}' or fullText contains '${escapeQuery(query)}') and trashed = false`
    : "trashed = false";
  const params = new URLSearchParams({
    q,
    pageSize: String(Math.min(Math.max(max, 1), 25)),
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,size)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (!query.trim()) {
    params.set("orderBy", "modifiedTime desc");
  }
  const res = await driveFetch(token, `${API}/files?${params}`);
  const body = (await res.json()) as { files?: DriveFile[] };
  return body.files ?? [];
}

export async function readDriveFile(token: string, id: string) {
  const metaRes = await driveFetch(
    token,
    `${API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,modifiedTime,webViewLink,size&supportsAllDrives=true`
  );
  const meta = (await metaRes.json()) as DriveFile;
  const exportType = EXPORTS[meta.mimeType];
  let url: string | null = null;
  if (exportType) {
    url = `${API}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exportType)}`;
  } else if (READABLE.some((t) => meta.mimeType.startsWith(t))) {
    url = `${API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
  }
  if (!url) {
    return {
      file: meta,
      content: null,
      note: `Tipo de arquivo ${meta.mimeType} não pode ser lido como texto. Indique o link para a usuária abrir.`,
    };
  }
  const text = await (await driveFetch(token, url)).text();
  return {
    file: meta,
    content: text.slice(0, MAX_CHARS),
    note: text.length > MAX_CHARS ? "Conteúdo truncado." : null,
  };
}
