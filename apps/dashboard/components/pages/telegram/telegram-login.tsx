"use client";

import { useAction, useMutation } from "convex/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Field } from "@/components/pages/beverages/wine-sheet";
import { QrCode } from "@/components/pages/pos/pos-qr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/lib/icons";
import { Notice, type TgStatus } from "./telegram-shared";

/**
 * Connecting a personal Telegram account, like mcp-telegram's login:
 * api_id / api_hash from my.telegram.org, then a QR code scanned in the
 * app (or a code sent to the phone), then the 2FA password if the account
 * has one. Each step is one server call; the temporary session waits in
 * Convex between them.
 */

const QR_POLL_MS = 4000;

interface Step {
  status: string;
  message?: string;
}

const errorOf = (r: Step) =>
  r.status === "error" ? (r.message ?? "Falhou.") : null;

function CredentialsForm({ onDone }: { onDone?: () => void }) {
  const save = useAction(api.mtproto.saveCredentials);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await save({ apiId, apiHash });
      setMessage(r);
      if (r.ok) {
        setApiHash("");
        onDone?.();
      }
    } catch (err) {
      setMessage({
        ok: false,
        message: err instanceof Error ? err.message : "Falhou.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground text-sm">
        <li>
          Abra <span className="text-foreground">my.telegram.org</span> e entre
          com o seu número.
        </li>
        <li>
          Vá em <b>API development tools</b> e crie uma app (qualquer nome e
          plataforma).
        </li>
        <li>
          Copie o <b>App api_id</b> e o <b>App api_hash</b> para cá.
        </li>
      </ol>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Field label="api_id">
          <Input
            autoComplete="off"
            inputMode="numeric"
            onChange={(e) => setApiId(e.target.value)}
            placeholder="1234567"
            value={apiId}
          />
        </Field>
        <Field label="api_hash">
          <Input
            autoComplete="off"
            onChange={(e) => setApiHash(e.target.value)}
            placeholder="32 caracteres"
            type="password"
            value={apiHash}
          />
        </Field>
      </div>
      {message ? (
        <Notice tone={message.ok ? "ok" : "error"}>{message.message}</Notice>
      ) : null}
      <div className="flex justify-end">
        <Button disabled={busy || !(apiId && apiHash)} size="sm" type="submit">
          <Icon className="size-4" name={busy ? "IconLoader" : "IconLock"} />
          Guardar no servidor
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Ficam só no servidor (Convex) e nunca voltam ao navegador.
      </p>
    </form>
  );
}

function QrLogin({ url }: { url: string | null }) {
  const check = useAction(api.mtproto.checkQr);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await check({});
        setError(errorOf(r));
        if (r.status !== "qr") {
          stopped.current = true;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falhou.");
      }
      if (!stopped.current) {
        timer = setTimeout(tick, QR_POLL_MS);
      }
    };
    timer = setTimeout(tick, QR_POLL_MS);
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [check]);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {url ? (
        <QrCode label="QR code de login do Telegram" size={220} value={url} />
      ) : null}
      <p className="max-w-sm text-muted-foreground text-sm">
        No celular: Telegram →{" "}
        <b>Configurações → Dispositivos → Conectar dispositivo</b> e aponte a
        câmera para o código. Ele se renova sozinho.
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

function CodeForm({ via }: { via: string | null }) {
  const submit = useAction(api.mtproto.submitCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setError(errorOf(await submit({ code })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <p className="text-muted-foreground text-sm">
        {via === "app"
          ? "O Telegram enviou um código para o app (conversa “Telegram”) em outro aparelho."
          : "O Telegram enviou um código por SMS."}{" "}
        Nunca compartilhe esse código com ninguém.
      </p>
      <div className="flex gap-2">
        <Input
          aria-label="Código"
          autoComplete="one-time-code"
          inputMode="numeric"
          onChange={(e) => setCode(e.target.value)}
          placeholder="12345"
          value={code}
        />
        <Button disabled={busy || code.length < 4} type="submit">
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </form>
  );
}

function PasswordForm({ hint }: { hint: string | null }) {
  const submit = useAction(api.mtproto.submitPassword);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setError(errorOf(await submit({ password })));
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <p className="text-muted-foreground text-sm">
        A conta tem verificação em duas etapas. Digite a senha da nuvem do
        Telegram{hint ? ` (dica: ${hint})` : ""}. Ela é usada só para esta
        verificação e não fica guardada.
      </p>
      <div className="flex gap-2">
        <Input
          aria-label="Senha da verificação em duas etapas"
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          value={password}
        />
        <Button disabled={busy || !password} type="submit">
          {busy ? "Verificando…" : "Confirmar"}
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </form>
  );
}

function Chooser() {
  const startQr = useAction(api.mtproto.startQr);
  const sendCode = useAction(api.mtproto.sendCode);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<Step>) {
    setBusy(label);
    setError(null);
    try {
      setError(errorOf(await fn()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <p className="font-medium text-sm">Com QR code (recomendado)</p>
          <p className="text-muted-foreground text-xs">
            Escaneie no app do Telegram, como no Telegram Desktop.
          </p>
          <Button
            className="mt-auto"
            disabled={Boolean(busy)}
            onClick={() => run("qr", () => startQr({}))}
            size="sm"
          >
            <Icon className="size-4" name="IconQrCode" />
            {busy === "qr" ? "Gerando…" : "Mostrar QR code"}
          </Button>
        </div>
        <form
          className="flex flex-col gap-2 rounded-xl border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run("phone", () => sendCode({ phone }));
          }}
        >
          <p className="font-medium text-sm">Com o número</p>
          <Input
            aria-label="Número com código do país"
            autoComplete="tel"
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+55 11 99999-0000"
            value={phone}
          />
          <Button
            disabled={Boolean(busy) || phone.length < 8}
            size="sm"
            type="submit"
            variant="outline"
          >
            <Icon className="size-4" name="IconPhone" />
            {busy === "phone" ? "Enviando…" : "Receber código"}
          </Button>
        </form>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

/** Credentials → QR or phone code → 2FA, driven by the live status. */
export function TelegramLogin({ status }: { status: TgStatus }) {
  const cancel = useMutation(api.telegram.cancelLogin);
  const [editCreds, setEditCreds] = useState(false);
  const p = status.pending;

  if (!status.credentials || editCreds) {
    return <CredentialsForm onDone={() => setEditCreds(false)} />;
  }

  let body = <Chooser />;
  if (p?.needsPassword) {
    body = <PasswordForm hint={p.passwordHint} />;
  } else if (p?.kind === "qr") {
    body = <QrLogin url={p.qrUrl} />;
  } else if (p?.kind === "phone") {
    body = <CodeForm via={p.codeVia} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {body}
      <div className="flex flex-wrap justify-end gap-2">
        {p ? (
          <Button onClick={() => cancel({})} size="sm" variant="ghost">
            Cancelar login
          </Button>
        ) : null}
        {status.credentialsSource === "panel" && !p ? (
          <Button onClick={() => setEditCreds(true)} size="sm" variant="ghost">
            Trocar api_id / api_hash
          </Button>
        ) : null}
      </div>
    </div>
  );
}
