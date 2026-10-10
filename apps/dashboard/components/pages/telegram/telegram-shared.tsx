"use client";

import { ConvexProvider, useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { convexClient, useSyncStatus } from "@/lib/sync/convex-client";
import type { ToolOutput } from "@/lib/telegram/core";
import { cn } from "@/lib/utils";

export type TgStatus = NonNullable<
  FunctionReturnType<typeof api.telegram.status>
>;

/** Convex for the Telegram UI; `fallback` when the panel has no database. */
export function TelegramProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const status = useSyncStatus();
  const client = convexClient();
  if (!client || status === "off") {
    return <>{fallback}</>;
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

/** undefined while loading, null without the panel's access code. */
export const useTelegramStatus = () => useQuery(api.telegram.status, {});

const failure = (err: unknown): ToolOutput => ({
  ok: false,
  text: err instanceof Error ? err.message : "Falhou.",
  images: [],
  files: [],
});

/** Runs one mcp-telegram tool on the server, with busy state. */
export function useRunTool() {
  const call = useAction(api.mtproto.callTool);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (name: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      try {
        return await call({ name, args });
      } catch (err) {
        return failure(err);
      } finally {
        setBusy(false);
      }
    },
    [call]
  );
  return { run, busy };
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "ok";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        tone === "error" &&
          "border-destructive/40 bg-destructive/5 text-destructive",
        tone === "ok" && "border-success/40 bg-success/10"
      )}
      role="status"
    >
      {children}
    </div>
  );
}

const dataUrl = (mime: string, data: string) => `data:${mime};base64,${data}`;

/** Text, images and downloaded files of a tool result. */
export function ToolResultView({ out }: { out: ToolOutput }) {
  return (
    <div className="flex flex-col gap-3">
      {out.text ? (
        <pre
          className={cn(
            "max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-3 font-sans text-sm",
            !out.ok && "border-destructive/40 bg-destructive/5"
          )}
        >
          {out.text}
        </pre>
      ) : null}
      {out.images.map((img) => (
        // biome-ignore lint/performance/noImgElement: inline base64 from the tool
        <img
          alt="Imagem devolvida pelo Telegram"
          className="max-h-80 w-auto self-start rounded-xl border"
          height={320}
          key={img.data.slice(0, 64)}
          src={dataUrl(img.mimeType, img.data)}
          width={320}
        />
      ))}
      {out.files.map((f) => (
        <a
          className="flex items-center gap-2 self-start rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
          download={f.name}
          href={dataUrl(f.mimeType, f.data)}
          key={f.name}
        >
          <Icon className="size-4" name="IconArrowDown" />
          Baixar {f.name} ({Math.max(1, Math.round(f.size / 1024))} KB)
        </a>
      ))}
    </div>
  );
}

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
