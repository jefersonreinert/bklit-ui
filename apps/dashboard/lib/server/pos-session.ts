import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexUrl } from "./panel-jwt";
import { hasAccess } from "./whatsapp";

export const POS_SESSION_HEADER = "x-pos-session";

/**
 * May this request charge a POS order? Either the browser entered the panel
 * access code, or it sends the session of a POS user (PIN) allowed to charge.
 */
export async function canCharge(request: NextRequest) {
  if (await hasAccess(request)) {
    return true;
  }
  const session = request.headers.get(POS_SESSION_HEADER);
  const url = convexUrl();
  if (!(session && url)) {
    return false;
  }
  const user = await new ConvexHttpClient(url)
    .query(api.staff.me, { session })
    .catch(() => null);
  return Boolean(user?.perms.includes("charge"));
}
