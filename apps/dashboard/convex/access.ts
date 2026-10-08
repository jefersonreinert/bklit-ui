import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requirePanel } from "./lib";

/** What a POS user may do. "users" is the administrator. */
export const PERMS = [
  "orders",
  "charge",
  "void",
  "history",
  "reports",
  "products",
  "stock",
  "tables",
  "settings",
  "users",
] as const;
export type Perm = (typeof PERMS)[number];

export const ROLE_PERMS: Record<string, Perm[]> = {
  admin: [...PERMS],
  manager: PERMS.filter((p) => p !== "users"),
  cashier: ["orders", "charge", "history"],
  waiter: ["orders"],
};

const pepper = () => process.env.POS_PIN_PEPPER ?? "casa-brasa-pos";

/** The PIN is stored only as a peppered SHA-256 (lookup key). */
export async function pinKey(pin: string) {
  const data = new TextEncoder().encode(`${pepper()}:${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PIN = /^\d{4}$/;
export const validPin = (pin: string) => PIN.test(pin);

/** The signed-in POS user of this device, or null. */
export async function staff(ctx: QueryCtx, session: string | undefined) {
  if (!session) {
    return null;
  }
  const s = await ctx.db
    .query("posSessions")
    .withIndex("by_token", (q) => q.eq("token", session))
    .unique();
  if (!s) {
    return null;
  }
  const user = await ctx.db.get(s.userId);
  return user?.active ? user : null;
}

export async function requireStaff(
  ctx: QueryCtx,
  session: string | undefined,
  perm?: Perm | Perm[]
): Promise<Doc<"posUsers">> {
  await requirePanel(ctx);
  const user = await staff(ctx, session);
  if (!user) {
    throw new ConvexError("POS_LOCKED");
  }
  const need = perm ? [perm].flat() : [];
  if (need.length && !need.some((p) => user.perms.includes(p))) {
    throw new ConvexError("POS_FORBIDDEN");
  }
  return user;
}

export async function audit(
  ctx: MutationCtx,
  user: Pick<Doc<"posUsers">, "name"> | null,
  action: string,
  detail = ""
) {
  await ctx.db.insert("posAudit", {
    userName: user?.name ?? "Sistema",
    action,
    detail: detail.slice(0, 300),
    at: Date.now(),
  });
}

export async function meta(ctx: QueryCtx) {
  return await ctx.db
    .query("posMeta")
    .withIndex("by_key", (q) => q.eq("key", "main"))
    .unique();
}
