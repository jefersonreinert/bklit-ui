import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  audit,
  meta,
  newToken,
  PERMS,
  pinKey,
  ROLE_PERMS,
  requireStaff,
  staff,
  validPin,
} from "./access";
import { isPanel, requirePanel } from "./lib";

/** POS users with a 4-digit PIN, sessions per device and an audit log. */

const MAX_FAILS = 5;
const LOCK_MS = 60_000;

const publicUser = (u: Doc<"posUsers">) => ({
  id: u._id,
  name: u.name,
  role: u.role,
  perms: u.perms,
  color: u.color,
  active: u.active,
});

const cleanPerms = (perms: string[]) => PERMS.filter((p) => perms.includes(p));

/** Whether the POS was set up (has an administrator). */
export const status = query({
  args: { session: v.optional(v.string()) },
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const any = await ctx.db.query("posUsers").first();
    const m = await meta(ctx);
    return { hasUsers: Boolean(any), lockedUntil: m?.lockedUntil ?? 0 };
  },
});

/** The user of this device's session (null when locked). */
export const me = query({
  args: { session: v.optional(v.string()) },
  handler: async (ctx, { session }) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const user = await staff(ctx, session);
    return user ? publicUser(user) : null;
  },
});

async function createSession(
  ctx: Parameters<typeof audit>[0],
  user: Doc<"posUsers">,
  device: string
) {
  const token = newToken();
  await ctx.db.insert("posSessions", {
    userId: user._id,
    token,
    device: device.slice(0, 80),
    createdAt: Date.now(),
  });
  return token;
}

/** First run: the administrator (the master code). */
export const setup = mutation({
  args: { name: v.string(), pin: v.string(), device: v.string() },
  handler: async (ctx, { name, pin, device }) => {
    await requirePanel(ctx);
    if (await ctx.db.query("posUsers").first()) {
      throw new ConvexError("O POS já tem administrador.");
    }
    if (!(validPin(pin) && name.trim())) {
      throw new ConvexError("Informe nome e PIN de 4 dígitos.");
    }
    const id = await ctx.db.insert("posUsers", {
      name: name.trim(),
      role: "admin",
      perms: [...PERMS],
      color: "#c96442",
      pinKey: await pinKey(pin),
      active: true,
      createdAt: Date.now(),
    });
    const user = await ctx.db.get(id);
    if (!user) {
      throw new ConvexError("Falhou.");
    }
    await audit(ctx, user, "Criou o administrador");
    return { token: await createSession(ctx, user, device) };
  },
});

export const login = mutation({
  args: { pin: v.string(), device: v.string() },
  handler: async (ctx, { pin, device }) => {
    await requirePanel(ctx);
    const m = await meta(ctx);
    const now = Date.now();
    if (m?.lockedUntil && m.lockedUntil > now) {
      return { error: "locked" as const, until: m.lockedUntil };
    }
    const key = validPin(pin) ? await pinKey(pin) : null;
    const user = key
      ? await ctx.db
          .query("posUsers")
          .withIndex("by_pinKey", (q) => q.eq("pinKey", key))
          .first()
      : null;
    if (!user?.active) {
      if (m) {
        const fails = (m.failedLogins ?? 0) + 1;
        await ctx.db.patch(m._id, {
          failedLogins: fails >= MAX_FAILS ? 0 : fails,
          lockedUntil: fails >= MAX_FAILS ? now + LOCK_MS : m.lockedUntil,
        });
      }
      return { error: "wrong" as const };
    }
    if (m?.failedLogins) {
      await ctx.db.patch(m._id, { failedLogins: 0 });
    }
    await audit(ctx, user, "Entrou", device);
    return { token: await createSession(ctx, user, device) };
  },
});

export const logout = mutation({
  args: { session: v.string() },
  handler: async (ctx, { session }) => {
    const s = await ctx.db
      .query("posSessions")
      .withIndex("by_token", (q) => q.eq("token", session))
      .unique();
    if (s) {
      await ctx.db.delete(s._id);
    }
  },
});

export const list = query({
  args: { session: v.optional(v.string()) },
  handler: async (ctx, { session }) => {
    await requireStaff(ctx, session, "users");
    const users = await ctx.db.query("posUsers").take(200);
    return users.map(publicUser);
  },
});

export const save = mutation({
  args: {
    session: v.string(),
    id: v.optional(v.id("posUsers")),
    name: v.string(),
    role: v.string(),
    perms: v.array(v.string()),
    color: v.string(),
    active: v.boolean(),
    pin: v.optional(v.string()),
  },
  handler: async (ctx, { session, id, pin, ...fields }) => {
    const me = await requireStaff(ctx, session, "users");
    if (!fields.name.trim()) {
      throw new ConvexError("Informe o nome.");
    }
    if (pin !== undefined && !validPin(pin)) {
      throw new ConvexError("O PIN tem 4 dígitos.");
    }
    const key = pin ? await pinKey(pin) : undefined;
    if (key) {
      const taken = await ctx.db
        .query("posUsers")
        .withIndex("by_pinKey", (q) => q.eq("pinKey", key))
        .first();
      if (taken && taken._id !== id) {
        throw new ConvexError("Esse PIN já é de outro usuário. Escolha outro.");
      }
    }
    const perms =
      fields.role === "custom"
        ? cleanPerms(fields.perms)
        : (ROLE_PERMS[fields.role] ?? []);
    const doc = { ...fields, name: fields.name.trim(), perms: [...perms] };
    if (id) {
      const current = await ctx.db.get(id);
      if (!current) {
        throw new ConvexError("Usuário não encontrado.");
      }
      await guardLastAdmin(ctx, current, doc);
      await ctx.db.patch(id, key ? { ...doc, pinKey: key } : doc);
      if (!doc.active) {
        await dropSessions(ctx, id);
      }
      await audit(ctx, me, "Editou usuário", doc.name);
      return id;
    }
    if (!key) {
      throw new ConvexError("Defina o PIN do novo usuário.");
    }
    const newId = await ctx.db.insert("posUsers", {
      ...doc,
      pinKey: key,
      createdAt: Date.now(),
    });
    await audit(ctx, me, "Criou usuário", doc.name);
    return newId;
  },
});

async function dropSessions(
  ctx: Parameters<typeof audit>[0],
  userId: Doc<"posUsers">["_id"]
) {
  const sessions = await ctx.db
    .query("posSessions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(100);
  for (const s of sessions) {
    await ctx.db.delete(s._id);
  }
}

/** There must always be one active administrator. */
async function guardLastAdmin(
  ctx: Parameters<typeof audit>[0],
  current: Doc<"posUsers">,
  next: { perms: string[]; active: boolean } | null
) {
  const wasAdmin = current.active && current.perms.includes("users");
  const staysAdmin = next ? next.active && next.perms.includes("users") : false;
  if (!wasAdmin || staysAdmin) {
    return;
  }
  const admins = (await ctx.db.query("posUsers").take(200)).filter(
    (u) => u.active && u.perms.includes("users") && u._id !== current._id
  );
  if (admins.length === 0) {
    throw new ConvexError("É preciso ter pelo menos um administrador.");
  }
}

export const remove = mutation({
  args: { session: v.string(), id: v.id("posUsers") },
  handler: async (ctx, { session, id }) => {
    const me = await requireStaff(ctx, session, "users");
    const current = await ctx.db.get(id);
    if (!current) {
      return;
    }
    await guardLastAdmin(ctx, current, null);
    await dropSessions(ctx, id);
    await ctx.db.delete(id);
    await audit(ctx, me, "Removeu usuário", current.name);
  },
});

export const activity = query({
  args: { session: v.optional(v.string()) },
  handler: async (ctx, { session }) => {
    await requireStaff(ctx, session, ["users", "reports"]);
    return await ctx.db
      .query("posAudit")
      .withIndex("by_at")
      .order("desc")
      .take(150);
  },
});
