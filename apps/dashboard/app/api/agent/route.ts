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

const TYPES = [
  "navigate",
  "click",
  "type",
  "press",
  "scroll",
  "wait",
  "done",
  "ask",
] as const;

const Step = z.object({
  type: z.enum(TYPES),
  id: z.number().int().nullable(),
  text: z.string().nullable(),
  path: z.string().nullable(),
  key: z.string().nullable(),
  submit: z.boolean().nullable(),
  direction: z.enum(["up", "down"]).nullable(),
});

/** Several steps per answer: far fewer round trips to the AI. */
const Plan = z.object({
  thought: z.string(),
  actions: z.array(Step).min(1).max(6),
  message: z.string().nullable(),
});
type Plan = z.infer<typeof Plan>;

const nullable = (type: string) => ({ type: [type, "null"] });
const SCHEMA = {
  type: "object",
  properties: {
    thought: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...TYPES] },
          id: nullable("integer"),
          text: nullable("string"),
          path: nullable("string"),
          key: nullable("string"),
          submit: nullable("boolean"),
          direction: { type: ["string", "null"], enum: ["up", "down", null] },
        },
        required: ["type", "id", "text", "path", "key", "submit", "direction"],
        additionalProperties: false,
      },
    },
    message: nullable("string"),
  },
  required: ["thought", "actions", "message"],
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
    "Answer with the next actions (1 to 6) to do right now, in order, on THIS screen — chain them to be fast (e.g. type in a field and then click Send). Stop the list right after an action that changes the page or opens something new (navigate, a click that opens a page/dialog/menu): the screen is read again after the list. Action types:",
    '- navigate: path = one of the pages above (e.g. "/whatsapp"). Prefer this to clicking the menu.',
    "- click: id = element id.",
    "- type: id = an input/textarea/editor, text = what to write (replaces its content); submit = true to press Enter after.",
    '- press: key = "Enter", "Escape", "Tab", "ArrowDown"…; id optional.',
    '- scroll: direction = "up" or "down".',
    "- wait: only when the page is still loading.",
    `- done: the request is complete (alone, or last); message = a short answer for him in ${language} (what you did, or the information he asked for, read from the screen).`,
    `- ask: you need something only he can tell; message = the question in ${language}.`,
    "",
    "Rules: his request is his authorization to send the messages or make the changes it asks for, and nothing beyond it. Never type passwords, PINs or access codes he did not give you, and never delete data unless he asked. If a step did not work, try another way (search box, scroll, another element) instead of repeating it. Keep thought to one short sentence. Fill every field (null when unused); message is null unless done/ask.",
  ].join("\n");
}

async function withClaude(text: string): Promise<Plan> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-sonnet-5-5",
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(Plan) },
    messages: [{ role: "user", content: text }],
  });
  if (!response.parsed_output) {
    throw new Error("unparsable");
  }
  return response.parsed_output;
}

/** After Claude fails (no credits, rate limit) skip it for a while: each
 * failed try would add a second to every step. */
let claudeDownUntil = 0;
const CLAUDE_COOLDOWN_MS = 10 * 60_000;

async function nextPlan(text: string): Promise<Plan> {
  if (process.env.ANTHROPIC_API_KEY && Date.now() > claudeDownUntil) {
    try {
      return await withClaude(text);
    } catch {
      claudeDownUntil = Date.now() + CLAUDE_COOLDOWN_MS;
    }
  }
  return Plan.parse(await groqJson<Plan>([], text, SCHEMA));
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
  const history = (body.history ?? []).slice(-30);
  const language = (body.language ?? "Brazilian Portuguese").slice(0, 40);
  try {
    const plan = await nextPlan(prompt(goal, body.page, history, language));
    return NextResponse.json(plan, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
