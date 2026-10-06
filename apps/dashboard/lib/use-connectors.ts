"use client";

import { useCallback, useEffect, useState } from "react";

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface ConnectorsStatus {
  /** Server routes exist (false on the static GitHub Pages build). */
  available: boolean;
  /** CONNECTORS_SECRET is set on the server. */
  configured: boolean;
  /** ANTHROPIC_API_KEY is set on the server. */
  ai: boolean;
  notion: { connected: boolean; connectedAt?: number };
}

const OFFLINE: ConnectorsStatus = {
  available: false,
  configured: false,
  ai: false,
  notion: { connected: false },
};

export function notionStartUrl(returnTo?: string) {
  const url = `${BASE_PATH}/api/connectors/notion/start/`;
  return returnTo ? `${url}?returnTo=${encodeURIComponent(returnTo)}` : url;
}

/** Reads which connectors this browser linked. Tokens never leave the server. */
export function useConnectors() {
  const [status, setStatus] = useState<ConnectorsStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/connectors/status/`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setStatus(OFFLINE);
        return;
      }
      const body = (await res.json()) as Omit<ConnectorsStatus, "available">;
      setStatus({ ...body, available: true });
    } catch {
      setStatus(OFFLINE);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const disconnectNotion = useCallback(async () => {
    try {
      await fetch(`${BASE_PATH}/api/connectors/notion/disconnect/`, {
        method: "POST",
      });
    } finally {
      await refresh();
    }
  }, [refresh]);

  return { status, refresh, disconnectNotion };
}
