import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  extensionFor,
  fileParams,
  isUploadedFile,
  type JsonSchema,
  sniffMime,
  type ToolOutput,
} from "./core";

/**
 * Files around a Telegram tool call (Node only). The package's tools read
 * and write local paths; on the server those live in a per-call temp
 * folder, filled from the browser's uploads and read back for downloads.
 */

const MAX_RETURN_BYTES = 6_000_000;
const MAX_UPLOAD_BYTES = 8_000_000;

/** Path parameters of any tool, at any depth (e.g. send-album items). */
const INPUT_PATH_KEYS = new Set(["filePath", "photoPath"]);

interface Upload {
  dir: string;
  bytes: number;
  count: number;
}

/** Replaces uploads with temp paths, refusing raw server paths. */
async function materialize(
  value: unknown,
  key: string,
  inputs: Set<string>,
  up: Upload
): Promise<unknown> {
  if (typeof value === "string") {
    if (value && inputs.has(key)) {
      // Only files sent with the request: a raw path could read server files
      throw new Error(
        `Envie o arquivo de "${key}" pelo painel; caminhos do servidor não são aceitos.`
      );
    }
    return value;
  }
  if (isUploadedFile(value)) {
    const bytes = Buffer.from(value.tgUpload.data, "base64");
    up.bytes += bytes.length;
    if (up.bytes > MAX_UPLOAD_BYTES) {
      throw new Error("Arquivos grandes demais (máx. 8 MB por envio).");
    }
    up.count += 1;
    const folder = join(up.dir, "in", String(up.count));
    await mkdir(folder, { recursive: true });
    const path = join(folder, basename(value.tgUpload.name) || "arquivo");
    await writeFile(path, bytes);
    return path;
  }
  if (Array.isArray(value)) {
    return await Promise.all(value.map((v) => materialize(v, key, inputs, up)));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = await materialize(v, k, inputs, up);
    }
    return out;
  }
  return value;
}

/** Turns uploaded files into temp paths and fills required output paths. */
export async function prepareArgs(
  args: Record<string, unknown>,
  schema: JsonSchema,
  dir: string
) {
  const { inputs, outputs } = fileParams(schema);
  const up: Upload = { dir, bytes: 0, count: 0 };
  const prepared = (await materialize(
    args,
    "",
    new Set([...INPUT_PATH_KEYS, ...inputs]),
    up
  )) as Record<string, unknown>;
  const outPaths: string[] = [];
  for (const key of outputs) {
    if (prepared[key] || schema.required?.includes(key)) {
      // Never let a caller choose where the server writes
      await mkdir(join(dir, "out"), { recursive: true });
      const path = join(dir, "out", key);
      prepared[key] = path;
      outPaths.push(path);
    }
  }
  return { prepared, outPaths };
}

export async function collectFiles(paths: string[], out: ToolOutput) {
  let budget = MAX_RETURN_BYTES;
  for (const path of paths) {
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      continue;
    }
    if (info.size > budget) {
      out.text += `\n\n(Arquivo de ${Math.round(info.size / 1e6)} MB grande demais para trazer ao painel.)`;
      continue;
    }
    const bytes = await readFile(path);
    budget -= bytes.length;
    const mimeType = sniffMime(bytes);
    out.files.push({
      name: `telegram-${Date.now()}.${extensionFor(mimeType)}`,
      mimeType,
      data: bytes.toString("base64"),
      size: bytes.length,
    });
    // The temp path means nothing in the browser
    out.text = out.text.replaceAll(path, "o arquivo abaixo");
  }
}
