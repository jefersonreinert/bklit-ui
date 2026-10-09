"use client";

import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { DATASET_CATALOG } from "@/lib/ai-chart-spec";
import { Icon, type IconName } from "@/lib/icons";
import { addFile } from "@/lib/notes/db";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const OPEN_LINK = /\[\[([^\]\n]*)$/;
const CLOSE_LINK = /^\]\]/;
const YOUTUBE = /youtu\.?be/;
const URL_START = /^https?:\/\//i;

interface Edit {
  value: string;
  start: number;
  end: number;
}

/** Wraps the selection (or inserts a placeholder) with before/after. */
function wrap(
  e: Edit,
  before: string,
  after: string,
  placeholder: string
): Edit {
  const selected = e.value.slice(e.start, e.end) || placeholder;
  const value =
    e.value.slice(0, e.start) +
    before +
    selected +
    after +
    e.value.slice(e.end);
  return {
    value,
    start: e.start + before.length,
    end: e.start + before.length + selected.length,
  };
}

/** Adds a prefix to every selected line ("- ", "> ", "## "…). */
function prefixLines(e: Edit, prefix: string): Edit {
  const lineStart = e.value.lastIndexOf("\n", e.start - 1) + 1;
  const block = e.value.slice(lineStart, e.end);
  const next = block
    .split("\n")
    .map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l))
    .join("\n");
  const value = e.value.slice(0, lineStart) + next + e.value.slice(e.end);
  return { value, start: lineStart, end: lineStart + next.length };
}

/** Blank line(s) needed so a block starts on its own paragraph. */
function padBefore(before: string) {
  if (before === "" || before.endsWith("\n\n")) {
    return "";
  }
  return before.endsWith("\n") ? "\n" : "\n\n";
}

/** Inserts a block on its own lines at the caret. */
function insertBlock(e: Edit, block: string): Edit {
  const before = e.value.slice(0, e.start);
  const pad = padBefore(before);
  const text = `${pad}${block}\n`;
  const value = before + text + e.value.slice(e.end);
  const caret = e.start + text.length;
  return { value, start: caret, end: caret };
}

/** Round, icon-only buttons in one scrollable pill (like Notion's bar). */
const TOOL =
  "flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95";

const TOOLS: {
  icon: IconName | null;
  label: string;
  text?: string;
  run: (e: Edit) => Edit;
}[] = [
  { icon: null, text: "H1", label: "Título", run: (e) => prefixLines(e, "# ") },
  {
    icon: null,
    text: "H2",
    label: "Subtítulo",
    run: (e) => prefixLines(e, "## "),
  },
  {
    icon: "IconBold",
    label: "Negrito",
    run: (e) => wrap(e, "**", "**", "negrito"),
  },
  {
    icon: "IconItalic",
    label: "Itálico",
    run: (e) => wrap(e, "*", "*", "itálico"),
  },
  {
    icon: "IconStrikeThrough",
    label: "Riscado",
    run: (e) => wrap(e, "~~", "~~", "riscado"),
  },
  {
    icon: "IconBrush",
    label: "Destaque",
    run: (e) => wrap(e, "==", "==", "destaque"),
  },
  { icon: "IconListBullets", label: "Lista", run: (e) => prefixLines(e, "- ") },
  {
    icon: "IconSquareCheck",
    label: "Tarefa",
    run: (e) => prefixLines(e, "- [ ] "),
  },
  {
    icon: "IconOpenQuote1",
    label: "Citação",
    run: (e) => prefixLines(e, "> "),
  },
  {
    icon: "IconCode",
    label: "Código",
    run: (e) => wrap(e, "```\n", "\n```", "código"),
  },
  {
    icon: "IconChainLink1",
    label: "Link para nota",
    run: (e) => wrap(e, "[[", "]]", "Nome da nota"),
  },
  {
    icon: "IconTable",
    label: "Tabela",
    run: (e) =>
      insertBlock(e, "| Coluna | Coluna |\n|---|---|\n| valor | valor |"),
  },
  {
    icon: "IconDivider",
    label: "Divisória",
    run: (e) => insertBlock(e, "---"),
  },
];

function ChartMenu({ onPick }: { onPick: (block: string) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (block: string) => {
    onPick(block);
    setOpen(false);
  };
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label="Inserir gráfico"
            className={TOOL}
            title="Inserir gráfico animado"
            type="button"
          />
        }
      >
        <Icon className="size-[18px]" name="IconChart3" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-80 w-72 overflow-y-auto p-1"
      >
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          Gráficos do painel
        </p>
        {DATASET_CATALOG.map((d) => (
          <button
            className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
            key={d.id}
            onClick={() =>
              pick(`\`\`\`chart\n{ "dataset": "${d.id}" }\n\`\`\``)
            }
            type="button"
          >
            <span>{d.id.replaceAll("_", " ")}</span>
            <span className="text-muted-foreground text-xs">{d.about}</span>
          </button>
        ))}
        <button
          className="mt-1 w-full rounded-lg border-t px-2 py-2 text-left text-sm hover:bg-muted"
          onClick={() =>
            pick(
              '```chart\n{ "type": "bar", "title": "Meu gráfico", "x": "mes", "series": [{ "key": "valor", "label": "Valor" }], "data": [{ "mes": "Jan", "valor": 120 }, { "mes": "Fev", "valor": 180 }, { "mes": "Mar", "valor": 150 }] }\n```'
            )
          }
          type="button"
        >
          Gráfico com meus próprios dados
        </button>
      </PopoverContent>
    </Popover>
  );
}

function LinkMenu({ onInsert }: { onInsert: (block: string) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!URL_START.test(u)) {
      return;
    }
    const asLink =
      (e.nativeEvent as SubmitEvent).submitter?.dataset.link === "1";
    onInsert(
      asLink ? `[${u}](${u})` : `![${YOUTUBE.test(u) ? "Vídeo" : ""}](${u})`
    );
    setUrl("");
    setOpen(false);
  };
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label="Incorporar link: vídeo, áudio, PDF, imagem ou site"
            className={TOOL}
            title="Incorporar (YouTube, Vimeo, Spotify, PDF, MP3, imagem, site…)"
            type="button"
          />
        }
      >
        <Icon className="size-[18px]" name="IconYoutube" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <form className="flex flex-col gap-2" onSubmit={submit}>
          <Input
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Cole o link (YouTube, PDF, MP3, imagem, site…)"
            value={url}
          />
          <p className="text-muted-foreground text-xs">
            Funciona com YouTube, Vimeo, Spotify, SoundCloud, Loom, Google
            Drive/Docs, Figma, links diretos de imagem, vídeo, MP3 e PDF, e
            qualquer site.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" size="sm" type="submit">
              Incorporar
            </Button>
            <Button
              className="flex-1"
              data-link="1"
              size="sm"
              type="submit"
              variant="outline"
            >
              Só o link
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function NoteEditor({
  header,
  note,
  titles,
  onChange,
}: {
  note: Note;
  titles: string[];
  onChange: (content: string) => void;
  /** Page header (cover, icon, title) shown above the text. */
  header?: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const [suggest, setSuggest] = useState<string | null>(null);

  const current = (): Edit => {
    const el = ref.current;
    return {
      value: note.content,
      start: el?.selectionStart ?? note.content.length,
      end: el?.selectionEnd ?? note.content.length,
    };
  };
  const apply = (next: Edit) => {
    onChange(next.value);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.start, next.end);
    });
  };

  const upload = async (files: FileList | File[] | null) => {
    const list = [...(files ?? [])];
    if (list.length === 0) {
      return;
    }
    setUploading((n) => n + list.length);
    const blocks: string[] = [];
    for (const f of list) {
      const meta = await addFile(f);
      blocks.push(`![${f.name}](att:${meta.id})`);
      setUploading((n) => n - 1);
    }
    apply(insertBlock(current(), blocks.join("\n\n")));
  };

  const onInput = (value: string, caret: number) => {
    onChange(value);
    const open = OPEN_LINK.exec(value.slice(0, caret));
    setSuggest(open ? (open[1] ?? "") : null);
  };

  const completeLink = (title: string) => {
    const e = current();
    const before = e.value.slice(0, e.start).replace(OPEN_LINK, `[[${title}]]`);
    const after = e.value.slice(e.end).replace(CLOSE_LINK, "");
    setSuggest(null);
    apply({ value: before + after, start: before.length, end: before.length });
  };

  const suggestions =
    suggest === null
      ? []
      : titles
          .filter(
            (t) =>
              t.toLowerCase().includes(suggest.toLowerCase()) &&
              t !== note.title
          )
          .slice(0, 6);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      completeLink(suggestions[0] ?? "");
    } else if (e.key === "Escape") {
      setSuggest(null);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      upload(e.clipboardData.files);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    upload(e.dataTransfer.files);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar mx-2 mt-2 mb-1 flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-full border bg-card/80 px-1.5 py-1 shadow-sm backdrop-blur-xl">
        {TOOLS.map((t) => (
          <button
            aria-label={t.label}
            className={TOOL}
            key={t.label}
            onClick={() => apply(t.run(current()))}
            title={t.label}
            type="button"
          >
            {t.icon ? (
              <Icon className="size-[18px]" name={t.icon} />
            ) : (
              <span className="font-semibold text-[13px]">{t.text}</span>
            )}
          </button>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        <button
          aria-label="Anexar imagem, vídeo, PDF ou arquivo"
          className={TOOL}
          onClick={() => fileInput.current?.click()}
          title="Imagem, vídeo, PDF ou arquivo"
          type="button"
        >
          {uploading > 0 ? (
            <Spinner className="size-4" />
          ) : (
            <Icon className="size-[18px]" name="IconPaperclip1" />
          )}
        </button>
        <LinkMenu onInsert={(b) => apply(insertBlock(current(), b))} />
        <ChartMenu onPick={(b) => apply(insertBlock(current(), b))} />
        <input
          className="hidden"
          multiple
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
          ref={fileInput}
          type="file"
        />
      </div>
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto",
          over && "bg-[#d97757]/5 ring-2 ring-[#d97757]/40 ring-inset"
        )}
      >
        {header}
        <textarea
          aria-label="Conteúdo da nota em Markdown"
          className="mx-auto block min-h-[60vh] w-full max-w-3xl resize-none bg-transparent px-5 py-4 font-mono text-[14px] leading-7 outline-none placeholder:text-muted-foreground md:px-8"
          onChange={(e) => onInput(e.target.value, e.target.selectionStart)}
          onDragLeave={() => setOver(false)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDrop={onDrop}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            "Escreva em Markdown…\n\n# Título\n- [ ] tarefa\n[[Outra nota]] #tag"
          }
          ref={ref}
          spellCheck
          value={note.content}
        />
        {suggestions.length > 0 ? (
          <div className="sticky bottom-3 mx-4 rounded-xl border bg-popover p-1 shadow-lg">
            <p className="px-2 py-1 text-muted-foreground text-xs">
              Ligar à nota (Enter)
            </p>
            {suggestions.map((t) => (
              <button
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                key={t}
                onClick={() => completeLink(t)}
                type="button"
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
