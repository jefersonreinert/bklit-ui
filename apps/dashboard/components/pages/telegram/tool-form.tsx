"use client";

import { type ReactNode, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  fileParams,
  type JsonSchema,
  type UploadedFile,
} from "@/lib/telegram/core";

/**
 * A form for any mcp-telegram tool, generated from its JSON Schema: text,
 * numbers, switches, choices, lists, JSON for nested objects and file
 * pickers for path parameters (uploaded to the server's temp folder).
 */

export type FormValues = Record<string, unknown>;

const LONG_TEXT = new Set([
  "text",
  "caption",
  "message",
  "about",
  "description",
]);
const COMMA = /\s*,\s*/;

const MAX_FILE_BYTES = 8_000_000;

export async function readUpload(file: File): Promise<UploadedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} passa de 8 MB.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x80_00) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x80_00));
  }
  return { tgUpload: { name: file.name, type: file.type, data: btoa(binary) } };
}

/** Choices of an enum or an anyOf of constants (e.g. slow-mode seconds). */
function choicesOf(prop: JsonSchema): unknown[] | null {
  if (prop.enum) {
    return prop.enum;
  }
  const consts = (prop.anyOf ?? []).map(
    (a) => (a as { const?: unknown }).const
  );
  return consts.length > 0 && consts.every((c) => c !== undefined)
    ? consts
    : null;
}

const typeOf = (prop: JsonSchema) =>
  Array.isArray(prop.type) ? prop.type[0] : prop.type;

const isFileArray = (prop: JsonSchema) =>
  typeOf(prop) === "array" && Boolean(prop.items?.properties?.filePath);

function toNumber(raw: string, integer: boolean) {
  const n = integer ? Number.parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : raw;
}

function parseList(raw: string, itemType: string | undefined) {
  const parts = raw.split(COMMA).filter(Boolean);
  return itemType === "number" || itemType === "integer"
    ? parts.map((p) => toNumber(p, itemType === "integer"))
    : parts;
}

/** Text the person typed → the value the tool expects. */
export function coerce(prop: JsonSchema, raw: string): unknown {
  const type = typeOf(prop);
  if (type === "number" || type === "integer") {
    return toNumber(raw, type === "integer");
  }
  if (type === "array") {
    return parseList(raw, typeOf(prop.items ?? {}));
  }
  if (type === "object" || prop.anyOf) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.includes(",") && prop.anyOf ? raw.split(COMMA) : raw;
    }
  }
  return raw;
}

function ChoiceInput({
  name,
  choices,
  value,
  onChange,
}: {
  name: string;
  choices: unknown[];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <select
      aria-label={name}
      className="h-9 rounded-md border bg-background px-2 text-sm"
      onChange={(e) =>
        onChange(
          e.target.value === "" ? undefined : choices[Number(e.target.value)]
        )
      }
      value={value === undefined ? "" : String(choices.indexOf(value))}
    >
      <option value="">—</option>
      {choices.map((c, i) => (
        <option key={String(c)} value={i}>
          {String(c)}
        </option>
      ))}
    </select>
  );
}

function FileInput({
  multiple,
  onChange,
  onError,
}: {
  multiple: boolean;
  onChange: (v: unknown) => void;
  onError: (message: string) => void;
}) {
  return (
    <input
      className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
      multiple={multiple}
      onChange={async (e) => {
        const files = [...(e.target.files ?? [])];
        try {
          const uploads = await Promise.all(files.map(readUpload));
          onChange(
            multiple ? uploads.map((filePath) => ({ filePath })) : uploads[0]
          );
        } catch (err) {
          onError(err instanceof Error ? err.message : "Arquivo inválido.");
        }
      }}
      type="file"
    />
  );
}

function TextInput({
  name,
  prop,
  onChange,
}: {
  name: string;
  prop: JsonSchema;
  onChange: (v: unknown) => void;
}) {
  const [raw, setRaw] = useState("");
  const type = typeOf(prop);
  const fallback =
    prop.default === undefined ? "" : `padrão: ${JSON.stringify(prop.default)}`;
  const set = (text: string) => {
    setRaw(text);
    onChange(text === "" ? undefined : coerce(prop, text));
  };
  const nested =
    type === "object" || (type === "array" && prop.items?.properties);
  if (LONG_TEXT.has(name) || nested) {
    return (
      <Textarea
        aria-label={name}
        onChange={(e) => set(e.target.value)}
        placeholder={nested ? "JSON" : fallback}
        rows={3}
        value={raw}
      />
    );
  }
  return (
    <Input
      aria-label={name}
      inputMode={type === "number" || type === "integer" ? "decimal" : "text"}
      onChange={(e) => set(e.target.value)}
      placeholder={
        type === "array" ? "valores separados por vírgula" : fallback
      }
      value={raw}
    />
  );
}

function ParamInput({
  name,
  prop,
  value,
  isFile,
  onChange,
  onError,
}: {
  name: string;
  prop: JsonSchema;
  value: unknown;
  isFile: boolean;
  onChange: (v: unknown) => void;
  onError: (message: string) => void;
}) {
  if (isFile || isFileArray(prop)) {
    return (
      <FileInput
        multiple={isFileArray(prop)}
        onChange={onChange}
        onError={onError}
      />
    );
  }
  if (typeOf(prop) === "boolean") {
    return (
      <Switch
        aria-label={name}
        checked={value === true}
        onCheckedChange={(on) => onChange(on)}
      />
    );
  }
  const choices = choicesOf(prop);
  if (choices) {
    return (
      <ChoiceInput
        choices={choices}
        name={name}
        onChange={onChange}
        value={value}
      />
    );
  }
  return <TextInput name={name} onChange={onChange} prop={prop} />;
}

function ParamField({
  name,
  required,
  description,
  children,
}: {
  name: string;
  required: boolean;
  description?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground text-xs">
        <span className="font-mono text-foreground">{name}</span>
        {required ? <span className="text-destructive"> *</span> : null}
        {description ? ` — ${description}` : null}
      </span>
      {children}
    </label>
  );
}

export function ToolForm({
  schema,
  values,
  onChange,
  onError,
}: {
  schema: JsonSchema;
  values: FormValues;
  onChange: (values: FormValues) => void;
  onError: (message: string) => void;
}) {
  const props = Object.entries(schema.properties ?? {});
  const { inputs, outputs } = fileParams(schema);
  const required = new Set(schema.required ?? []);
  if (props.length === 0) {
    return <p className="text-muted-foreground text-sm">Sem parâmetros.</p>;
  }
  return (
    <div className="grid gap-3">
      {props
        .filter(([name]) => !outputs.includes(name))
        .map(([name, prop]) => (
          <ParamField
            description={prop.description}
            key={name}
            name={name}
            required={required.has(name)}
          >
            <ParamInput
              isFile={inputs.includes(name)}
              name={name}
              onChange={(v) => {
                const next = { ...values };
                if (v === undefined) {
                  delete next[name];
                } else {
                  next[name] = v;
                }
                onChange(next);
              }}
              onError={onError}
              prop={prop}
              value={values[name]}
            />
          </ParamField>
        ))}
      {outputs.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          O arquivo baixado volta aqui como download.
        </p>
      ) : null}
    </div>
  );
}

/** Values filled in for every required parameter? */
export function missingRequired(schema: JsonSchema, values: FormValues) {
  const { outputs } = fileParams(schema);
  return (schema.required ?? []).filter(
    (k) => !outputs.includes(k) && values[k] === undefined
  );
}
