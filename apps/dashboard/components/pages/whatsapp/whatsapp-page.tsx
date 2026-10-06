"use client";

import { Icon } from "@bklitui/icons";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ServiceLogo } from "@/components/dashboard/service-logos";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WaChat, WaMessage } from "@/lib/whatsapp-types";
import { useWhatsapp } from "./use-whatsapp";

type Wa = ReturnType<typeof useWhatsapp>;

const time = (seconds: number) => {
  const d = new Date(seconds * 1000);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

function Panel({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pt-2 md:pt-8">
      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white shadow-sm">
            <ServiceLogo brand="whatsapp" className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle>{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1">{description}</CardDescription>
            ) : null}
          </div>
        </CardHeader>
        {children ? (
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        ) : null}
      </Card>
    </div>
  );
}

function Problem({ text }: { text: string | null }) {
  return text ? <p className="text-destructive text-sm">{text}</p> : null;
}

function Unlock({ wa }: { wa: Wa }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await wa.unlock(code);
    setBusy(false);
  };
  return (
    <Panel
      description="Suas conversas ficam protegidas. Digite o código de acesso uma vez neste aparelho."
      title="Desbloquear WhatsApp"
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Input
          aria-label="Código de acesso"
          autoCapitalize="none"
          autoComplete="one-time-code"
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código de acesso"
          value={code}
        />
        <Problem text={wa.error} />
        <Button disabled={busy || !code.trim()} type="submit">
          {busy ? "Verificando…" : "Desbloquear"}
        </Button>
      </form>
    </Panel>
  );
}

const PAIR_STEPS: string[] = [
  "Abra o WhatsApp no iPhone",
  "Toque em Configurações → Aparelhos conectados → Conectar um aparelho",
  "Toque em “Conectar com número de telefone”",
  "Digite este código",
];

function Pair({ wa }: { wa: Wa }) {
  const [phone, setPhone] = useState("55");
  const [busy, setBusy] = useState(false);
  const code = wa.status?.bridge?.pairingCode ?? null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await wa.pair(phone);
    setBusy(false);
  };
  return (
    <Panel
      description="Conecte seu WhatsApp como um aparelho conectado (como o WhatsApp Web). Você continua usando o WhatsApp normalmente no iPhone."
      title="Conectar WhatsApp"
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="wa-phone">
          <span className="font-medium">Seu número com DDI e DDD</span>
          <Input
            id="wa-phone"
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5511999998888"
            value={phone}
          />
        </label>
        <Problem text={wa.error} />
        <Button disabled={busy} type="submit">
          {busy ? "Gerando código…" : "Gerar código de conexão"}
        </Button>
      </form>
      {code ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-4">
          <p className="text-center font-mono font-semibold text-3xl tracking-[0.3em]">
            {code.slice(0, 4)}-{code.slice(4)}
          </p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground text-sm">
            {PAIR_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="text-muted-foreground text-xs">
            O código vale por alguns minutos; se expirar, gere outro.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

function ChatRow({
  chat,
  active,
  onOpen,
}: {
  chat: WaChat;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-(--chat-out)/50",
        active && "bg-(--chat-out)"
      )}
      onClick={onOpen}
      type="button"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--chat-out) font-medium text-(--chat-out-foreground) text-sm">
        {chat.isGroup ? (
          <Icon className="size-4" name="IconPeople" />
        ) : (
          (chat.name[0] ?? "?").toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="flex-1 truncate font-medium text-sm">
            {chat.name}
          </span>
          <span
            className={cn(
              "shrink-0 text-xs",
              chat.unread ? "text-(--chat-accent)" : "text-muted-foreground"
            )}
          >
            {chat.timestamp ? time(chat.timestamp) : ""}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="flex-1 truncate text-muted-foreground text-xs">
            {chat.last?.fromMe ? "Você: " : ""}
            {chat.last?.body || (chat.last ? `[${chat.last.type}]` : "")}
          </span>
          {chat.unread ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-(--chat-accent) px-1.5 font-semibold text-(--chat-accent-foreground) text-[11px]">
              {chat.unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function Bubble({ m, group }: { m: WaMessage; group: boolean }) {
  const body = m.body || (m.hasMedia ? `📎 ${m.type}` : `[${m.type}]`);
  return (
    <div className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
          m.fromMe
            ? "rounded-br-md bg-(--chat-out) text-(--chat-out-foreground)"
            : "rounded-bl-md border bg-(--chat-in)"
        )}
      >
        {group && !m.fromMe && m.author ? (
          <p className="mb-0.5 font-medium text-(--chat-name) text-xs">
            {m.author.split("@")[0]}
          </p>
        ) : null}
        {body}
        <span
          className={cn(
            "ml-2 align-bottom text-[10px]",
            m.fromMe ? "text-(--chat-out-muted)" : "text-muted-foreground"
          )}
        >
          {time(m.timestamp)}
        </span>
      </div>
    </div>
  );
}

function ChatView({ wa, chat }: { wa: Wa; chat: WaChat | undefined }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const count = wa.messages?.length ?? 0;

  useEffect(() => {
    if (count > 0) {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    }
  }, [count]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || sending) {
      return;
    }
    setSending(true);
    if (await wa.send(value)) {
      setText("");
    }
    setSending(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          aria-label="Voltar às conversas"
          className="md:hidden"
          onClick={() => wa.open(null)}
          size="icon-sm"
          variant="ghost"
        >
          <Icon className="size-4" name="IconChevronLeft" />
        </Button>
        <p className="min-w-0 flex-1 truncate font-medium">
          {chat?.name ?? "Conversa"}
        </p>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3"
        ref={scroller}
      >
        {wa.messages === null ? (
          <p className="m-auto text-muted-foreground text-sm">Carregando…</p>
        ) : (
          wa.messages.map((m) => (
            <Bubble group={Boolean(chat?.isGroup)} key={m.id} m={m} />
          ))
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={submit}
      >
        <Textarea
          aria-label="Mensagem"
          className="max-h-32 min-h-10 flex-1 resize-none"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Mensagem"
          rows={1}
          value={text}
        />
        <Button
          aria-label="Enviar"
          className="rounded-full bg-(--chat-accent) text-(--chat-accent-foreground) hover:opacity-90"
          disabled={sending || !text.trim()}
          size="icon"
          type="submit"
        >
          <Icon className="size-4" name="IconArrowUp" />
        </Button>
      </form>
    </div>
  );
}

function Inbox({ wa }: { wa: Wa }) {
  const [query, setQuery] = useState("");
  const me = wa.status?.bridge?.me;
  const list = (wa.chats ?? []).filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const openChat = wa.chats?.find((c) => c.id === wa.openId);
  return (
    <div className="-m-4 flex h-[calc(100dvh-var(--header-h)-env(safe-area-inset-bottom))] md:-m-6">
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-r md:w-80 md:shrink-0",
          wa.openId && "hidden md:flex"
        )}
      >
        <div className="flex items-center gap-2 p-3">
          <ServiceLogo brand="whatsapp" className="size-5" />
          <p className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
            {me?.name ?? "Conectado"}
            {me?.number ? ` · +${me.number}` : ""}
          </p>
          <Button onClick={wa.logout} size="sm" variant="ghost">
            Desconectar
          </Button>
        </div>
        <div className="px-3 pb-2">
          <Input
            aria-label="Buscar conversa"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversa"
            value={query}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
          {wa.chats === null ? (
            <p className="p-4 text-center text-muted-foreground text-sm">
              Carregando conversas…
            </p>
          ) : (
            list.map((c) => (
              <ChatRow
                active={c.id === wa.openId}
                chat={c}
                key={c.id}
                onOpen={() => wa.open(c.id)}
              />
            ))
          )}
        </div>
      </aside>
      <section
        className={cn(
          "min-w-0 flex-1 flex-col",
          wa.openId ? "flex" : "hidden md:flex"
        )}
      >
        {wa.openId ? (
          <ChatView chat={openChat} wa={wa} />
        ) : (
          <p className="m-auto text-muted-foreground text-sm">
            Escolha uma conversa
          </p>
        )}
        {wa.error ? (
          <p className="border-t px-3 py-2 text-destructive text-sm">
            {wa.error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

export function WhatsappPage() {
  const wa = useWhatsapp();
  const { status } = wa;
  if (!status) {
    return <Panel title="Carregando WhatsApp…" />;
  }
  if (!status.configured) {
    return (
      <Panel
        description="O servidor do WhatsApp (whatsapp-web.js num servidor gratuito) ainda não foi configurado. Veja os passos na página Conectores."
        title="WhatsApp ainda não configurado"
      >
        <Button
          nativeButton={false}
          render={<a href="../conectores/" />}
          variant="outline"
        >
          Abrir Conectores
        </Button>
      </Panel>
    );
  }
  if (!status.unlocked) {
    return <Unlock wa={wa} />;
  }
  if (status.offline || !status.bridge) {
    return (
      <Panel
        description="O servidor gratuito pode estar acordando ou reiniciando. Isso leva de 1 a 3 minutos — a página atualiza sozinha."
        title="Ligando o servidor do WhatsApp…"
      />
    );
  }
  const state = status.bridge.state;
  if (state === "ready") {
    return <Inbox wa={wa} />;
  }
  if (state === "qr") {
    return <Pair wa={wa} />;
  }
  return (
    <Panel
      description={
        state === "disconnected"
          ? "A conexão caiu. Reconectando automaticamente…"
          : "Abrindo o WhatsApp no servidor e restaurando a sessão…"
      }
      title={state === "disconnected" ? "WhatsApp desconectado" : "Iniciando…"}
    />
  );
}
