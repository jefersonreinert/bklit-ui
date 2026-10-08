import type { QueryCtx } from "./_generated/server";

/** Every function needs a panel token (issued after the access code). */
export async function isPanel(ctx: Pick<QueryCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  return identity !== null;
}

export async function requirePanel(ctx: Pick<QueryCtx, "auth">) {
  if (!(await isPanel(ctx))) {
    throw new Error("Unauthenticated");
  }
}
