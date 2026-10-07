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
  /** One Google login covers Gmail and Drive. */
  google: {
    /** GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set on the server. */
    available: boolean;
    connected: boolean;
    email?: string;
    connectedAt?: number;
    /** The login also granted YouTube (your channel, playlists, likes). */
    youtube?: boolean;
    /** …and can create/rename playlists and save videos to them. */
    youtubeManage?: boolean;
  };
  /** GitHub personal access token saved for this browser. */
  github: { connected: boolean; login?: string; connectedAt?: number };
  /** Public YouTube data (server API key); transcripts need Gemini. */
  youtube: { available: boolean; transcripts: boolean };
  /** WhatsApp bridge configured; `unlocked` = this browser has the access code. */
  whatsapp: { available: boolean; unlocked: boolean };
}

const OFFLINE: ConnectorsStatus = {
  available: false,
  configured: false,
  ai: false,
  notion: { connected: false },
  google: { available: false, connected: false },
  github: { connected: false },
  youtube: { available: false, transcripts: false },
  whatsapp: { available: false, unlocked: false },
};

export function notionStartUrl(returnTo?: string) {
  const url = `${BASE_PATH}/api/connectors/notion/start/`;
  return returnTo ? `${url}?returnTo=${encodeURIComponent(returnTo)}` : url;
}

export function googleStartUrl(returnTo?: string) {
  const url = `${BASE_PATH}/api/connectors/google/start/`;
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

  const disconnectGoogle = useCallback(async () => {
    try {
      await fetch(`${BASE_PATH}/api/connectors/google/disconnect/`, {
        method: "POST",
      });
    } finally {
      await refresh();
    }
  }, [refresh]);

  const disconnectGithub = useCallback(async () => {
    try {
      await fetch(`${BASE_PATH}/api/connectors/github/disconnect/`, {
        method: "POST",
      });
    } finally {
      await refresh();
    }
  }, [refresh]);

  /** Saves a GitHub token; returns an error message, or null when connected. */
  const connectGithub = useCallback(
    async (token: string) => {
      try {
        const res = await fetch(`${BASE_PATH}/api/connectors/github/connect/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        return res.ok ? null : (body.error ?? `Erro ${res.status}`);
      } catch {
        return "Sem conexão com o servidor.";
      } finally {
        await refresh();
      }
    },
    [refresh]
  );

  return {
    status,
    refresh,
    disconnectNotion,
    disconnectGoogle,
    connectGithub,
    disconnectGithub,
  };
}
