import type { TgTool } from "./core";
import catalog from "./tool-catalog.json";

/**
 * The tools of @overpod/mcp-telegram, generated into tool-catalog.json by
 * scripts/gen-telegram-catalog.mjs (name, group, tier and input schema).
 */

export const TG_PACKAGE_VERSION = catalog.version;
export const TG_TOOLS = catalog.tools as TgTool[];

const BY_NAME = new Map(TG_TOOLS.map((t) => [t.name, t]));
export const findTool = (name: string) => BY_NAME.get(name);
