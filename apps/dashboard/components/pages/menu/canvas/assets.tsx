"use client";

import { useMutation } from "convex/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { loadImage } from "@/lib/upload";
import { TelegramProvider } from "../../telegram/telegram-shared";

/**
 * Where design images go: Convex file storage when the panel database is
 * on (designs keep a small URL and sync between devices), otherwise a
 * compressed data URL kept in the design itself.
 */

type Upload = (source: Blob | string) => Promise<string>;

const AssetsContext = createContext<Upload | null>(null);

const MAX_SIDE = 1800;
const SVG = /svg/i;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Resized PNG (keeps transparency) or JPEG data URL; SVG stays as is. */
export async function compressImage(source: Blob | string, maxSide = MAX_SIDE) {
  const url = typeof source === "string" ? source : await readAsDataUrl(source);
  const type =
    typeof source === "string" ? url.slice(5, url.indexOf(";")) : source.type;
  if (SVG.test(type)) {
    return url;
  }
  const img = await loadImage(url);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return type === "image/jpeg"
    ? canvas.toDataURL("image/jpeg", 0.86)
    : canvas.toDataURL("image/png");
}

const toBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

/** Gives up on Convex after this long (offline, locked panel). */
const UPLOAD_TIMEOUT = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function ConvexAssets({ children }: { children: ReactNode }) {
  const uploadUrl = useMutation(api.designs.uploadUrl);
  const assetUrl = useMutation(api.designs.assetUrl);
  const upload = useMemo<Upload>(() => {
    const store = async (data: string) => {
      const blob = await toBlob(data);
      const res = await fetch(await uploadUrl({}), {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!res.ok) {
        return data;
      }
      const { storageId } = (await res.json()) as {
        storageId: Id<"_storage">;
      };
      return (await assetUrl({ storageId })) ?? data;
    };
    return async (source) => {
      const data = await compressImage(source);
      try {
        return await withTimeout(store(data), UPLOAD_TIMEOUT);
      } catch {
        // Locked panel, offline or slow: keep the image inside the design
        return data;
      }
    };
  }, [uploadUrl, assetUrl]);
  return (
    <AssetsContext.Provider value={upload}>{children}</AssetsContext.Provider>
  );
}

const localUpload: Upload = (source) => compressImage(source, 1200);

export function AssetsProvider({ children }: { children: ReactNode }) {
  return (
    <TelegramProvider
      fallback={
        <AssetsContext.Provider value={localUpload}>
          {children}
        </AssetsContext.Provider>
      }
    >
      <ConvexAssets>{children}</ConvexAssets>
    </TelegramProvider>
  );
}

export function useUploadImage(): Upload {
  return useContext(AssetsContext) ?? localUpload;
}
