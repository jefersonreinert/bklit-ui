import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isPanel } from "./lib";

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
  "team",
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

/** The first business; documents without a company belong to it. */
export const MAIN = "main";

export const companyOf = (doc: { company?: string }) => doc.company ?? MAIN;

/** Users without a list work in every business. */
export const worksIn = (
  user: Pick<Doc<"posUsers">, "companies">,
  company: string
) => !user.companies?.length || user.companies.includes(company);

export async function requireStaff(
  ctx: QueryCtx,
  session: string | undefined,
  perm?: Perm | Perm[],
  company?: string
): Promise<Doc<"posUsers">> {
  // The POS needs only the user's PIN session, not the panel access code
  const user = await staff(ctx, session);
  if (!user) {
    throw new ConvexError("POS_LOCKED");
  }
  const need = perm ? [perm].flat() : [];
  // The administrator may do everything, including newer permissions
  const admin = user.perms.includes("users");
  if (need.length && !admin && !need.some((p) => user.perms.includes(p))) {
    throw new ConvexError("POS_FORBIDDEN");
  }
  if (company !== undefined && !worksIn(user, company)) {
    throw new ConvexError("POS_FORBIDDEN");
  }
  return user;
}

/** Whether this is a panel browser, and the POS user of the session. */
export async function isPanelUser(ctx: QueryCtx, session: string | undefined) {
  const [panel, user] = await Promise.all([isPanel(ctx), staff(ctx, session)]);
  return { panel, user };
}

/** Panel browsers (access code) or a POS user of the business may read it. */
export async function canReadPos(
  ctx: QueryCtx,
  session: string | undefined,
  company = MAIN
) {
  if (await isPanel(ctx)) {
    return true;
  }
  const user = await staff(ctx, session);
  return user !== null && worksIn(user, company);
}

export async function audit(
  ctx: MutationCtx,
  user: Pick<Doc<"posUsers">, "name"> | null,
  action: string,
  detail = "",
  company?: string
) {
  await ctx.db.insert("posAudit", {
    userName: user?.name ?? "Sistema",
    action,
    detail: detail.slice(0, 300),
    company,
    at: Date.now(),
  });
}

/** Settings of a business ("main" also holds the login lock). */
export async function meta(ctx: QueryCtx, company = MAIN) {
  return await ctx.db
    .query("posMeta")
    .withIndex("by_key", (q) => q.eq("key", company))
    .unique();
}
