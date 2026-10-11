import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/**
 * Documentos → Arquivos: folders (nested), uploads (photos, videos, PDF,
 * PNG, SVG, anything) and sheets (text made from a scan or typed). Bytes
 * live in Convex storage; everything needs the panel token.
 */

const MAX_NAME = 120;
const MAX_TEXT = 400_000;
const MAX_DEPTH = 12;

const kind = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("pdf"),
  v.literal("audio"),
  v.literal("sheet"),
  v.literal("other")
);

function cleanName(raw: string) {
  const name = raw.replace(/[\\/]/g, "-").trim().slice(0, MAX_NAME);
  if (!name) {
    throw new Error("Dê um nome.");
  }
  return name;
}

async function fileView(ctx: QueryCtx, f: Doc<"docFiles">) {
  return {
    id: f._id,
    name: f.name,
    folderId: f.folderId ?? null,
    kind: f.kind,
    mimeType: f.mimeType,
    size: f.size,
    url: f.storageId ? await ctx.storage.getUrl(f.storageId) : null,
    hasText: Boolean(f.text),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

async function folderView(ctx: QueryCtx, f: Doc<"docFolders">) {
  const [folders, files] = await Promise.all([
    ctx.db
      .query("docFolders")
      .withIndex("by_parent", (q) => q.eq("parentId", f._id))
      .collect(),
    ctx.db
      .query("docFiles")
      .withIndex("by_folder", (q) => q.eq("folderId", f._id))
      .collect(),
  ]);
  return {
    id: f._id,
    name: f.name,
    color: f.color ?? null,
    parentId: f.parentId ?? null,
    count: folders.length + files.length,
    createdAt: f.createdAt,
  };
}

/** Breadcrumb from the root to `id`. */
async function pathTo(ctx: QueryCtx, id: Id<"docFolders"> | undefined) {
  const out: { id: Id<"docFolders">; name: string }[] = [];
  let cur = id;
  for (let i = 0; cur && i < MAX_DEPTH; i++) {
    const f: Doc<"docFolders"> | null = await ctx.db.get(cur);
    if (!f) {
      break;
    }
    out.unshift({ id: f._id, name: f.name });
    cur = f.parentId;
  }
  return out;
}

/** One folder's contents (root when folderId is omitted). */
export const list = query({
  args: { folderId: v.optional(v.id("docFolders")) },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    if (a.folderId && !(await ctx.db.get(a.folderId))) {
      return { missing: true as const, path: [], folders: [], files: [] };
    }
    const [folders, files] = await Promise.all([
      ctx.db
        .query("docFolders")
        .withIndex("by_parent", (q) => q.eq("parentId", a.folderId))
        .collect(),
      ctx.db
        .query("docFiles")
        .withIndex("by_folder", (q) => q.eq("folderId", a.folderId))
        .collect(),
    ]);
    folders.sort((x, y) => x.name.localeCompare(y.name, "pt"));
    files.sort((x, y) => y.updatedAt - x.updatedAt);
    return {
      missing: false as const,
      path: await pathTo(ctx, a.folderId),
      folders: await Promise.all(folders.map((f) => folderView(ctx, f))),
      files: await Promise.all(files.map((f) => fileView(ctx, f))),
    };
  },
});

/** Every folder (for "move to"). */
export const allFolders = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const all = await ctx.db.query("docFolders").collect();
    const byId = new Map(all.map((f) => [f._id, f]));
    const label = (f: Doc<"docFolders">) => {
      const parts = [f.name];
      let p = f.parentId ? byId.get(f.parentId) : undefined;
      for (let i = 0; p && i < MAX_DEPTH; i++) {
        parts.unshift(p.name);
        p = p.parentId ? byId.get(p.parentId) : undefined;
      }
      return parts.join(" / ");
    };
    return all
      .map((f) => ({ id: f._id, label: label(f) }))
      .sort((x, y) => x.label.localeCompare(y.label, "pt"));
  },
});

/** Name search across all folders. */
export const search = query({
  args: { q: v.string() },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const q = a.q.trim().toLowerCase();
    if (q.length < 2) {
      return [];
    }
    const files = await ctx.db
      .query("docFiles")
      .withIndex("by_updated")
      .order("desc")
      .take(2000);
    const hits = files
      .filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.text?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 60);
    return await Promise.all(hits.map((f) => fileView(ctx, f)));
  },
});

export const getFile = query({
  args: { id: v.id("docFiles") },
  handler: async (ctx, a) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const f = await ctx.db.get(a.id);
    if (!f) {
      return null;
    }
    const sources = await Promise.all(
      (f.sourceIds ?? []).map((id) => ctx.storage.getUrl(id))
    );
    return {
      ...(await fileView(ctx, f)),
      text: f.text ?? "",
      sources: sources.filter((u): u is string => Boolean(u)),
    };
  },
});

export const createFolder = mutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("docFolders")),
    color: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    if (a.parentId && (await pathTo(ctx, a.parentId)).length >= MAX_DEPTH) {
      throw new Error("Pastas demasiado fundas.");
    }
    return await ctx.db.insert("docFolders", {
      name: cleanName(a.name),
      parentId: a.parentId,
      color: a.color,
      createdAt: Date.now(),
    });
  },
});

export const updateFolder = mutation({
  args: {
    id: v.id("docFolders"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    parentId: v.optional(v.union(v.id("docFolders"), v.null())),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const patch: Partial<Doc<"docFolders">> = {};
    if (a.name !== undefined) {
      patch.name = cleanName(a.name);
    }
    if (a.color !== undefined) {
      patch.color = a.color;
    }
    if (a.parentId !== undefined) {
      const target = a.parentId ?? undefined;
      if (target && (await pathTo(ctx, target)).some((p) => p.id === a.id)) {
        throw new Error("Não dá para mover uma pasta para dentro dela mesma.");
      }
      patch.parentId = target;
    }
    await ctx.db.patch(a.id, patch);
  },
});

async function deleteFileDoc(ctx: MutationCtx, f: Doc<"docFiles">) {
  for (const id of [
    ...(f.storageId ? [f.storageId] : []),
    ...(f.sourceIds ?? []),
  ]) {
    await ctx.storage.delete(id).catch(() => undefined);
  }
  await ctx.db.delete(f._id);
}

async function deleteTree(ctx: MutationCtx, id: Id<"docFolders">, depth = 0) {
  if (depth > MAX_DEPTH) {
    return;
  }
  const children = await ctx.db
    .query("docFolders")
    .withIndex("by_parent", (q) => q.eq("parentId", id))
    .collect();
  for (const c of children) {
    await deleteTree(ctx, c._id, depth + 1);
  }
  const files = await ctx.db
    .query("docFiles")
    .withIndex("by_folder", (q) => q.eq("folderId", id))
    .collect();
  for (const f of files) {
    await deleteFileDoc(ctx, f);
  }
  await ctx.db.delete(id);
}

/** Deletes a folder with everything inside it. */
export const deleteFolder = mutation({
  args: { id: v.id("docFolders") },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    if (await ctx.db.get(a.id)) {
      await deleteTree(ctx, a.id);
    }
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const addFile = mutation({
  args: {
    name: v.string(),
    folderId: v.optional(v.id("docFolders")),
    kind,
    mimeType: v.string(),
    size: v.number(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const now = Date.now();
    return await ctx.db.insert("docFiles", {
      ...a,
      name: cleanName(a.name),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** A text sheet, optionally made from scan images already uploaded. */
export const createSheet = mutation({
  args: {
    name: v.string(),
    folderId: v.optional(v.id("docFolders")),
    text: v.string(),
    sourceIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const now = Date.now();
    const text = a.text.slice(0, MAX_TEXT);
    return await ctx.db.insert("docFiles", {
      name: cleanName(a.name),
      folderId: a.folderId,
      kind: "sheet",
      mimeType: "text/markdown",
      size: new TextEncoder().encode(text).length,
      text,
      sourceIds: a.sourceIds,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateFile = mutation({
  args: {
    id: v.id("docFiles"),
    name: v.optional(v.string()),
    text: v.optional(v.string()),
    folderId: v.optional(v.union(v.id("docFolders"), v.null())),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const f = await ctx.db.get(a.id);
    if (!f) {
      throw new Error("Arquivo não encontrado.");
    }
    const patch: Partial<Doc<"docFiles">> = { updatedAt: Date.now() };
    if (a.name !== undefined) {
      patch.name = cleanName(a.name);
    }
    if (a.text !== undefined) {
      patch.text = a.text.slice(0, MAX_TEXT);
      if (f.kind === "sheet") {
        patch.size = new TextEncoder().encode(patch.text).length;
      }
    }
    if (a.folderId !== undefined) {
      patch.folderId = a.folderId ?? undefined;
    }
    await ctx.db.patch(a.id, patch);
  },
});

export const deleteFile = mutation({
  args: { id: v.id("docFiles") },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const f = await ctx.db.get(a.id);
    if (f) {
      await deleteFileDoc(ctx, f);
    }
  },
});

/** Removes uploads that never became a file (cancelled scan). */
export const discardUploads = mutation({
  args: { ids: v.array(v.id("_storage")) },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    for (const id of a.ids) {
      await ctx.storage.delete(id).catch(() => undefined);
    }
  },
});
