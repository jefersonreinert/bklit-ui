"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PHASES,
  readSavedRepos,
  saveRepos,
  timeAgo,
  useCodeStatus,
  useSessions,
} from "@/lib/code/client";
import {
  type FiredSession,
  type RoutineInfo,
  useFiredSessions,
  useRoutines,
} from "@/lib/code/routines";
import type { CodePhase, CodeSessionSummary } from "@/lib/code/types";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { NewSession } from "./code-new";
import { RepoPicker } from "./code-pickers";
import {
  type Engine,
  EngineBar,
  FiredRow,
  RoutineSession,
  RoutineSheet,
  ServerButton,
} from "./code-routines";
import { SessionView } from "./code-session";
import { ConnectGithub, Locked } from "./code-setup";

type Filter = "all" | CodePhase;

const FILTERS: Filter[] = [
  "all",
  "needs_input",
  "review",
  "working",
  "completed",
  "archived",
];

const ROUND_BTN =
  "flex size-12 items-center justify-center rounded-full border bg-card shadow-sm transition-colors hover:bg-muted";

/** Browser notification when a session starts waiting on you. */
function useNotify(sessions: CodeSessionSummary[] | null, on: boolean) {
  const seen = useRef(new Map<string, CodePhase>());
  useEffect(() => {
    if (!sessions) {
      return;
    }
    for (const s of sessions) {
      const before = seen.current.get(s.id);
      const waiting = s.phase === "needs_input" || s.phase === "review";
      if (on && before === "working" && waiting && "Notification" in window) {
        new Notification(s.title, { body: PHASES[s.phase].line });
      }
      seen.current.set(s.id, s.phase);
    }
  }, [sessions, on]);
}

function PhaseIcon({ phase }: { phase: CodePhase }) {
  return (
    <Icon
      className={cn(
        "size-6 shrink-0",
        phase === "needs_input" && "text-amber-700 dark:text-amber-400",
        phase === "working" && "animate-spin text-muted-foreground",
        (phase === "completed" || phase === "archived") &&
          "text-muted-foreground"
      )}
      name={PHASES[phase].icon}
    />
  );
}

function SessionRow({
  s,
  active,
  onOpen,
}: {
  s: CodeSessionSummary;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-start gap-4 rounded-2xl px-3 py-3 text-left transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60"
      )}
      onClick={onOpen}
      type="button"
    >
      <span className="pt-0.5">
        <PhaseIcon phase={s.phase} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[17px]">{s.title}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <span className="truncate">
            {PHASES[s.phase].line} · {s.repos.join(", ") || "sem repositório"} ·{" "}
            {timeAgo(s.updatedAt)}
          </span>
          <Icon className="size-4 shrink-0" name="IconCloud" />
        </span>
      </span>
    </button>
  );
}

function FilterMenu({
  filter,
  onFilter,
  notify,
  onNotify,
}: {
  filter: Filter;
  onFilter: (f: Filter) => void;
  notify: boolean;
  onNotify: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label="Filtrar sessões"
            className={ROUND_BTN}
            type="button"
          />
        }
      >
        <Icon className="size-5" name="IconFilter2" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-3xl p-2">
        {FILTERS.map((f) => (
          <DropdownMenuItem
            className="gap-3 rounded-xl px-3 py-2.5 text-base"
            key={f}
            onClick={() => onFilter(f)}
          >
            <span className="w-4">
              {filter === f ? (
                <Icon className="size-4" name="IconCheckmark1" />
              ) : null}
            </span>
            <Icon
              className="size-5"
              name={f === "all" ? "IconChecklist" : PHASES[f].icon}
            />
            {f === "all" ? "Todas" : PHASES[f].label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-3 rounded-xl px-3 py-2.5"
          onClick={onNotify}
        >
          <span className="w-4">
            {notify ? <Icon className="size-4" name="IconCheckmark1" /> : null}
          </span>
          <Icon className="size-5" name="IconBell" />
          Notificar quando precisar de mim
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SubscriptionChips({
  routines,
  onConnect,
}: {
  routines: RoutineInfo[];
  onConnect: () => void;
}) {
  return (
    <>
      <p className="px-3 pt-7 pb-3 text-muted-foreground">
        Claude Code (assinatura)
      </p>
      <div className="flex flex-wrap gap-2 px-3">
        <ServerButton />
        {routines.map((r) => (
          <span
            className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm"
            key={r.id}
          >
            <Icon className="size-4 text-[#d97757]" name="IconCloud" />
            {r.name}
          </span>
        ))}
        <button
          className="flex items-center gap-2 rounded-full border bg-card px-5 py-2.5 text-[15px] shadow-xs hover:bg-muted"
          onClick={onConnect}
          type="button"
        >
          <Icon className="size-5" name="IconPlusSmall" />
          {routines.length ? "Gerenciar rotinas" : "Conectar assinatura"}
        </button>
      </div>
    </>
  );
}

function SessionList({
  sessions,
  error,
  repos,
  github,
  activeId,
  onOpen,
  onNew,
  onPickRepos,
  onRemoveRepo,
  fired,
  subscription,
}: {
  fired: FiredSession[];
  subscription: React.ReactNode;
  sessions: CodeSessionSummary[] | null;
  error: string | null;
  repos: string[];
  github: string | null;
  activeId: string | null;
  onOpen: (s: CodeSessionSummary) => void;
  onNew: () => void;
  onPickRepos: () => void;
  onRemoveRepo: (r: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [notify, setNotify] = useState(false);
  useNotify(sessions, notify);

  const shownFired = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fired.filter((f) => !q || f.title.toLowerCase().includes(q));
  }, [fired, query]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sessions ?? []).filter((s) => {
      const phaseOk =
        filter === "all" ? s.phase !== "archived" : s.phase === filter;
      const text = `${s.title} ${s.repos.join(" ")}`.toLowerCase();
      return phaseOk && (!q || text.includes(q));
    });
  }, [sessions, filter, query]);

  const toggleNotify = async () => {
    if (!notify && "Notification" in window) {
      const perm = await Notification.requestPermission();
      setNotify(perm === "granted");
      return;
    }
    setNotify(false);
  };

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center justify-between px-4 pt-3 pb-1">
        <h1 className="font-semibold text-2xl tracking-tight">Code</h1>
        <FilterMenu
          filter={filter}
          notify={notify}
          onFilter={setFilter}
          onNotify={toggleNotify}
        />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-28">
        <p className="px-3 pt-4 pb-3 text-muted-foreground">Repositórios</p>
        <div className="flex flex-wrap gap-2 px-3">
          {repos.map((r) => (
            <span
              className="flex items-center gap-2 rounded-full border bg-card py-2 pr-2 pl-4 text-sm"
              key={r}
            >
              <Icon className="size-4" name="IconGithub" />
              {r}
              <button
                aria-label={`Remover ${r}`}
                className="flex size-6 items-center justify-center rounded-full hover:bg-muted"
                onClick={() => onRemoveRepo(r)}
                type="button"
              >
                <Icon className="size-3.5" name="IconCrossSmall" />
              </button>
            </span>
          ))}
          {github ? (
            <button
              className="flex items-center gap-2 rounded-full border bg-card px-5 py-2.5 text-[15px] shadow-xs hover:bg-muted"
              onClick={onPickRepos}
              type="button"
            >
              <Icon className="size-5" name="IconPlusSmall" />
              Adicionar repositório
            </button>
          ) : (
            <ConnectGithub />
          )}
        </div>
        {subscription}
        <p className="px-3 pt-7 pb-2 text-muted-foreground">
          Sessões
          {filter === "all" ? "" : ` · ${PHASES[filter].label}`}
        </p>
        {searching ? (
          <input
            aria-label="Buscar sessões"
            className="mx-3 mb-2 h-11 w-[calc(100%-1.5rem)] rounded-full border bg-card px-4 text-[15px] outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar sessões…"
            ref={(el) => el?.focus()}
            value={query}
          />
        ) : null}
        {filter === "all"
          ? shownFired.map((f) => <FiredRow key={f.sessionId} s={f} />)
          : null}
        {error ? (
          <p className="px-3 pt-2 text-muted-foreground text-xs">
            Modo API: {error}
          </p>
        ) : null}
        {sessions || error ? null : (
          <p className="px-3 text-muted-foreground text-sm">Carregando…</p>
        )}
        {visible.length === 0 &&
        shownFired.length === 0 &&
        (sessions || error) ? (
          <p className="px-3 text-muted-foreground text-sm">
            Nenhuma sessão aqui ainda.
          </p>
        ) : null}
        {visible.map((s) => (
          <SessionRow
            active={s.id === activeId}
            key={s.id}
            onOpen={() => onOpen(s)}
            s={s}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          aria-label="Buscar"
          aria-pressed={searching}
          className={cn(ROUND_BTN, "pointer-events-auto size-14")}
          onClick={() => {
            setSearching((v) => !v);
            setQuery("");
          }}
          type="button"
        >
          <Icon className="size-6" name="IconMagnifyingGlass" />
        </button>
        <button
          className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-foreground px-7 text-[17px] text-background shadow-lg transition-transform active:scale-95"
          onClick={onNew}
          type="button"
        >
          <Icon className="size-5" name="IconPlusSmall" />
          Nova sessão
        </button>
      </div>
    </div>
  );
}

type Pane =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "session"; id: string };

function Workspace({
  github,
  apiReady,
}: {
  github: string | null;
  apiReady: boolean;
}) {
  const sessions = useSessions(apiReady);
  const { routines, add, remove } = useRoutines();
  const fired = useFiredSessions();
  const [connecting, setConnecting] = useState(false);
  const [prefill, setPrefill] = useState<RoutineInfo | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const firstRoutine = routines?.[0];
  const current: Engine =
    engine ??
    (firstRoutine ? { kind: "routine", id: firstRoutine.id } : { kind: "api" });
  const routine =
    current.kind === "routine"
      ? routines?.find((r) => r.id === current.id)
      : undefined;
  const engineBar = (
    <EngineBar
      onChange={setEngine}
      onConnect={() => setConnecting(true)}
      routines={routines ?? []}
      value={current}
    />
  );
  const [pane, setPane] = useState<Pane>({ kind: "none" });
  const [repos, setRepos] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => setRepos(readSavedRepos()), []);
  const updateRepos = (next: string[]) => {
    setRepos(next);
    saveRepos(next);
  };

  const list = sessions.data;
  const active =
    pane.kind === "session" ? list?.find((s) => s.id === pane.id) : undefined;
  const showDetail = pane.kind !== "none";

  return (
    <div className="-m-4 mb-[calc(-1rem-env(safe-area-inset-bottom))] flex h-[calc(100dvh-var(--header-h))] md:-m-6 md:mb-[calc(-1.5rem-env(safe-area-inset-bottom))]">
      <aside
        className={cn(
          "w-full shrink-0 border-r md:w-[400px]",
          showDetail && "hidden md:block"
        )}
      >
        <SessionList
          activeId={pane.kind === "session" ? pane.id : null}
          error={
            apiReady
              ? (sessions.error?.message ?? null)
              : "desligado (sem ANTHROPIC_API_KEY)."
          }
          fired={fired}
          github={github}
          onNew={() => setPane({ kind: "new" })}
          onOpen={(s) => setPane({ kind: "session", id: s.id })}
          onPickRepos={() => setPicking(true)}
          onRemoveRepo={(r) => updateRepos(repos.filter((x) => x !== r))}
          repos={repos}
          sessions={list}
          subscription={
            <SubscriptionChips
              onConnect={() => setConnecting(true)}
              routines={routines ?? []}
            />
          }
        />
      </aside>
      <main
        className={cn(
          "min-w-0 flex-1",
          showDetail ? "block" : "hidden md:block"
        )}
      >
        {pane.kind === "new" && routine ? (
          <RoutineSession
            engineBar={engineBar}
            key={routine.id}
            onBack={() => setPane({ kind: "none" })}
            onReconnect={() => {
              setPrefill(routine);
              setConnecting(true);
            }}
            routine={routine}
          />
        ) : null}
        {pane.kind === "new" && !routine ? (
          <NewSession
            engineBar={engineBar}
            github={github}
            onBack={() => setPane({ kind: "none" })}
            onCreated={(s) => {
              sessions.reload();
              setPane({ kind: "session", id: s.id });
            }}
            onPickRepos={() => setPicking(true)}
            repos={repos}
          />
        ) : null}
        {active ? (
          <SessionView
            key={active.id}
            onBack={() => setPane({ kind: "none" })}
            onChanged={sessions.reload}
            onGone={() => {
              setPane({ kind: "none" });
              sessions.reload();
            }}
            summary={active}
          />
        ) : null}
        {pane.kind === "none" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
            <Icon className="size-8" name="IconCodeAssistant" />
            Escolha uma sessão ou comece uma nova.
          </div>
        ) : null}
      </main>
      <RoutineSheet
        onAdd={async (name, url, token) => {
          await add(name, url, token);
          setEngine(null);
        }}
        onClose={() => {
          setConnecting(false);
          setPrefill(null);
        }}
        onRemove={async (id) => {
          await remove(id);
          setEngine(null);
        }}
        open={connecting}
        prefill={prefill}
        routines={routines ?? []}
      />
      <RepoPicker
        onChange={updateRepos}
        onClose={() => setPicking(false)}
        open={picking}
        selected={repos}
      />
    </div>
  );
}

export function CodePage() {
  const status = useCodeStatus();
  if (!status.data) {
    return (
      <p className="p-6 text-muted-foreground text-sm">
        {status.error ? status.error.message : "Carregando…"}
      </p>
    );
  }
  if (!status.data.unlocked) {
    return <Locked onDone={status.reload} />;
  }
  return (
    <Workspace apiReady={status.data.configured} github={status.data.github} />
  );
}
