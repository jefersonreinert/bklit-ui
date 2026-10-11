"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { type FileKind, kindOf } from "@/lib/files/kinds";
import { Icon, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type FolderId = Id<"docFolders">;
export type Listing = NonNullable<FunctionReturnType<typeof api.files.list>>;
export type FolderItem = Listing["folders"][number];
export type FileItem = Listing["files"][number];

/** A folder widget glyph in the folder's color. */
export function FolderGlyph({
  color,
  className,
}: {
  color: string | null;
  className?: string;
}) {
  const c = color ?? "#5b8def";
  return (
    <svg
      aria-hidden="true"
      className={cn("size-14", className)}
      viewBox="0 0 64 52"
    >
      <path
        d="M4 8a4 4 0 0 1 4-4h16l6 6h26a4 4 0 0 1 4 4v4H4z"
        fill={c}
        opacity="0.75"
      />
      <rect fill={c} height="38" rx="5" width="60" x="2" y="12" />
      <rect
        fill="#fff"
        height="1.5"
        opacity="0.35"
        rx="0.75"
        width="56"
        x="4"
        y="16"
      />
    </svg>
  );
}

const KIND_ICON: Record<FileKind, IconName> = {
  image: "IconImages1",
  video: "IconPlayCircle",
  pdf: "IconFilePdf",
  audio: "IconMicrophone",
  sheet: "IconNote1",
  other: "IconFolder1",
};

const KIND_TONE: Record<FileKind, string> = {
  image: "bg-sky-500/10 text-sky-600",
  video: "bg-violet-500/10 text-violet-600",
  pdf: "bg-red-500/10 text-red-600",
  audio: "bg-amber-500/10 text-amber-600",
  sheet: "bg-emerald-500/10 text-emerald-600",
  other: "bg-muted text-muted-foreground",
};

export const KIND_LABEL: Record<FileKind, string> = {
  image: "Imagem",
  video: "Vídeo",
  pdf: "PDF",
  audio: "Áudio",
  sheet: "Folha",
  other: "Arquivo",
};

/** Square preview: the photo, the video's first frame or a kind icon. */
export function FileThumb({
  file,
  className,
}: {
  file: Pick<FileItem, "kind" | "url" | "name" | "mimeType">;
  className?: string;
}) {
  const box = cn(
    "flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border",
    className
  );
  if (file.kind === "image" && file.url) {
    return (
      <span className={cn(box, "bg-muted/40")}>
        {/* biome-ignore lint/performance/noImgElement: user uploads from Convex storage */}
        <img
          alt={file.name}
          className="size-full object-cover"
          height={160}
          loading="lazy"
          src={file.url}
          width={160}
        />
      </span>
    );
  }
  if (file.kind === "video" && file.url) {
    return (
      <span className={cn(box, "relative bg-black")}>
        <video
          className="size-full object-cover"
          muted
          playsInline
          preload="metadata"
          src={`${file.url}#t=0.5`}
        />
        <Icon
          className="absolute size-8 text-white drop-shadow"
          name="IconPlayCircle"
        />
      </span>
    );
  }
  return (
    <span className={cn(box, KIND_TONE[file.kind])}>
      <Icon className="size-9" name={KIND_ICON[file.kind]} />
    </span>
  );
}

/** Uploads browser files into a folder (Convex storage + file record). */
export function useUploader(folderId: FolderId | undefined) {
  const uploadUrl = useMutation(api.files.generateUploadUrl);
  const addFile = useMutation(api.files.addFile);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const putBlob = useCallback(
    async (blob: Blob) => {
      const url = await uploadUrl({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      });
      if (!res.ok) {
        throw new Error(`Falha no envio (${res.status}).`);
      }
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      return storageId;
    },
    [uploadUrl]
  );

  const upload = useCallback(
    async (files: File[] | FileList) => {
      const list = [...files];
      if (list.length === 0) {
        return;
      }
      setError(null);
      setProgress({ done: 0, total: list.length });
      for (const [i, file] of list.entries()) {
        try {
          const storageId = await putBlob(file);
          const mimeType = file.type || "application/octet-stream";
          await addFile({
            name: file.name,
            folderId,
            kind: kindOf(mimeType, file.name),
            mimeType,
            size: file.size,
            storageId,
          });
        } catch (err) {
          setError(
            `${file.name}: ${err instanceof Error ? err.message : "falhou"}`
          );
        }
        setProgress({ done: i + 1, total: list.length });
      }
      setProgress(null);
    },
    [putBlob, addFile, folderId]
  );

  return { upload, putBlob, progress, error, clearError: () => setError(null) };
}

export function downloadUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.target = "_blank";
  a.click();
}

export function downloadText(
  text: string,
  name: string,
  type = "text/markdown"
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
