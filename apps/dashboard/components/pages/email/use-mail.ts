"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_ACCOUNT, demoSummaries, demoThreads } from "@/lib/mail-demo";
import type {
  MailAction,
  MailDraftInput,
  MailFolderId,
  MailList,
  MailSummary,
  MailThread,
} from "@/lib/mail-types";
import { firstName, getPreferences } from "@/lib/preferences";
import { BASE_PATH, useConnectors } from "@/lib/use-connectors";

export type MailMode = "loading" | "live" | "demo";

const API = `${BASE_PATH}/api/gmail`;

/** First name from Configurações, used by the sample inbox. */
const senderName = () => firstName(getPreferences().name);

class MailError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new MailError(res.status, body.error ?? `Erro ${res.status}`);
  }
  return body;
}

/* ------------------------------ demo mailbox ------------------------------ */

interface DemoStore {
  summaries: MailSummary[];
  threads: Map<string, MailThread>;
}

function inFolder(m: MailSummary, folder: MailFolderId) {
  const has = (l: string) => m.labels.includes(l);
  switch (folder) {
    case "inbox":
      return has("INBOX") && !has("TRASH");
    case "starred":
      return m.starred && !has("TRASH");
    case "sent":
      return has("SENT") && !has("TRASH");
    case "drafts":
      return has("DRAFT") && !has("TRASH");
    case "trash":
      return has("TRASH");
    default:
      return !has("TRASH");
  }
}

function matches(m: MailSummary, q: string) {
  const needle = q.trim().toLowerCase();
  return (
    !needle ||
    `${m.subject} ${m.from.name} ${m.from.email} ${m.snippet}`
      .toLowerCase()
      .includes(needle)
  );
}

function applyLabels(m: MailSummary, action: MailAction): MailSummary {
  const labels = new Set(m.labels);
  const changes: Record<MailAction, () => void> = {
    read: () => labels.delete("UNREAD"),
    unread: () => labels.add("UNREAD"),
    star: () => labels.add("STARRED"),
    unstar: () => labels.delete("STARRED"),
    archive: () => labels.delete("INBOX"),
    trash: () => labels.add("TRASH"),
    untrash: () => labels.delete("TRASH"),
  };
  changes[action]();
  return {
    ...m,
    labels: [...labels],
    unread: labels.has("UNREAD"),
    starred: labels.has("STARRED"),
  };
}

function demoSend(store: DemoStore, input: MailDraftInput, draft: boolean) {
  const id = `demo-${Date.now().toString(36)}`;
  const threadId = input.threadId ?? id;
  const now = Date.now();
  const summary: MailSummary = {
    id,
    threadId,
    from: { name: senderName(), email: DEMO_ACCOUNT },
    to: input.to,
    subject: input.subject || "(sem assunto)",
    snippet: input.body.slice(0, 140),
    date: now,
    unread: false,
    starred: false,
    hasAttachments: false,
    labels: [draft ? "DRAFT" : "SENT"],
  };
  store.summaries.unshift(summary);
  const message = {
    id,
    from: summary.from,
    to: input.to,
    cc: input.cc ?? "",
    subject: summary.subject,
    date: now,
    text: input.body,
    html: null,
    attachments: [],
    messageId: `<${id}@demo.casabrasa>`,
    references: "",
    unread: false,
    starred: false,
  };
  const thread = store.threads.get(threadId);
  if (thread) {
    thread.messages.push(message);
  } else {
    store.threads.set(threadId, {
      id: threadId,
      subject: summary.subject,
      messages: [message],
    });
  }
}

/* --------------------------------- hook --------------------------------- */

export function useMail(folder: MailFolderId, query: string) {
  const { status, refresh: refreshStatus } = useConnectors();
  const demo = useRef<DemoStore>({
    summaries: demoSummaries(senderName()),
    threads: new Map(demoThreads(senderName()).map((t) => [t.id, t])),
  });
  const [list, setList] = useState<MailSummary[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [unreadInbox, setUnreadInbox] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  let mode: MailMode = "loading";
  if (status) {
    mode = status.google.connected ? "live" : "demo";
  }
  const account = mode === "live" ? (status?.google.email ?? "") : DEMO_ACCOUNT;

  const showDemo = useCallback(() => {
    const all = demo.current.summaries;
    setList(
      all
        .filter((m) => inFolder(m, folder) && matches(m, query))
        .sort((a, b) => b.date - a.date)
    );
    setUnreadInbox(all.filter((m) => inFolder(m, "inbox") && m.unread).length);
    setNextPage(null);
    setLoading(false);
  }, [folder, query]);

  const fetchPage = useCallback(
    (pageToken?: string) => {
      const params = new URLSearchParams({ folder });
      if (query.trim()) {
        params.set("q", query.trim());
      }
      if (pageToken) {
        params.set("pageToken", pageToken);
      }
      return api<MailList>(`/messages/?${params}`);
    },
    [folder, query]
  );

  useEffect(() => {
    if (mode === "loading") {
      return;
    }
    if (mode === "demo") {
      showDemo();
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage()
      .then((page) => {
        if (cancelled) {
          return;
        }
        setList(page.messages);
        setNextPage(page.nextPageToken);
        setUnreadInbox(page.unreadInbox);
      })
      .catch((e: unknown) => {
        if (cancelled) {
          return;
        }
        if (e instanceof MailError && e.status === 401) {
          refreshStatus();
        }
        setError(e instanceof Error ? e.message : "Erro ao carregar e-mails");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, fetchPage, showDemo, version, refreshStatus]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const loadMore = useCallback(async () => {
    if (!nextPage || mode !== "live") {
      return;
    }
    const page = await fetchPage(nextPage);
    setList((prev) => [...prev, ...page.messages]);
    setNextPage(page.nextPageToken);
  }, [fetchPage, mode, nextPage]);

  const getThread = useCallback(
    (threadId: string): Promise<MailThread> => {
      if (mode === "demo") {
        const thread = demo.current.threads.get(threadId);
        return thread
          ? Promise.resolve(structuredClone(thread))
          : Promise.reject(new Error("Conversa não encontrada"));
      }
      return api<MailThread>(`/thread/?id=${encodeURIComponent(threadId)}`);
    },
    [mode]
  );

  const act = useCallback(
    async (message: MailSummary, action: MailAction) => {
      const updated = applyLabels(message, action);
      const leaves =
        (action === "archive" && folder === "inbox") ||
        (action === "trash" && folder !== "trash") ||
        (action === "untrash" && folder === "trash") ||
        (action === "unstar" && folder === "starred");
      setList((prev) =>
        leaves
          ? prev.filter((m) => m.id !== message.id)
          : prev.map((m) => (m.id === message.id ? updated : m))
      );
      if (action === "read" && message.unread && inFolder(message, "inbox")) {
        setUnreadInbox((n) => Math.max(0, n - 1));
      }
      if (mode === "demo") {
        demo.current.summaries = demo.current.summaries.map((m) =>
          m.id === message.id ? updated : m
        );
        return;
      }
      try {
        await api("/modify/", {
          method: "POST",
          body: JSON.stringify({ id: message.id, action }),
        });
      } catch {
        reload();
      }
    },
    [folder, mode, reload]
  );

  const send = useCallback(
    async (input: MailDraftInput, asDraft: boolean) => {
      if (mode === "demo") {
        demoSend(demo.current, input, asDraft);
        showDemo();
        return;
      }
      await api("/send/", {
        method: "POST",
        body: JSON.stringify({ ...input, mode: asDraft ? "draft" : "send" }),
      });
      if (folder === "sent" || folder === "drafts") {
        reload();
      }
    },
    [folder, mode, reload, showDemo]
  );

  return {
    mode,
    account,
    status,
    list,
    loading,
    error,
    unreadInbox,
    hasMore: Boolean(nextPage),
    reload,
    loadMore,
    getThread,
    act,
    send,
  };
}
