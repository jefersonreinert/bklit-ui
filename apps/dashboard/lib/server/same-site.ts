import type { NextRequest } from "next/server";

/** Requests made by other websites (cross-site fetches) may not write settings. */
export const isCrossSite = (request: NextRequest) =>
  request.headers.get("sec-fetch-site") === "cross-site";
