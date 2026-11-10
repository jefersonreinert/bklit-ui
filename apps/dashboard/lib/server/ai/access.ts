import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexUrl } from "@/lib/server/panel-jwt";
import { POS_SESSION_HEADER } from "@/lib/server/pos-session";
import { isCrossSite } from "@/lib/server/same-site";
import { hasAccess } from "@/lib/server/whatsapp";

/**
 * Who may use the AI routes. "manage" (keys, providers): the panel access
 * code or a POS administrator. "use" (recognize a photo): also POS users
 * who manage products or stock.
 */
export async function aiAccess(request: NextRequest, need: "manage" | "use") {
  if (isCrossSite(request)) {
    return false;
  }
  if (await hasAccess(request)) {
    return true;
  }
  const session = request.headers.get(POS_SESSION_HEADER);
  const url = convexUrl();
  if (!(session && url) || session.length > 100) {
    return false;
  }
  const user = await new ConvexHttpClient(url)
    .query(api.staff.me, { session })
    .catch(() => null);
  if (!user?.active) {
    return false;
  }
  const admin = user.role === "admin" || user.perms.includes("users");
  if (need === "manage") {
    return admin;
  }
  return admin || user.perms.includes("products") || user.perms.includes("stock");
}
