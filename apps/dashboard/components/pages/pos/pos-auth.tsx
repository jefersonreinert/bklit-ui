"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { unlock } from "@/lib/code/client";
import { Icon } from "@/lib/icons";
import {
  bootstrapPos,
  errorText,
  getSession,
  setSession,
  usePos,
  usePosQuery,
  usePosReady,
} from "@/lib/pos/store";
import {
  convexClient,
  refreshSyncAuth,
  useSyncStatus,
} from "@/lib/sync/convex-client";
import { cn } from "@/lib/utils";

/**
 * Who is using this device: a 4-digit PIN per person. The first person
 * creates the administrator (the master code), who adds the others and
 * chooses what each one may do. Permissions are checked on the server.
 */

const IPAD = /iPad|Macintosh.*Mobile/;
const DIGIT = /^\d$/;

export type PosUser = NonNullable<typeof api.staff.me._returnType>;
export type PosPerm =
  | "orders"
  | "charge"
  | "void"
  | "history"
  | "reports"
  | "products"
  | "stock"
  | "tables"
  | "settings"
  | "users";

function deviceName() {
  if (typeof navigator === "undefined") {
    return "Aparelho";
  }
  const ua = navigator.userAgent;
  if (
    IPAD.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  ) {
    return "iPad";
  }
  if (ua.includes("iPhone")) {
    return "iPhone";
  }
  if (ua.includes("Android")) {
    return "Android";
  }
  return "Computador";
}

export function usePosUser() {
  return usePosQuery(api.staff.me, {}) as PosUser | null | undefined;
}

export function useCan() {
  const user = usePosUser();
  return useCallback(
    (perm: PosPerm | PosPerm[]) =>
      Boolean(user && [perm].flat().some((p) => user.perms.includes(p))),
    [user]
  );
}

export async function lockPos() {
  const token = getSession();
  setSession(null);
  const client = convexClient();
  if (token && client) {
    await client
      .mutation(api.staff.logout, { session: token })
      .catch(() => null);
  }
}

/* --------------------------------- keypad -------------------------------- */

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

function PinPad({
  title,
  hint,
  error,
  busy,
  onPin,
}: {
  title: string;
  hint?: ReactNode;
  error?: string | null;
  busy?: boolean;
  onPin: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const press = (k: string) => {
    if (busy) {
      return;
    }
    if (k === "⌫") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = `${pin}${k}`.slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      onPin(next);
      setTimeout(() => setPin(""), 250);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (DIGIT.test(e.key)) {
        press(e.key);
      } else if (e.key === "Backspace") {
        press("⌫");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="font-semibold text-xl">{title}</p>
        {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
      </div>
      <div className="flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            className={cn(
              "size-4 rounded-full border-2 border-foreground transition-colors",
              pin.length > i && "bg-foreground"
            )}
            key={i}
          />
        ))}
      </div>
      <p className="h-5 text-center text-destructive text-sm">
        {busy ? <Spinner /> : error}
      </p>
      <div className="grid w-full grid-cols-3 gap-3">
        {KEYS.map((k, i) =>
          k ? (
            <button
              aria-label={k === "⌫" ? "Apagar" : k}
              className={cn(
                "flex h-16 items-center justify-center rounded-full text-2xl transition-colors active:scale-95",
                k === "⌫"
                  ? "text-muted-foreground"
                  : "bg-muted hover:bg-muted/70"
              )}
              key={k}
              onClick={() => press(k)}
              type="button"
            >
              {k === "⌫" ? (
                <Icon className="size-6" name="IconChevronLeft" />
              ) : (
                k
              )}
            </button>
          ) : (
            <span key={`gap-${i}`} />
          )
        )}
      </div>
    </div>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h)-2rem)] flex-col items-center justify-center gap-6 p-6">
      {children}
    </div>
  );
}

/* --------------------------------- screens ------------------------------- */

function PanelLock() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen>
      <form
        className="flex w-full max-w-xs flex-col gap-3 text-center"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await unlock(code)) {
            refreshSyncAuth();
          } else {
            setError("Código incorreto.");
          }
        }}
      >
        <Icon className="mx-auto size-8" name="IconShieldCheck" />
        <p className="font-semibold text-xl">Liberar este aparelho</p>
        <p className="text-muted-foreground text-sm">
          Digite o código de acesso do painel uma vez neste iPad ou celular.
        </p>
        <Input
          aria-label="Código de acesso"
          onChange={(e) => setCode(e.target.value)}
          type="password"
          value={code}
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit">Liberar</Button>
      </form>
    </Screen>
  );
}

function SetupAdmin() {
  const [name, setName] = useState("");
  const [named, setNamed] = useState(false);
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!named) {
    return (
      <Screen>
        <form
          className="flex w-full max-w-xs flex-col gap-3 text-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              setNamed(true);
            }
          }}
        >
          <Icon className="mx-auto size-8" name="IconCrown" />
          <p className="font-semibold text-xl">Criar o administrador</p>
          <p className="text-muted-foreground text-sm">
            Ele terá o código principal, com todas as permissões, e poderá
            cadastrar os outros usuários.
          </p>
          <Input
            aria-label="Nome do administrador"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            value={name}
          />
          <Button disabled={!name.trim()} type="submit">
            Continuar
          </Button>
        </form>
      </Screen>
    );
  }
  const submit = async (pin: string) => {
    if (!first) {
      setFirst(pin);
      setError(null);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setError("Os PINs não conferem. Comece de novo.");
      return;
    }
    const client = convexClient();
    if (!client) {
      return;
    }
    setBusy(true);
    try {
      const { token } = await client.mutation(api.staff.setup, {
        name: name.trim(),
        pin,
        device: deviceName(),
      });
      setSession(token);
      await bootstrapPos();
    } catch (err) {
      setError(errorText(err));
      setFirst(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PinPad
        busy={busy}
        error={error}
        hint={`Administrador: ${name.trim()}`}
        onPin={submit}
        title={
          first
            ? "Repita o código principal"
            : "Crie o código principal (4 dígitos)"
        }
      />
    </Screen>
  );
}

function Login({ lockedUntil }: { lockedUntil: number }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { settings } = usePos();
  const locked = lockedUntil > Date.now();
  const submit = async (pin: string) => {
    const client = convexClient();
    if (!client) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await client.mutation(api.staff.login, {
        pin,
        device: deviceName(),
      });
      if (res.token) {
        setSession(res.token);
      } else if (res.error === "locked") {
        setError("Muitas tentativas. Espere 1 minuto.");
      } else {
        setError("PIN incorreto.");
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PinPad
        busy={busy}
        error={locked ? "Muitas tentativas. Espere 1 minuto." : error}
        hint={settings ? "Digite seu PIN de 4 dígitos" : undefined}
        onPin={submit}
        title="Entrar no POS"
      />
    </Screen>
  );
}

/* --------------------------------- gate ---------------------------------- */

/** Locks the device after some idle minutes (setting autoLockMin). */
function useAutoLock(minutes: number) {
  useEffect(() => {
    if (!minutes) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        lockPos().catch(() => null);
      }, minutes * 60_000);
    };
    reset();
    const events = ["pointerdown", "keydown"] as const;
    for (const e of events) {
      window.addEventListener(e, reset, { passive: true });
    }
    return () => {
      clearTimeout(timer);
      for (const e of events) {
        window.removeEventListener(e, reset);
      }
    };
  }, [minutes]);
}

function Loading() {
  return (
    <Screen>
      <Spinner />
    </Screen>
  );
}

export function PosGate({ children }: { children: ReactNode }) {
  const sync = useSyncStatus();
  const status = usePosQuery(api.staff.status, {});
  const user = usePosUser();
  const ready = usePosReady();
  const data = usePos();
  const autoLock = data.settings.autoLockMin ?? 0;
  useAutoLock(user ? autoLock : 0);

  // An administrator whose POS was never imported (first run interrupted)
  useEffect(() => {
    if (user?.perms.includes("users") && ready === false) {
      bootstrapPos().catch(() => null);
    }
  }, [user, ready]);

  if (sync === "off") {
    return (
      <Screen>
        <p className="max-w-sm text-center text-muted-foreground text-sm">
          O banco de dados (Convex) não está configurado neste painel.
        </p>
      </Screen>
    );
  }
  if (sync === "locked") {
    return <PanelLock />;
  }
  if (status === undefined || (status && user === undefined)) {
    return <Loading />;
  }
  if (status === null) {
    return <PanelLock />;
  }
  if (!status.hasUsers) {
    return <SetupAdmin />;
  }
  if (!user) {
    return <Login lockedUntil={status.lockedUntil} />;
  }
  if (!ready) {
    return <Loading />;
  }
  return <>{children}</>;
}

export function UserChip() {
  const user = usePosUser();
  if (!user) {
    return null;
  }
  return (
    <button
      className="flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-sm transition-colors hover:bg-muted"
      onClick={() => {
        lockPos().catch(() => null);
      }}
      title="Bloquear e trocar de usuário"
      type="button"
    >
      <span
        className="flex size-7 items-center justify-center rounded-full font-semibold text-white text-xs"
        style={{ background: user.color }}
      >
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="max-w-28 truncate">{user.name}</span>
      <Icon className="size-4 text-muted-foreground" name="IconLock" />
    </button>
  );
}
