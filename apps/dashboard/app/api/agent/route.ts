import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { navItems } from "@/lib/nav";
import { groqJson } from "@/lib/server/groq-json";
import { convexUrl } from "@/lib/server/panel-jwt";
import { isCrossSite } from "@/lib/server/same-site";
import { hasAccess } from "@/lib/server/whatsapp";

/**
 * The app agent's next step. The browser sends what is on screen (the
 * interactive elements with ids, and the page text) plus what was done so
 * far; this answers with one action, which the browser performs visibly.
 * Only for this panel's administrators: the access code or the POS PIN of
 * an administrator.
 */

export const dynamic = "force-dynamic";

const MAX_BODY = 120_000;

const Action = z.object({
  thought: z.string(),
  type: z.enum([
    "navigate",
    "click",
    "type",
    "press",
    "scroll",
    "wait",
    "done",
    "ask",
  ]),
  id: z.number().int().nullable(),
  text: z.string().nullable(),
  path: z.string().nullable(),
  key: z.string().nullable(),
  submit: z.boolean().nullable(),
  direction: z.enum(["up", "down"]).nullable(),
  message: z.string().nullable(),
});
type Action = z.infer<typeof Action>;

const nullable = (type: string) => ({ type: [type, "null"] });
const SCHEMA = {
  type: "object",
  properties: {
    thought: { type: "string" },
    type: {
      type: "string",
      enum: [
        "navigate",
        "click",
        "type",
        "press",
        "scroll",
        "wait",
        "done",
        "ask",
      ],
    },
    id: nullable("integer"),
    text: nullable("string"),
    path: nullable("string"),
    key: nullable("string"),
    submit: nullable("boolean"),
    direction: { type: ["string", "null"], enum: ["up", "down", null] },
    message: nullable("string"),
  },
  required: [
    "thought",
    "type",
    "id",
    "text",
    "path",
    "key",
    "submit",
    "direction",
    "message",
  ],
  additionalProperties: false,
};

interface Snapshot {
  path: string;
  title: string;
  text: string;
  elements: {
    id: number;
    role: string;
    label: string;
    value?: string;
    checked?: boolean;
    disabled?: boolean;
    offscreen?: boolean;
  }[];
}

interface Step {
  action: string;
  result: string;
}

const PAGES = navItems
  .map((i) => `${i.href} — ${i.label}: ${i.description}`)
  .join("\n");

function describe(page: Snapshot) {
  const lines = page.elements.map((e) => {
    const bits = [
      `[${e.id}]`,
      e.role,
      JSON.stringify(e.label),
      e.value === undefined ? "" : `value=${JSON.stringify(e.value)}`,
      e.checked ? "(checked)" : "",
      e.disabled ? "(disabled)" : "",
      e.offscreen ? "(off-screen)" : "",
    ];
    return bits.filter(Boolean).join(" ");
  });
  return `Page: ${page.path} (${page.title})\n\nInteractive elements:\n${lines.join("\n") || "(none)"}\n\nVisible text:\n${page.text}`;
}

function prompt(
  goal: string,
  page: Snapshot,
  history: Step[],
  language: string
) {
  return [
    "You operate the Casa Brasa web app (restaurant, bars, POS, WhatsApp, Telegram, e-mail, browser, trading, notes and more) for its owner, live in his browser, like a person using the screen. He watches every step.",
    `His request: ${JSON.stringify(goal)}`,
    "",
    "Pages of the app (navigate goes straight there):",
    PAGES,
    "",
    "Steps done so far:",
    history.length
      ? history.map((h, i) => `${i + 1}. ${h.action} → ${h.result}`).join("\n")
      : "(none yet)",
    "",
    "What is on screen now:",
    describe(page),
    "",
    "Choose exactly ONE next action:",
    '- navigate: path = one of the pages above (e.g. "/whatsapp"). Prefer this to clicking the menu.',
    "- click: id = element id.",
    "- type: id = an input/textarea/editor, text = what to write (replaces its content); submit = true to press Enter after.",
    '- press: key = "Enter", "Escape", "Tab", "ArrowDown"…; id optional (the element to press it on).',
    '- scroll: direction = "up" or "down" (to reach off-screen elements or read more).',
    "- wait: when the page is still loading.",
    `- done: the request is complete; message = a short answer for him in ${language} (what you did, or the information he asked for, read from the screen).`,
    `- ask: you need something only he can tell (which contact, which message…); message = the question in ${language}.`,
    "",
    "Rules: his request is his authorization to send the messages or make the changes it asks for, and nothing beyond it. Never type passwords, PINs or access codes he did not give you, and never delete data unless he asked. If a step did not work, try another way (search box, scroll, another element) instead of repeating it. Keep thought to one short sentence. Fill every field (null when unused).",
  ].join("\n");
}

async function withClaude(text: string): Promise<Action> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-sonnet-5-5",
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(Action) },
    messages: [{ role: "user", content: text }],
  });
  if (!response.parsed_output) {
    throw new Error("unparsable");
  }
  return response.parsed_output;
}

async function nextAction(text: string): Promise<Action> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await withClaude(text);
    } catch {
      // no credits or rate limited: Groq below
    }
  }
  return Action.parse(await groqJson<Action>([], text, SCHEMA));
}

/** An administrator's POS session (the PIN), checked in Convex. */
async function posAdmin(session: string | null) {
  const url = convexUrl();
  if (!(session && url) || session.length > 100) {
    return false;
  }
  try {
    const user = await new ConvexHttpClient(url).query(api.staff.me, {
      session,
    });
    return Boolean(
      user?.active && (user.role === "admin" || user.perms.includes("users"))
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const allowed =
    (await hasAccess(request)) ||
    (await posAdmin(request.headers.get("x-pos-session")));
  if (!allowed) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  let body: {
    goal?: string;
    page?: Snapshot;
    history?: Step[];
    language?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const goal = (body.goal ?? "").trim().slice(0, 2000);
  if (!(goal && body.page && Array.isArray(body.page.elements))) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const history = (body.history ?? []).slice(-25);
  const language = (body.language ?? "Brazilian Portuguese").slice(0, 40);
  try {
    const action = await nextAction(prompt(goal, body.page, history, language));
    return NextResponse.json(action, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
