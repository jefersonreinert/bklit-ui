/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as crons from "../crons.js";
import type * as designs from "../designs.js";
import type * as eatrade from "../eatrade.js";
import type * as files from "../files.js";
import type * as guardian from "../guardian.js";
import type * as home from "../home.js";
import type * as hr from "../hr.js";
import type * as http from "../http.js";
import type * as i18n from "../i18n.js";
import type * as inventory from "../inventory.js";
import type * as ict from "../ict.js";
import type * as jarvis from "../jarvis.js";
import type * as journal from "../journal.js";
import type * as lib from "../lib.js";
import type * as loyalty from "../loyalty.js";
import type * as metatrader from "../metatrader.js";
import type * as mtproto from "../mtproto.js";
import type * as notes from "../notes.js";
import type * as ohlc from "../ohlc.js";
import type * as pos from "../pos.js";
import type * as posapi from "../posapi.js";
import type * as staff from "../staff.js";
import type * as stores from "../stores.js";
import type * as team from "../team.js";
import type * as telegram from "../telegram.js";
import type * as tgmedia from "../tgmedia.js";
import type * as vouchers from "../vouchers.js";
import type * as winemonitor from "../winemonitor.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  crons: typeof crons;
  designs: typeof designs;
  eatrade: typeof eatrade;
  files: typeof files;
  guardian: typeof guardian;
  home: typeof home;
  hr: typeof hr;
  http: typeof http;
  i18n: typeof i18n;
  inventory: typeof inventory;
  ict: typeof ict;
  jarvis: typeof jarvis;
  journal: typeof journal;
  lib: typeof lib;
  loyalty: typeof loyalty;
  metatrader: typeof metatrader;
  mtproto: typeof mtproto;
  notes: typeof notes;
  ohlc: typeof ohlc;
  pos: typeof pos;
  posapi: typeof posapi;
  staff: typeof staff;
  stores: typeof stores;
  team: typeof team;
  telegram: typeof telegram;
  tgmedia: typeof tgmedia;
  vouchers: typeof vouchers;
  winemonitor: typeof winemonitor;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
