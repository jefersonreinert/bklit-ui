import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Api } from "telegram/tl/index.js";
import { callTool } from "../../../convex/mtproto";
import { findTool, TG_TOOLS } from "../catalog";
import {
  checkCredentials,
  fileParams,
  maskPhone,
  normalizePhone,
  PANEL_ONLY_TOOLS,
  parseChats,
  parseMessages,
  sniffMime,
  TG_MODULES,
  tierAllowed,
  toOutput,
} from "../core";
import { collectFiles, prepareArgs } from "../files";
import {
  codeStep,
  friendlyError,
  type LoginClient,
  passwordCheck,
  qrStep,
} from "../login";

const NO_ACCOUNT = /não tem conta/;
const SERVER_PATHS = /caminhos do servidor/;
const RE_1 = /2 minutos/;
const RE_2 = /30 segundos/;
const RE_3 = /só pode ler/;
const RE_4 = /chatId/;
const RE_5 = /indisponível/;
const RE_6 = /não está conectado/;

describe("catalog", () => {
  it("lists every mcp-telegram tool once, in a known group", () => {
    assert.ok(TG_TOOLS.length >= 180);
    const names = new Set(TG_TOOLS.map((t) => t.name));
    assert.equal(names.size, TG_TOOLS.length);
    const groups = new Set(TG_MODULES.map((m) => m.key));
    for (const t of TG_TOOLS) {
      assert.ok(groups.has(t.module), `${t.name} in ${t.module}`);
      assert.ok(["read-only", "write", "destructive"].includes(t.tier));
      assert.equal(t.inputSchema.type, "object");
    }
    for (const core of [
      "telegram-send-message",
      "telegram-read-messages",
      "telegram-list-chats",
      "telegram-search-global",
    ]) {
      assert.ok(findTool(core), core);
    }
    assert.equal(findTool("telegram-delete-message")?.tier, "destructive");
    assert.equal(findTool("telegram-list-chats")?.tier, "read-only");
  });

  it("finds path parameters: uploads in, downloads out", () => {
    const send = findTool("telegram-send-file");
    const dl = findTool("telegram-download-media");
    assert.ok(send && dl);
    assert.deepEqual(fileParams(send.inputSchema).inputs, ["filePath"]);
    assert.deepEqual(fileParams(dl.inputSchema).outputs, ["downloadPath"]);
    assert.deepEqual(fileParams(dl.inputSchema).inputs, []);
  });

  it("validates credentials and phones", () => {
    assert.equal(checkCredentials("12345", "x").ok, false);
    assert.equal(checkCredentials("abc", "a".repeat(32)).ok, false);
    const ok = checkCredentials(" 123456 ", "ABCDEF0123456789abcdef0123456789");
    assert.deepEqual(ok, {
      ok: true,
      apiId: 123_456,
      apiHash: "abcdef0123456789abcdef0123456789",
    });
    assert.equal(normalizePhone("+55 (11) 99999-0000"), "+5511999990000");
    assert.equal(normalizePhone("11 99999-0000"), null);
    assert.equal(maskPhone("+5511999990000"), "+55 •••• 0000");
  });

  it("lets the assistant write only when allowed", () => {
    assert.ok(tierAllowed("destructive", "panel", false));
    assert.ok(tierAllowed("read-only", "assistant", false));
    assert.ok(!tierAllowed("write", "assistant", false));
    assert.ok(tierAllowed("write", "assistant", true));
  });

  it("flattens MCP results and sniffs downloads", () => {
    const out = toOutput({
      content: [
        { type: "text", text: "a" },
        { type: "image", data: "QUJD", mimeType: "image/jpeg" },
        { type: "text", text: "b" },
      ],
      isError: false,
    });
    assert.deepEqual(out, {
      ok: true,
      text: "a\n\nb",
      images: [{ mimeType: "image/jpeg", data: "QUJD" }],
      files: [],
    });
    assert.equal(toOutput({ content: [], isError: true }).ok, false);
    assert.equal(
      sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0])),
      "image/jpeg"
    );
    assert.equal(
      sniffMime(new TextEncoder().encode("\0\0\0\x18ftypmp42")),
      "video/mp4"
    );
  });
});

const token = Buffer.from("secret-token");

function mockClient(
  replies: (req: unknown) => unknown
): LoginClient & { calls: unknown[]; dcs: number[] } {
  const calls: unknown[] = [];
  const dcs: number[] = [];
  return {
    calls,
    dcs,
    invoke: (req) => {
      calls.push(req);
      try {
        return Promise.resolve(replies(req));
      } catch (err) {
        return Promise.reject(err);
      }
    },
    switchDc: (dc) => {
      dcs.push(dc);
      return Promise.resolve();
    },
  };
}

const rpcError = (code: string) =>
  Object.assign(new Error(code), { errorMessage: code });

describe("login steps", () => {
  it("QR: returns the tg://login link while waiting for the scan", async () => {
    const c = mockClient(
      () => new Api.auth.LoginToken({ expires: 1_700_000_030, token })
    );
    const step = await qrStep(c, 1, "h");
    assert.deepEqual(step, {
      kind: "qr",
      url: `tg://login?token=${token.toString("base64url")}`,
      expiresAt: 1_700_000_030_000,
    });
    assert.ok(c.calls[0] instanceof Api.auth.ExportLoginToken);
  });

  it("QR: follows a DC migration and finishes", async () => {
    const c = mockClient((req) =>
      req instanceof Api.auth.ExportLoginToken
        ? new Api.auth.LoginTokenMigrateTo({ dcId: 4, token })
        : new Api.auth.LoginTokenSuccess({
            authorization: new Api.auth.AuthorizationSignUpRequired({}),
          })
    );
    assert.deepEqual(await qrStep(c, 1, "h"), { kind: "success" });
    assert.deepEqual(c.dcs, [4]);
    assert.ok(c.calls[1] instanceof Api.auth.ImportLoginToken);
  });

  it("QR and code: 2FA asks for the password with its hint", async () => {
    const twoFa = (req: unknown) => {
      if (req instanceof Api.account.GetPassword) {
        return { hint: "cachorro" };
      }
      throw rpcError("SESSION_PASSWORD_NEEDED");
    };
    assert.deepEqual(await qrStep(mockClient(twoFa), 1, "h"), {
      kind: "password",
      hint: "cachorro",
    });
    assert.deepEqual(
      await codeStep(mockClient(twoFa), {
        phone: "+551199",
        phoneCodeHash: "x",
        code: "12345",
      }),
      { kind: "password", hint: "cachorro" }
    );
  });

  it("code: wrong code and unknown number fail clearly", async () => {
    await assert.rejects(
      codeStep(
        mockClient(() => {
          throw rpcError("PHONE_CODE_INVALID");
        }),
        { phone: "+1", phoneCodeHash: "x", code: "1" }
      ),
      (err: unknown) => friendlyError(err).startsWith("Código errado")
    );
    await assert.rejects(
      codeStep(
        mockClient(() => new Api.auth.AuthorizationSignUpRequired({})),
        { phone: "+1", phoneCodeHash: "x", code: "1" }
      ),
      NO_ACCOUNT
    );
  });

  it("password: SRP check goes through CheckPassword", async () => {
    const c = mockClient((req) =>
      req instanceof Api.account.GetPassword ? { hint: null } : true
    );
    const step = await passwordCheck(c, "senha", () =>
      Promise.resolve(new Api.InputCheckPasswordEmpty())
    );
    assert.deepEqual(step, { kind: "success" });
    assert.ok(c.calls[1] instanceof Api.auth.CheckPassword);
  });

  it("explains flood waits", () => {
    assert.match(friendlyError(rpcError("FLOOD_WAIT_120")), RE_1);
    assert.match(friendlyError(rpcError("FLOOD_WAIT_30")), RE_2);
    assert.equal(friendlyError(rpcError("SOMETHING_ELSE")), "SOMETHING_ELSE");
  });
});

describe("files", () => {
  const schema = findTool("telegram-send-file")?.inputSchema ?? {};
  const dlSchema = findTool("telegram-download-media")?.inputSchema ?? {};

  it("refuses raw server paths and writes uploads to the temp folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tg-test-"));
    try {
      await assert.rejects(
        prepareArgs({ chatId: "me", filePath: "/etc/passwd" }, schema, dir),
        SERVER_PATHS
      );
      const { prepared } = await prepareArgs(
        {
          chatId: "me",
          filePath: {
            tgUpload: {
              name: "../../menu.pdf",
              type: "application/pdf",
              data: Buffer.from("%PDF-1").toString("base64"),
            },
          },
        },
        schema,
        dir
      );
      const path = prepared.filePath as string;
      assert.ok(path.startsWith(join(dir, "in")));
      assert.ok(path.endsWith("menu.pdf"));
      assert.equal(await readFile(path, "utf8"), "%PDF-1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("handles files inside arrays (send-album) and refuses nested paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tg-test-"));
    const album = findTool("telegram-send-album")?.inputSchema ?? {};
    const upload = (name: string) => ({
      tgUpload: { name, type: "image/jpeg", data: "/9j/" },
    });
    try {
      const { prepared } = await prepareArgs(
        {
          chatId: "me",
          items: [{ filePath: upload("a.jpg") }, { filePath: upload("a.jpg") }],
        },
        album,
        dir
      );
      const items = prepared.items as { filePath: string }[];
      assert.notEqual(items[0]?.filePath, items[1]?.filePath);
      await assert.rejects(
        prepareArgs(
          {
            chatId: "me",
            items: [{ filePath: "/etc/hosts" }, { filePath: upload("b.jpg") }],
          },
          album,
          dir
        ),
        SERVER_PATHS
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns downloaded files to the browser", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tg-test-"));
    try {
      const { prepared, outPaths } = await prepareArgs(
        { chatId: "me", messageId: 5, downloadPath: "/somewhere/else" },
        dlSchema,
        dir
      );
      assert.equal(prepared.downloadPath, join(dir, "out", "downloadPath"));
      await writeFile(
        outPaths[0] as string,
        Buffer.from([0xff, 0xd8, 0xff, 1])
      );
      const out = {
        ok: true,
        text: `Media downloaded to ${outPaths[0]}`,
        images: [],
        files: [],
      };
      await collectFiles(outPaths, out);
      assert.equal(out.text, "Media downloaded to o arquivo abaixo");
      assert.equal(out.files.length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

interface Handler {
  _handler: (
    ctx: unknown,
    args: unknown
  ) => Promise<{
    ok: boolean;
    text: string;
  }>;
}

/** A Convex ActionCtx double: secrets from `state`, mutations recorded. */
function fakeCtx(state: Record<string, unknown>) {
  const mutations: { args: unknown }[] = [];
  return {
    mutations,
    ctx: {
      auth: { getUserIdentity: () => Promise.resolve({ subject: "panel" }) },
      runQuery: () =>
        Promise.resolve({
          apiId: 1,
          apiHash: "a".repeat(32),
          session: "session",
          pending: null,
          assistantWrites: false,
          optIn: [],
          ...state,
        }),
      runMutation: (_ref: unknown, args: unknown) => {
        mutations.push({ args });
        return Promise.resolve(true);
      },
    },
  };
}

describe("callTool action (no network)", () => {
  const run = (callTool as unknown as Handler)._handler;

  it("blocks writes from the assistant unless allowed", async () => {
    const { ctx } = fakeCtx({});
    const out = await run(ctx, {
      name: "telegram-send-message",
      args: { chatId: "me", text: "oi" },
      source: "assistant",
    });
    assert.equal(out.ok, false);
    assert.match(out.text, RE_3);
  });

  it("reports the package's own argument validation", async () => {
    const { ctx, mutations } = fakeCtx({});
    const out = await run(ctx, { name: "telegram-send-message", args: {} });
    assert.equal(out.ok, false);
    assert.match(out.text, RE_4);
    // Session kept, call logged
    assert.ok(
      mutations.some(
        (m) => (m.args as { session?: string }).session === "session"
      )
    );
  });

  it("keeps opt-in groups off until enabled", async () => {
    const { ctx } = fakeCtx({});
    const out = await run(ctx, { name: "telegram-get-stars-status", args: {} });
    assert.equal(out.ok, false);
    assert.match(out.text, RE_5);
  });

  it("sends login/logout to the panel's own flow", async () => {
    const { ctx } = fakeCtx({});
    for (const name of PANEL_ONLY_TOOLS) {
      const out = await run(ctx, { name, args: {} });
      assert.equal(out.ok, false);
    }
  });

  it("says when Telegram is not connected", async () => {
    const { ctx } = fakeCtx({ session: null });
    const out = await run(ctx, { name: "telegram-list-chats", args: {} });
    assert.match(out.text, RE_6);
  });
});

describe("parsers", () => {
  it("reads the chat list", () => {
    const rows = parseChats(
      "P Ana Souza (12345) [2 unread]\nG Equipe Casa Brasa (-100200)\nC Notícias (-100300) [not in contacts]\nP Bot X (99) [bot]\nNo chats"
    );
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], {
      kind: "private",
      name: "Ana Souza",
      id: "12345",
      bot: false,
      notContact: false,
      unread: 2,
    });
    assert.equal(rows[1]?.kind, "group");
    assert.equal(rows[1]?.id, "-100200");
    assert.equal(rows[3]?.bot, true);
  });

  it("reads messages, oldest first, with multi-line text", () => {
    const rows = parseMessages(
      "[#12] [2026-10-10T10:00:00.000Z] Ana: segunda\nlinha\n\n[#11] [2026-10-10T09:00:00.000Z] Você: primeira [photo] [👍×2]"
    );
    assert.deepEqual(
      rows.map((r) => [r.id, r.sender, r.text]),
      [
        [11, "Você", "primeira [photo] [👍×2]"],
        [12, "Ana", "segunda\nlinha"],
      ]
    );
  });
});
