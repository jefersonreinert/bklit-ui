import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { HISTORY_KEYS, STAT_KEYS, type StatKey } from "../lib/journal/account";
import { NOTE_FIELDS, type NoteField } from "../lib/journal/note-fields";

const numbers = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, v.number()])) as Record<
    K,
    ReturnType<typeof v.number>
  >;

/** Optional fields of the TradingJournal Complete EA's closing deals. */
export const dealExtraFields = {
  rr: v.optional(v.number()),
  riskPct: v.optional(v.number()),
  riskUsd: v.optional(v.number()),
  profitPoints: v.optional(v.number()),
  durationSec: v.optional(v.number()),
  outcome: v.optional(
    v.union(v.literal("win"), v.literal("loss"), v.literal("breakeven"))
  ),
  equityAt: v.optional(v.number()),
  balanceAt: v.optional(v.number()),
  accountType: v.optional(v.string()),
  market: v.optional(v.string()),
};

export const statsValue = v.object(numbers<StatKey>(STAT_KEYS));

export const accountStatsFields = {
  account: v.string(),
  server: v.string(),
  name: v.string(),
  holder: v.string(),
  currency: v.string(),
  accountType: v.string(),
  /** Broker server time of the snapshot (ms). */
  serverTime: v.number(),
  receivedAt: v.number(),
  /** Broker clock − UTC reported by the EA (ms). */
  offsetMs: v.optional(v.number()),
  stats: statsValue,
};

const historyFields = numbers(HISTORY_KEYS);

const tradeSide = v.union(v.literal("buy"), v.literal("sell"));

/** Terminal state sent every sync by the EA (v4.10). */
export const eaSessionFields = {
  account: v.string(),
  server: v.string(),
  updatedAt: v.number(),
  /** Last heartbeat of the panel's trading screen (fast polling). */
  panelSeenAt: v.optional(v.number()),
  /** Symbols the panel wants quoted. */
  watch: v.array(v.string()),
  /** Market Watch symbols of the terminal. */
  symbols: v.array(v.string()),
  info: v.object({
    balance: v.number(),
    equity: v.number(),
    margin: v.number(),
    freeMargin: v.number(),
    leverage: v.number(),
    currency: v.string(),
    tradeAllowed: v.boolean(),
    demo: v.boolean(),
  }),
  limits: v.object({
    allowTrading: v.boolean(),
    maxLot: v.number(),
    maxRiskPct: v.number(),
    demoOnly: v.boolean(),
    requireSl: v.boolean(),
  }),
  positions: v.array(
    v.object({
      ticket: v.string(),
      symbol: v.string(),
      side: tradeSide,
      volume: v.number(),
      priceOpen: v.number(),
      priceCurrent: v.number(),
      sl: v.number(),
      tp: v.number(),
      profit: v.number(),
      swap: v.number(),
      time: v.number(),
      magic: v.number(),
      comment: v.string(),
    })
  ),
  orders: v.array(
    v.object({
      ticket: v.string(),
      symbol: v.string(),
      side: tradeSide,
      type: v.union(v.literal("limit"), v.literal("stop")),
      volume: v.number(),
      price: v.number(),
      sl: v.number(),
      tp: v.number(),
      time: v.number(),
    })
  ),
  quotes: v.array(
    v.object({
      symbol: v.string(),
      bid: v.number(),
      ask: v.number(),
      spread: v.number(),
      tickValue: v.number(),
      marginBuy: v.number(),
      marginSell: v.number(),
      time: v.number(),
    })
  ),
  plans: v.array(
    v.object({
      ticket: v.string(),
      breakeven: v.boolean(),
      levels: v.array(
        v.object({ price: v.number(), volume: v.number(), done: v.boolean() })
      ),
    })
  ),
};

/** FTMO Risk Guardian state sent by the EA v4.20 (optional `guardian`). */
const guardianLevel = v.number();
export const guardianStatusFields = {
  enabled: v.boolean(),
  version: v.string(),
  mode: v.union(v.literal("protect"), v.literal("monitor")),
  product: v.string(),
  state: guardianLevel,
  reason: v.string(),
  initialCapital: v.number(),
  dailyPct: v.number(),
  maxPct: v.number(),
  maxKind: v.union(
    v.literal("static"),
    v.literal("eod"),
    v.literal("intraday")
  ),
  balance: v.number(),
  equity: v.number(),
  estEquity: v.number(),
  exitCost: v.number(),
  dayStartBalance: v.number(),
  dailyLoss: v.number(),
  dailyLimit: v.number(),
  dailyUsePct: v.number(),
  nextDayLoss: v.number(),
  nextDayUsePct: v.number(),
  preReset: v.boolean(),
  nextResetAt: v.number(),
  maxRef: v.number(),
  maxLoss: v.number(),
  maxLimit: v.number(),
  maxUsePct: v.number(),
  worstDailyUsePct: v.number(),
  worstMaxUsePct: v.number(),
  warnPct: v.number(),
  blockPct: v.number(),
  emergencyPct: v.number(),
  dayLocked: guardianLevel,
  dayReason: v.string(),
  permLocked: guardianLevel,
  permReason: v.string(),
  permSince: v.number(),
  configProblem: v.string(),
  manualLock: v.boolean(),
  scope: v.union(v.literal("account"), v.literal("managed")),
  closeOnEmergency: v.boolean(),
  cancelPendingOnBlock: v.boolean(),
  worstCaseCheck: v.boolean(),
  requestsToday: v.number(),
  maxRequests: v.number(),
  positions: v.number(),
  pragueDay: v.string(),
};

export const guardianEventFields = {
  eid: v.string(),
  time: v.number(),
  kind: v.string(),
  state: guardianLevel,
  reason: v.string(),
  symbol: v.string(),
  ticket: v.string(),
  request: v.string(),
  result: v.string(),
  dailyUsePct: v.number(),
  maxUsePct: v.number(),
  estEquity: v.number(),
};

export const symbolSpecFields = {
  account: v.string(),
  symbol: v.string(),
  digits: v.number(),
  point: v.number(),
  tickSize: v.number(),
  tickValue: v.number(),
  contractSize: v.number(),
  volumeMin: v.number(),
  volumeMax: v.number(),
  volumeStep: v.number(),
  stopsLevel: v.number(),
  updatedAt: v.number(),
};

export const commandStatus = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("done"),
  v.literal("error"),
  v.literal("expired"),
  v.literal("cancelled")
);

export const commandFields = {
  account: v.string(),
  kind: v.union(
    v.literal("open"),
    v.literal("close"),
    v.literal("modify"),
    v.literal("cancel")
  ),
  symbol: v.optional(v.string()),
  side: v.optional(tradeSide),
  orderType: v.optional(
    v.union(v.literal("market"), v.literal("limit"), v.literal("stop"))
  ),
  volume: v.optional(v.number()),
  price: v.optional(v.number()),
  sl: v.optional(v.number()),
  tp: v.optional(v.number()),
  ticket: v.optional(v.string()),
  partials: v.optional(
    v.array(v.object({ price: v.number(), volume: v.number() }))
  ),
  breakeven: v.optional(v.boolean()),
  comment: v.optional(v.string()),
  /** Risk shown in the calculator when the order was sent (audit). */
  riskPct: v.optional(v.number()),
  status: commandStatus,
  createdAt: v.number(),
  sentAt: v.optional(v.number()),
  doneAt: v.optional(v.number()),
  result: v.optional(
    v.object({
      ok: v.boolean(),
      retcode: v.number(),
      message: v.string(),
      ticket: v.string(),
      price: v.number(),
      volume: v.number(),
    })
  ),
};

export const noteFields = Object.fromEntries(
  NOTE_FIELDS.map((f) => [f, v.optional(v.string())])
) as Record<
  NoteField,
  ReturnType<typeof v.optional<ReturnType<typeof v.string>>>
>;

/**
 * Central database of the panel. Notes are one document each (realtime,
 * searchable by the AI); every other module (POS, agents, personal
 * finances, preferences) syncs its local store as one JSON document.
 */
export const posItem = v.object({
  id: v.string(),
  productId: v.union(v.string(), v.null()),
  name: v.string(),
  price: v.number(),
  cost: v.optional(v.number()),
  qty: v.number(),
  sent: v.boolean(),
  mods: v.optional(
    v.array(
      v.object({ group: v.string(), name: v.string(), price: v.number() })
    )
  ),
  note: v.optional(v.string()),
  /** Stock units taken per qty (a 125 ml glass of a 750 ml bottle = 1/6). */
  portion: v.optional(v.number()),
});

/** Wine details of a POS product (bottle stock, sold by glass or bottle). */
export const posWine = v.object({
  color: v.string(),
  country: v.optional(v.string()),
  region: v.optional(v.string()),
  grape: v.optional(v.string()),
  producer: v.optional(v.string()),
  vintage: v.optional(v.string()),
  /** Dispenser slot ("D2#10"). */
  tap: v.optional(v.string()),
  bottleMl: v.number(),
  /** Bottle to take away (the product price is the bottle at the table). */
  takeaway: v.optional(v.number()),
  /** Glass sizes sold from the bottle. */
  pours: v.array(v.object({ ml: v.number(), price: v.number() })),
});

export const modifierGroup = v.object({
  id: v.string(),
  name: v.string(),
  required: v.boolean(),
  multiple: v.boolean(),
  active: v.boolean(),
  options: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      price: v.number(),
      active: v.boolean(),
    })
  ),
});

const posPayment = v.object({
  method: v.string(),
  amount: v.number(),
  tip: v.number(),
  ref: v.optional(v.string()),
  at: v.number(),
});

export default defineSchema({
  notes: defineTable({
    clientId: v.string(),
    title: v.string(),
    folder: v.string(),
    content: v.string(),
    pinned: v.boolean(),
    icon: v.optional(v.string()),
    cover: v.optional(v.string()),
    parentId: v.optional(v.union(v.string(), v.null())),
    /** Where an imported page came from ("notion:<id>"), for re-imports. */
    origin: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deleted: v.boolean(),
    /** Server write order: devices download only what changed after it. */
    syncedAt: v.optional(v.number()),
  })
    .index("by_clientId", ["clientId"])
    .index("by_synced", ["syncedAt"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["deleted"],
    }),

  /* ---------------------------------- POS --------------------------------- */
  // One document per product/order so several iPads and phones can sell at
  // the same time without overwriting each other (each change is a
  // transaction on the server).

  posProducts: defineTable({
    cid: v.string(),
    name: v.string(),
    category: v.string(),
    /** Optional second level under the category ("Cervejas" › "IPA"). */
    subcategory: v.optional(v.string()),
    price: v.number(),
    color: v.string(),
    available: v.boolean(),
    cost: v.optional(v.number()),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    unit: v.optional(v.string()),
    trackStock: v.optional(v.boolean()),
    stock: v.optional(v.number()),
    minStock: v.optional(v.number()),
    description: v.optional(v.string()),
    modifiers: v.optional(v.array(modifierGroup)),
    wine: v.optional(posWine),
    /** Recipe (technical sheet): selling one uses these ingredients. */
    recipe: v.optional(
      v.array(v.object({ productId: v.string(), qty: v.number() }))
    ),
    /** Business (posMeta key); missing = "main". */
    company: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_cid", ["cid"])
    .index("by_company", ["company"])
    .index("by_barcode", ["barcode"]),

  /**
   * Category tree of a business: top categories (no parent) and their
   * subcategories. Products keep the names (category / subcategory), so
   * older products without a row here still show up.
   */
  posCategories: defineTable({
    company: v.string(),
    name: v.string(),
    /** Name of the parent category; missing = top level. */
    parent: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    sort: v.number(),
    updatedAt: v.number(),
  }).index("by_company", ["company", "sort"]),

  /* ------------------------------ AI providers ----------------------------- */
  // Written only by the app's server (AI router); keys are sealed with
  // AES-GCM on the server and never sent to browsers.

  aiProviders: defineTable({
    provider: v.string(),
    enabled: v.boolean(),
    model: v.string(),
    keySealed: v.optional(v.string()),
    keyLast4: v.optional(v.string()),
    status: v.object({
      state: v.union(v.literal("ok"), v.literal("error"), v.literal("unknown")),
      kind: v.optional(v.string()),
      message: v.optional(v.string()),
      checkedAt: v.optional(v.number()),
      latencyMs: v.optional(v.number()),
    }),
    cooldownUntil: v.optional(v.number()),
    models: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.optional(v.string()),
          vision: v.optional(v.boolean()),
        })
      )
    ),
    modelsAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_provider", ["provider"]),

  aiSettings: defineTable({
    key: v.string(),
    order: v.array(v.string()),
    fallbackEnabled: v.boolean(),
    fallbackOn: v.array(v.string()),
    allowAmbiguous: v.boolean(),
    notifySwitch: v.boolean(),
    timeoutMs: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /** One row per AI request: who answered, every attempt, cached result. */
  aiRequests: defineTable({
    requestId: v.string(),
    hash: v.string(),
    task: v.string(),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("failed")),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    attempts: v.array(
      v.object({
        provider: v.string(),
        model: v.string(),
        ok: v.boolean(),
        kind: v.optional(v.string()),
        message: v.optional(v.string()),
        ms: v.number(),
        skipped: v.optional(v.string()),
      })
    ),
    result: v.optional(v.string()),
    cached: v.optional(v.boolean()),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_requestId", ["requestId"])
    .index("by_hash", ["hash", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  /* --------------------------- Lightspeed K-Series -------------------------- */
  // Connection to the Lightspeed POS (OAuth). Only internal functions read
  // the secret and tokens; the panel sees whether they exist.

  lskAuth: defineTable({
    key: v.string(),
    env: v.string(),
    clientId: v.string(),
    clientSecret: v.string(),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    accessExpiresAt: v.optional(v.number()),
    refreshExpiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
    lockUntil: v.optional(v.number()),
    connectedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    syncError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  lskStates: defineTable({
    state: v.string(),
    returnTo: v.string(),
    createdAt: v.number(),
  }).index("by_state", ["state"]),

  /** Lightspeed business locations, each linked to one of our businesses. */
  lskLocations: defineTable({
    locationId: v.number(),
    businessId: v.number(),
    businessName: v.string(),
    name: v.string(),
    company: v.optional(v.string()),
    enabled: v.boolean(),
    salesCursor: v.optional(v.number()),
    menuAt: v.optional(v.number()),
    floorAt: v.optional(v.number()),
    checksAt: v.optional(v.number()),
    salesAt: v.optional(v.number()),
    error: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_location", ["locationId"])
    .index("by_company", ["company"]),

  lskItems: defineTable({
    locationId: v.number(),
    sku: v.string(),
    name: v.string(),
    price: v.number(),
    group: v.string(),
    subgroup: v.optional(v.string()),
    color: v.optional(v.string()),
    taxPct: v.optional(v.number()),
    menu: v.string(),
    modifierGroups: v.number(),
  }).index("by_location", ["locationId"]),

  lskFloors: defineTable({
    locationId: v.number(),
    floors: v.any(),
    checks: v.any(),
    floorsAt: v.number(),
    checksAt: v.number(),
  }).index("by_location", ["locationId"]),

  lskSales: defineTable({
    locationId: v.number(),
    receiptId: v.string(),
    closedAt: v.number(),
    openedAt: v.number(),
    cancelled: v.boolean(),
    table: v.string(),
    covers: v.number(),
    staff: v.string(),
    total: v.number(),
    tax: v.number(),
    tips: v.number(),
    payments: v.array(
      v.object({ code: v.string(), name: v.string(), amount: v.number(), tip: v.number() })
    ),
    lines: v.array(
      v.object({
        sku: v.string(),
        name: v.string(),
        qty: v.number(),
        total: v.number(),
        group: v.string(),
      })
    ),
  })
    .index("by_location_closed", ["locationId", "closedAt"])
    .index("by_receipt", ["locationId", "receiptId"]),

  posOrders: defineTable({
    cid: v.string(),
    number: v.number(),
    tableId: v.union(v.string(), v.null()),
    name: v.string(),
    items: v.array(posItem),
    taxRate: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("paying"),
      v.literal("paid"),
      v.literal("void")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** When it was paid or voided (0 while open). */
    closedAt: v.number(),
    payment: v.optional(posPayment),
    openedBy: v.optional(v.string()),
    closedBy: v.optional(v.string()),
    company: v.optional(v.string()),
    /** Guest book customer of this order (loyalty). */
    customerId: v.optional(v.id("posCustomers")),
    customerName: v.optional(v.string()),
    /** Fiscal receipt number, given on payment (consecutive, no gaps). */
    fiscalNumber: v.optional(v.number()),
  })
    .index("by_cid", ["cid"])
    .index("by_customer", ["customerId", "closedAt"])
    .index("by_status_closed", ["status", "closedAt"])
    .index("by_company_status_closed", ["company", "status", "closedAt"]),

  /**
   * One document per business (key "main" is the first one): settings,
   * floor plan, receipt design and its profile (name, color, modules).
   */
  posMeta: defineTable({
    key: v.string(),
    profile: v.optional(v.any()),
    areas: v.any(),
    settings: v.any(),
    receipt: v.any(),
    /** Printers and their routing, shared by every device. */
    printers: v.optional(v.any()),
    nextOrderNumber: v.number(),
    /** Next fiscal receipt number (Malta: consecutive, only paid orders). */
    nextFiscalNumber: v.optional(v.number()),
    failedLogins: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
  }).index("by_key", ["key"]),

  /**
   * Customers of the whole group (guest book): contact, VIP discount,
   * loyalty stamps and what they spent. Shared by every business.
   */
  posCustomers: defineTable({
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    /** "MM-DD" or "YYYY-MM-DD". */
    birthday: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.array(v.string()),
    /** VIP card: percent off every order (0 = none). */
    vip: v.number(),
    /** Loyalty card code (QR / barcode on the card or phone). */
    code: v.string(),
    stamps: v.array(v.object({ programId: v.string(), count: v.number() })),
    visits: v.number(),
    spent: v.number(),
    lastVisit: v.optional(v.number()),
    lastCompany: v.optional(v.string()),
    /** Agreed to receive offers (GDPR). */
    optIn: v.boolean(),
    createdAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_code", ["code"])
    .index("by_phone", ["phone"])
    .index("by_email", ["email"])
    .index("by_lastVisit", ["lastVisit"])
    .searchIndex("search_name", { searchField: "name" }),

  /** Punch cards: every N qualifying items earns a reward. */
  posPunchPrograms: defineTable({
    company: v.string(),
    name: v.string(),
    categories: v.array(v.string()),
    productIds: v.array(v.string()),
    stamps: v.number(),
    /** "free": the cheapest qualifying item of the order; "amount": value off. */
    reward: v.union(v.literal("free"), v.literal("amount")),
    rewardValue: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_company", ["company"]),

  /** Gift cards with a balance (sold, topped up and spent at the POS). */
  posGiftCards: defineTable({
    code: v.string(),
    label: v.string(),
    initial: v.number(),
    balance: v.number(),
    /** Not active until the order that sells it is paid. */
    active: v.boolean(),
    customerId: v.optional(v.id("posCustomers")),
    /** 0 = never expires. */
    expiresAt: v.number(),
    createdAt: v.number(),
    createdBy: v.string(),
    history: v.array(
      v.object({
        kind: v.union(
          v.literal("issue"),
          v.literal("topup"),
          v.literal("redeem")
        ),
        amount: v.number(),
        orderCid: v.optional(v.string()),
        orderNumber: v.optional(v.number()),
        company: v.optional(v.string()),
        userName: v.string(),
        at: v.number(),
      })
    ),
  }).index("by_code", ["code"]),

  /** Suppliers of a business (inventory). */
  posSuppliers: defineTable({
    company: v.string(),
    name: v.string(),
    contact: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_company", ["company"]),

  /** Purchase orders: draft → ordered → received (adds the stock). */
  posPurchases: defineTable({
    company: v.string(),
    number: v.number(),
    supplierId: v.optional(v.id("posSuppliers")),
    supplierName: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("ordered"),
      v.literal("received"),
      v.literal("cancelled")
    ),
    items: v.array(
      v.object({
        productId: v.string(),
        name: v.string(),
        qty: v.number(),
        unitCost: v.number(),
        /** Quantity that arrived (set when received). */
        received: v.optional(v.number()),
      })
    ),
    note: v.optional(v.string()),
    createdAt: v.number(),
    createdBy: v.string(),
    orderedAt: v.optional(v.number()),
    receivedAt: v.optional(v.number()),
    receivedBy: v.optional(v.string()),
  }).index("by_company_created", ["company", "createdAt"]),

  /** Stock takes: what the system had vs what was counted. */
  posCounts: defineTable({
    company: v.string(),
    number: v.number(),
    name: v.string(),
    status: v.union(v.literal("open"), v.literal("closed")),
    items: v.array(
      v.object({
        productId: v.string(),
        name: v.string(),
        category: v.string(),
        unit: v.optional(v.string()),
        expected: v.number(),
        counted: v.union(v.number(), v.null()),
        unitCost: v.number(),
      })
    ),
    createdAt: v.number(),
    createdBy: v.string(),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.string()),
  }).index("by_company_created", ["company", "createdAt"]),

  posStock: defineTable({
    productCid: v.string(),
    qty: v.number(),
    kind: v.union(
      v.literal("sale"),
      v.literal("purchase"),
      v.literal("adjust"),
      v.literal("waste"),
      /** Stock take: the difference between the count and the system. */
      v.literal("count")
    ),
    unitCost: v.optional(v.number()),
    note: v.optional(v.string()),
    orderCid: v.optional(v.string()),
    userName: v.optional(v.string()),
    company: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_product", ["productCid", "at"])
    .index("by_at", ["at"]),

  /** Totals per local day, updated on each payment (fast, cheap reports). */
  posDaily: defineTable({
    day: v.string(),
    orders: v.number(),
    sales: v.number(),
    subtotal: v.number(),
    tax: v.number(),
    tips: v.number(),
    cost: v.number(),
    items: v.number(),
    /** method → amount */
    methods: v.record(v.string(), v.number()),
    /** "00".."23" → sales */
    hours: v.record(v.string(), v.number()),
    /** product cid (or "avulso:name") → totals */
    products: v.record(
      v.string(),
      v.object({
        name: v.string(),
        category: v.string(),
        qty: v.number(),
        revenue: v.number(),
        cost: v.number(),
      })
    ),
    company: v.optional(v.string()),
  })
    .index("by_day", ["day"])
    .index("by_company_day", ["company", "day"]),

  posUsers: defineTable({
    name: v.string(),
    role: v.string(),
    perms: v.array(v.string()),
    color: v.string(),
    /** SHA-256 of the PIN with a server secret; the PIN is never stored. */
    pinKey: v.string(),
    active: v.boolean(),
    /** Businesses this user works in (missing or empty = all). */
    companies: v.optional(v.array(v.string())),
    /** HR: job title, contacts, pay per hour and start date (YYYY-MM-DD). */
    jobTitle: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    hourlyRate: v.optional(v.number()),
    startDate: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_pinKey", ["pinKey"]),

  /* ------------------------------ translations ---------------------------- */
  // AI translations of the interface, shared by every device: one language
  // is split in CHUNKS documents (key = Portuguese text → translation).

  i18nChunks: defineTable({
    locale: v.string(),
    chunk: v.number(),
    /** [Portuguese text, translation] (keys with accents can't be fields). */
    pairs: v.array(v.array(v.string())),
    updatedAt: v.number(),
  }).index("by_locale_chunk", ["locale", "chunk"]),

  /* --------------------------------- team --------------------------------- */
  // Rota and time clock of the POS users, per business.

  /**
   * HR file of a POS user (panel only): origin (EU or not), identity and
   * pay. Personal data, kept apart from the POS users the devices read.
   */
  hrProfiles: defineTable({
    userId: v.id("posUsers"),
    origin: v.union(v.literal("eu"), v.literal("non-eu")),
    nationality: v.optional(v.string()),
    /** Required on the contract (S.L. 452.126 reg. 5(1)(a)). */
    gender: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    address: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    passportNumber: v.optional(v.string()),
    tin: v.optional(v.string()),
    ssn: v.optional(v.string()),
    iban: v.optional(v.string()),
    /** Paid by the hour (clock) or a monthly salary plus overtime. */
    payType: v.union(v.literal("hourly"), v.literal("monthly")),
    monthlySalary: v.optional(v.number()),
    /** Business where the person normally works (contract workplace). */
    workplace: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /* ------------------------------ reservations ---------------------------- */
  // Bookings of every venue and channel (lib/reservations/engine.ts rules).

  resVenues: defineTable({
    company: v.string(),
    /** VenueSettings of lib/reservations/engine.ts. */
    settings: v.any(),
    updatedAt: v.number(),
  }).index("by_company", ["company"]),

  reservations: defineTable({
    company: v.string(),
    ref: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    /** Service date YYYY-MM-DD and local start HH:MM. */
    date: v.string(),
    time: v.string(),
    duration: v.number(),
    party: v.number(),
    /** POS floor plan table ids (several = combined tables). */
    tables: v.array(v.string()),
    source: v.string(),
    status: v.string(),
    requests: v.optional(v.string()),
    notes: v.optional(v.string()),
    occasion: v.optional(v.string()),
    vip: v.optional(v.boolean()),
    /** Private event / large group. */
    event: v.optional(v.boolean()),
    customerId: v.optional(v.id("posCustomers")),
    /** Guest profile in the reservations CRM (resGuests). */
    guestId: v.optional(v.id("resGuests")),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Who changed what, newest last. */
    log: v.array(
      v.object({ at: v.number(), by: v.string(), what: v.string() })
    ),
  })
    .index("by_company_date", ["company", "date"])
    .index("by_date", ["date"])
    .index("by_ref", ["ref"])
    .index("by_phone", ["phone"])
    .index("by_guest", ["guestId", "date"]),

  /**
   * Guests of every venue (CRM), keyed by phone or e-mail. Visit and
   * no-show figures are computed from their reservations.
   */
  resGuests: defineTable({
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    vip: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    /** Allergies, favourite table, drinks… */
    preferences: v.optional(v.string()),
    /** Birthday "MM-DD" or anniversary etc. */
    occasions: v.optional(v.string()),
    notes: v.optional(v.string()),
    /** GDPR marketing consent and when it was given or withdrawn. */
    marketing: v.optional(v.boolean()),
    consentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_phone", ["phone"])
    .index("by_email", ["email"])
    .index("by_updated", ["updatedAt"]),

  /* ------------------------------- operations ----------------------------- */
  // Departments, checklists (forms), their fillings and documents, per business.

  opsDepartments: defineTable({
    company: v.string(),
    name: v.string(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_company", ["company"]),

  opsForms: defineTable({
    company: v.string(),
    departmentId: v.id("opsDepartments"),
    title: v.string(),
    frequency: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("log")
    ),
    items: v.array(v.object({ id: v.string(), text: v.string() })),
    /** Time slots of a log sheet ("10:00", "11:00"…). */
    slots: v.optional(v.array(v.string())),
    note: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_company", ["company"])
    .index("by_department", ["departmentId"]),

  opsSubmissions: defineTable({
    company: v.string(),
    formId: v.id("opsForms"),
    /** Who did it (name typed or picked). */
    by: v.string(),
    at: v.number(),
    /** Local day YYYY-MM-DD the checklist refers to. */
    day: v.string(),
    slot: v.optional(v.string()),
    done: v.array(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_form_at", ["formId", "at"])
    .index("by_company_at", ["company", "at"]),

  opsDocuments: defineTable({
    company: v.string(),
    departmentId: v.id("opsDepartments"),
    title: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    updatedAt: v.number(),
  }).index("by_company", ["company"]),

  /** HR settings: the employer on contracts and the pay multipliers. */
  hrSettings: defineTable({
    key: v.string(),
    employerName: v.string(),
    regNo: v.string(),
    employerAddress: v.string(),
    signatory: v.string(),
    signatoryTitle: v.string(),
    weeklyHours: v.number(),
    overtime: v.number(),
    sunday: v.number(),
    holiday: v.number(),
    probationMonths: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /** One employee's month: manual hour corrections and the approval. */
  hrPayruns: defineTable({
    userId: v.id("posUsers"),
    /** YYYY-MM. */
    month: v.string(),
    adjustments: v.array(
      v.object({ hours: v.number(), note: v.string(), at: v.number() })
    ),
    approvedAt: v.optional(v.number()),
    approvedHours: v.optional(v.number()),
    approvedGross: v.optional(v.number()),
  })
    .index("by_user_month", ["userId", "month"])
    .index("by_month", ["month"]),

  /**
   * Contracts of employment (lib/hr/contract.ts) and their electronic
   * signatures: the text is frozen with its SHA-256 when created; the
   * employee signs through a secret link (token).
   */
  hrContracts: defineTable({
    userId: v.id("posUsers"),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("signed"),
      v.literal("void")
    ),
    fields: v.any(),
    text: v.string(),
    hash: v.string(),
    token: v.string(),
    createdAt: v.number(),
    employerSignature: v.optional(v.string()),
    employerSignedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    employeeName: v.optional(v.string()),
    employeeSignature: v.optional(v.string()),
    employeeSignedAt: v.optional(v.number()),
    employeeIp: v.optional(v.string()),
    employeeAgent: v.optional(v.string()),
    voidedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  /** Employee documents (lib/hr/malta-documents.ts kinds); files in storage. */
  hrDocuments: defineTable({
    userId: v.id("posUsers"),
    kind: v.string(),
    label: v.optional(v.string()),
    number: v.optional(v.string()),
    /** YYYY-MM-DD. */
    expiresAt: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    note: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_expires", ["expiresAt"]),

  staffShifts: defineTable({
    company: v.string(),
    userId: v.id("posUsers"),
    /** Local day YYYY-MM-DD. */
    date: v.string(),
    /** HH:MM; an end earlier than the start finishes the next day. */
    start: v.string(),
    end: v.string(),
    note: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_company_date", ["company", "date"])
    .index("by_user_date", ["userId", "date"]),

  staffPunches: defineTable({
    company: v.string(),
    userId: v.id("posUsers"),
    /** Clock-in and clock-out (ms); out is null while working. */
    in: v.number(),
    out: v.union(v.number(), v.null()),
    /** Local day of the clock-in (YYYY-MM-DD), for weekly sums. */
    date: v.string(),
    device: v.optional(v.string()),
  })
    .index("by_company_date", ["company", "date"])
    .index("by_user_in", ["userId", "in"]),

  posSessions: defineTable({
    userId: v.id("posUsers"),
    token: v.string(),
    device: v.string(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  posVouchers: defineTable({
    code: v.string(),
    kind: v.union(v.literal("amount"), v.literal("percent")),
    value: v.number(),
    label: v.string(),
    maxUses: v.number(),
    uses: v.number(),
    /** 0 = never expires. */
    expiresAt: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    createdBy: v.string(),
    redemptions: v.array(
      v.object({
        orderCid: v.string(),
        orderNumber: v.number(),
        amount: v.number(),
        userName: v.string(),
        at: v.number(),
      })
    ),
  })
    .index("by_code", ["code"])
    .index("by_created", ["createdAt"]),

  /**
   * Read-only POS API keys (convex/posapi.ts). Only the SHA-256 of the key
   * is kept; the key itself is shown once, in the browser that made it.
   */
  posApiKeys: defineTable({
    company: v.string(),
    name: v.string(),
    /** First characters, to tell keys apart ("cb_live_ab12…"). */
    prefix: v.string(),
    hash: v.string(),
    createdAt: v.number(),
    createdBy: v.string(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_hash", ["hash"])
    .index("by_company", ["company"]),

  posAudit: defineTable({
    userName: v.string(),
    action: v.string(),
    detail: v.string(),
    company: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  /* ------------------------- The Inner Circle Trader ---------------------- */
  // Posts of @I_Am_The_ICT collected by the ict cron; the text is stored
  // exactly as the X API returned it, Grok's analysis lives apart.

  ictPosts: defineTable({
    postId: v.string(),
    authorId: v.string(),
    username: v.string(),
    text: v.string(),
    createdAt: v.number(),
    url: v.string(),
    conversationId: v.optional(v.string()),
    references: v.array(v.object({ type: v.string(), id: v.string() })),
    media: v.array(
      v.object({
        type: v.string(),
        url: v.optional(v.string()),
        previewUrl: v.optional(v.string()),
      })
    ),
    urls: v.array(v.string()),
    metrics: v.optional(v.record(v.string(), v.number())),
    /** Untouched API object (JSON). */
    raw: v.string(),
    fetchedAt: v.number(),
    // Denormalized from the current analysis, for filters and search
    analysisStatus: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    analysisStartedAt: v.optional(v.number()),
    category: v.optional(v.string()),
    relevance: v.optional(v.string()),
    concepts: v.optional(v.array(v.string())),
    /** Original text + Portuguese summary (one search index for both). */
    searchText: v.string(),
    favorite: v.boolean(),
    read: v.boolean(),
  })
    .index("by_postId", ["postId"])
    .index("by_created", ["createdAt"])
    .index("by_status", ["analysisStatus", "createdAt"])
    .index("by_category", ["category", "createdAt"])
    .index("by_relevance", ["relevance", "createdAt"])
    .index("by_favorite", ["favorite", "createdAt"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["category", "relevance", "favorite"],
    }),

  /** Every Grok run; the newest completed one is the post's analysis. */
  ictAnalyses: defineTable({
    postId: v.string(),
    model: v.string(),
    status: v.union(v.literal("completed"), v.literal("failed")),
    /** IctAnalysisResult as JSON (completed only). */
    result: v.optional(v.string()),
    summary: v.optional(v.string()),
    category: v.optional(v.string()),
    relevance: v.optional(v.string()),
    error: v.optional(v.string()),
    attempt: v.number(),
    createdAt: v.number(),
  }).index("by_post", ["postId", "createdAt"]),

  ictAlerts: defineTable({
    postId: v.string(),
    reasons: v.array(v.string()),
    read: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_created", ["createdAt"]),

  /**
   * API keys typed in the panel (ICT Monitor → Chaves). Only internal
   * functions read them; queries return whether they exist, never values.
   * Convex environment variables, when set, take precedence.
   */
  ictSecrets: defineTable({
    name: v.union(
      v.literal("xBearer"),
      v.literal("xaiKey"),
      v.literal("xaiModel")
    ),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  /** One document: settings, sync cursor, lock and last errors. */
  ictState: defineTable({
    key: v.literal("main"),
    // Settings
    enabled: v.boolean(),
    aiEnabled: v.boolean(),
    intervalMinutes: v.number(),
    interests: v.array(v.string()),
    alertRules: v.object({
      newPost: v.boolean(),
      categories: v.array(v.string()),
      keywords: v.array(v.string()),
      concepts: v.array(v.string()),
      minRelevance: v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.null()
      ),
    }),
    // Sync state
    userId: v.optional(v.string()),
    displayName: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    /** Analyse every new post with Grok on its own (off: only on request). */
    autoAnalyze: v.optional(v.boolean()),
    sinceId: v.optional(v.string()),
    /** Pagination interrupted by maxPages: continue from here. */
    resumeToken: v.optional(v.string()),
    resumeNewestId: v.optional(v.string()),
    status: v.string(),
    lockUntil: v.number(),
    nextAllowedAt: v.number(),
    lastCheckAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastPostAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastErrorAt: v.optional(v.number()),
    lastGrokError: v.optional(v.string()),
    lastGrokErrorAt: v.optional(v.number()),
    grokModel: v.optional(v.string()),
    rateRemaining: v.optional(v.number()),
    rateResetAt: v.optional(v.number()),
    consecutiveFailures: v.number(),
    syncs: v.number(),
    postsStored: v.number(),
    analysesDone: v.number(),
    analysesFailed: v.number(),
  }).index("by_key", ["key"]),

  stores: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
    device: v.string(),
  }).index("by_key", ["key"]),

  /**
   * Telegram connector (one document). The API hash and the MTProto
   * session never leave the server: public queries only report whether
   * they exist.
   */
  tgState: defineTable({
    key: v.literal("main"),
    apiId: v.optional(v.number()),
    apiHash: v.optional(v.string()),
    /** GramJS StringSession of the logged-in account. */
    session: v.optional(v.string()),
    me: v.optional(
      v.object({
        id: v.string(),
        name: v.string(),
        username: v.optional(v.string()),
        phone: v.optional(v.string()),
      })
    ),
    connectedAt: v.optional(v.number()),
    /** A login in progress (QR or phone code), with its temporary session. */
    pending: v.optional(
      v.object({
        kind: v.union(v.literal("qr"), v.literal("phone")),
        session: v.string(),
        startedAt: v.number(),
        phone: v.optional(v.string()),
        phoneCodeHash: v.optional(v.string()),
        codeVia: v.optional(v.string()),
        qrUrl: v.optional(v.string()),
        qrExpiresAt: v.optional(v.number()),
        needsPassword: v.optional(v.boolean()),
        passwordHint: v.optional(v.string()),
      })
    ),
    /** The assistant may run tools that send or change things. */
    assistantWrites: v.boolean(),
    /** Opt-in groups of mcp-telegram (Stars, group calls, quick replies). */
    optIn: v.array(v.string()),
    lockUntil: v.number(),
    lastUsedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastErrorAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  /**
   * Telegram media saved to the gallery: the file lives in Convex storage,
   * keyed by chat + message so nothing is saved twice. day/month/year are
   * in the time zone of the browser that saved it.
   */
  tgMedia: defineTable({
    chatId: v.string(),
    chatName: v.string(),
    messageId: v.number(),
    kind: v.string(),
    mime: v.string(),
    fileName: v.string(),
    size: v.number(),
    storageId: v.id("_storage"),
    /** When the message was sent (ms). */
    date: v.number(),
    day: v.string(),
    month: v.string(),
    year: v.string(),
    sender: v.optional(v.string()),
    caption: v.optional(v.string()),
    savedAt: v.number(),
  })
    .index("by_message", ["chatId", "messageId"])
    .index("by_date", ["date"])
    .index("by_day", ["day", "date"])
    .index("by_month", ["month", "date"])
    .index("by_year", ["year", "date"])
    .index("by_chat", ["chatId", "date"]),

  /** Audit trail of Telegram tool calls (no message bodies). */
  tgCalls: defineTable({
    tool: v.string(),
    source: v.union(
      v.literal("panel"),
      v.literal("assistant"),
      v.literal("login")
    ),
    ok: v.boolean(),
    ms: v.number(),
    error: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  /** MetaTrader connector (metatrader-mcp-server on the person's MT5 PC/VPS). */
  mtState: defineTable({
    key: v.literal("main"),
    /** MCP endpoint, e.g. https://mt5.example.com/mcp or …/sse. */
    url: v.optional(v.string()),
    transport: v.optional(
      v.union(v.literal("streamable-http"), v.literal("sse"))
    ),
    /** Secret: auth headers for the proxy in front of the server. */
    headers: v.optional(v.record(v.string(), v.string())),
    /** Optional metatrader-http-server base URL (candles by date, symbol info). */
    restUrl: v.optional(v.string()),
    /** Optional metatrader-quote-server WebSocket URL (live ticks). */
    quoteUrl: v.optional(v.string()),
    /** Orders and closes from the panel. */
    allowTrading: v.boolean(),
    /** Orders and closes from the AI assistant. */
    assistantTrading: v.boolean(),
    /** Tool names the server reported on the last test. */
    serverTools: v.optional(v.array(v.string())),
    lastOkAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastErrorAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  mtCalls: defineTable({
    tool: v.string(),
    source: v.union(v.literal("panel"), v.literal("assistant")),
    ok: v.boolean(),
    ms: v.number(),
    /** Short, secret-free summary of the arguments. */
    args: v.optional(v.string()),
    error: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),

  /** Documentos → Arquivos: the person's own folders (nested). */
  docFolders: defineTable({
    name: v.string(),
    parentId: v.optional(v.id("docFolders")),
    color: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_parent", ["parentId"]),

  /**
   * Files and sheets in those folders. Uploads keep their bytes in Convex
   * storage; a "sheet" (e.g. a scanned page turned into text) keeps its
   * text here and may point to the scan image.
   */
  docFiles: defineTable({
    name: v.string(),
    folderId: v.optional(v.id("docFolders")),
    kind: v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("pdf"),
      v.literal("audio"),
      v.literal("sheet"),
      v.literal("other")
    ),
    mimeType: v.string(),
    size: v.number(),
    storageId: v.optional(v.id("_storage")),
    /** Sheet text (Markdown) or the OCR text of a scan. */
    text: v.optional(v.string()),
    /** Scan images a sheet was made from. */
    sourceIds: v.optional(v.array(v.id("_storage"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_folder", ["folderId"])
    .index("by_updated", ["updatedAt"]),

  /** Trading journal: webhook token and connector state. */
  jrnState: defineTable({
    key: v.literal("main"),
    /** Secret in the webhook URLs (EA and TradingView). */
    token: v.string(),
    lastMt5At: v.optional(v.number()),
    lastTvAt: v.optional(v.number()),
    /** Last account statistics from the TradingJournal Complete EA. */
    lastStatsAt: v.optional(v.number()),
    /** Options of the structured note fields (defaults when absent). */
    noteOptions: v.optional(v.record(v.string(), v.array(v.string()))),
    /** Accounts seen by the EA (login → server/broker, clock offset). */
    accounts: v.optional(
      v.array(
        v.object({
          login: v.string(),
          server: v.string(),
          name: v.string(),
          /** Broker clock − UTC (ms), from the EA's server_offset_sec. */
          offsetMs: v.optional(v.number()),
          /** Last time the EA sent anything for this account. */
          lastSeen: v.optional(v.number()),
        })
      )
    ),
  }).index("by_key", ["key"]),

  /** MT5 deals sent by the CasaBrasaJournal EA (one row per deal ticket). */
  jrnDeals: defineTable({
    account: v.string(),
    ticket: v.string(),
    position: v.string(),
    symbol: v.string(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    entry: v.union(
      v.literal("in"),
      v.literal("out"),
      v.literal("inout"),
      v.literal("out_by")
    ),
    volume: v.number(),
    price: v.number(),
    sl: v.number(),
    tp: v.number(),
    profit: v.number(),
    commission: v.number(),
    swap: v.number(),
    fee: v.number(),
    magic: v.number(),
    comment: v.string(),
    time: v.number(),
    ...dealExtraFields,
  })
    .index("by_ticket", ["account", "ticket"])
    .index("by_time", ["time"]),

  /**
   * Balance operations that are not trades (deposits, withdrawals,
   * credits, corrections), sent by the TradingJournal Complete EA.
   */
  jrnCash: defineTable({
    account: v.string(),
    ticket: v.string(),
    /** deposit, withdrawal, credit, bonus, correction, interest, charge. */
    kind: v.string(),
    amount: v.number(),
    comment: v.string(),
    /** Broker server time (ms), like the deals. */
    time: v.number(),
  })
    .index("by_ticket", ["account", "ticket"])
    .index("by_account_time", ["account", "time"]),

  /** Live terminal state of each account (EA v4.10 sync). */
  eaSessions: defineTable(eaSessionFields).index("by_account", ["account"]),

  /** Symbol specifications sent by the EA (lot calculator). */
  eaSymbols: defineTable(symbolSpecFields).index("by_account_symbol", [
    "account",
    "symbol",
  ]),

  /** Orders and position changes created in the panel, run by the EA. */
  eaCommands: defineTable(commandFields)
    .index("by_account_status", ["account", "status"])
    .index("by_account_created", ["account", "createdAt"]),

  /** FTMO Risk Guardian: latest state of each account (EA v4.20). */
  eaGuardian: defineTable({
    account: v.string(),
    updatedAt: v.number(),
    ...guardianStatusFields,
  }).index("by_account", ["account"]),

  /** FTMO Risk Guardian: one row per account per FTMO day (00:00 Prague). */
  eaGuardianDays: defineTable({
    account: v.string(),
    /** FTMO day, YYYY-MM-DD (Prague). */
    day: v.string(),
    dayStartBalance: v.number(),
    dailyLimit: v.number(),
    minEstEquity: v.number(),
    maxDailyUsePct: v.number(),
    maxMaxUsePct: v.number(),
    maxState: v.number(),
    emergencies: v.number(),
    blocks: v.number(),
    refused: v.number(),
    closed: v.number(),
    updatedAt: v.number(),
  }).index("by_account_day", ["account", "day"]),

  /** FTMO Risk Guardian events (blocks, refused orders, closes…). */
  eaGuardianEvents: defineTable({
    account: v.string(),
    receivedAt: v.number(),
    ...guardianEventFields,
  })
    .index("by_account_eid", ["account", "eid"])
    .index("by_account_time", ["account", "time"]),

  /** Latest statistics of each account (TradingJournal Complete EA). */
  jrnAccountStats: defineTable(accountStatsFields).index("by_account", [
    "account",
  ]),

  /** One snapshot per account per server day (the last of the day wins). */
  jrnStatsHistory: defineTable({
    account: v.string(),
    /** Server day, YYYY-MM-DD. */
    day: v.string(),
    /** Broker server time (ms). */
    time: v.number(),
    ...historyFields,
  }).index("by_account_day", ["account", "day"]),

  /** TradingView alert messages received by the webhook. */
  jrnSignals: defineTable({
    ticker: v.string(),
    action: v.string(),
    price: v.union(v.number(), v.null()),
    qty: v.union(v.number(), v.null()),
    position: v.string(),
    interval: v.string(),
    strategy: v.string(),
    message: v.string(),
    time: v.number(),
    receivedAt: v.number(),
  }).index("by_received", ["receivedAt"]),

  /** The trader's notes on a trade (key = account:position). */
  jrnNotes: defineTable({
    key: v.string(),
    setup: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    rating: v.optional(v.number()),
    notes: v.optional(v.string()),
    ...noteFields,
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /**
   * OHLC feed of the CasaBrasaOHLCExport EA (POST /ohlc/mt5, convex/ohlc.ts).
   * Latest state of each sending terminal (EA online/offline).
   */
  ohlcFeeds: defineTable({
    account: v.string(),
    server: v.string(),
    broker: v.string(),
    /** Broker clock − UTC (s). */
    offsetSec: v.number(),
    seq: v.number(),
    /** EA clock of the last envelope (UTC ms). */
    sentMs: v.number(),
    receivedAt: v.number(),
    symbols: v.array(
      v.object({
        symbol: v.string(),
        digits: v.number(),
        chart: v.union(v.literal("bid"), v.literal("last")),
      })
    ),
  }).index("by_account", ["account"]),

  /** Forming candle of every timeframe of a symbol (rewritten on each tick). */
  ohlcLive: defineTable({
    account: v.string(),
    symbol: v.string(),
    digits: v.number(),
    chart: v.union(v.literal("bid"), v.literal("last")),
    /** The broker has no ticks before this time (on-demand requests). */
    ticksEndMs: v.optional(v.number()),
    updatedAt: v.number(),
    /**
     * [t, o, h, l, c, tick_volume, real_volume, spread] by timeframe, as of
     * `sampleM1` (the EA sends the timeframes above M1 once a minute; the
     * chart adds the live M1 from ohlcQuotes, like MT5 builds them).
     */
    bars: v.record(v.string(), v.array(v.number())),
    /** The M1 candle when `bars` was taken. */
    sampleM1: v.optional(v.array(v.number())),
  }).index("by_account_symbol", ["account", "symbol"]),

  /** Live price of a symbol: last bid/ask and forming M1 (every EA send). */
  ohlcQuotes: defineTable({
    account: v.string(),
    symbol: v.string(),
    digits: v.number(),
    bid: v.number(),
    ask: v.number(),
    /** Last tick time (UTC ms). */
    tickMs: v.number(),
    m1: v.optional(v.array(v.number())),
    /** Close of the previous D1 candle (daily change). */
    prevClose: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_account_symbol", ["account", "symbol"]),

  /** Each candle series: how many closed candles the table keeps. */
  ohlcSeries: defineTable({
    account: v.string(),
    symbol: v.string(),
    tf: v.string(),
    count: v.number(),
    oldest: v.number(),
    newest: v.number(),
    /** Start of the broker's history. */
    firstMs: v.optional(v.number()),
  })
    .index("by_series", ["account", "symbol", "tf"])
    .index("by_count", ["count"]),

  /** Recent closed candles (the newest OHLC_KEEP_BARS of each series). */
  ohlcBars: defineTable({
    account: v.string(),
    symbol: v.string(),
    tf: v.string(),
    time: v.number(),
    o: v.number(),
    h: v.number(),
    l: v.number(),
    c: v.number(),
    tv: v.number(),
    rv: v.number(),
    sp: v.number(),
  }).index("by_series_time", ["account", "symbol", "tf", "time"]),

  /** Recent ticks in 10-second blocks ([t, bid, ask, last, volume, flags]). */
  ohlcTicks: defineTable({
    account: v.string(),
    symbol: v.string(),
    /** Block start (UTC ms, multiple of 10 s). */
    time: v.number(),
    first: v.number(),
    last: v.number(),
    rows: v.array(v.array(v.number())),
  })
    .index("by_symbol_time", ["account", "symbol", "time"])
    .index("by_time", ["time"]),

  /** Deep history files (gzip in File Storage) and the ranges they cover. */
  ohlcArchive: defineTable({
    account: v.string(),
    kind: v.union(v.literal("bars"), v.literal("ticks")),
    symbol: v.string(),
    /** Timeframe of candle files; "" for ticks. */
    tf: v.string(),
    /** UTC month (candles) or day (ticks) start. */
    period: v.number(),
    file: v.optional(v.id("_storage")),
    count: v.number(),
    /** Covered ranges [from, to] (UTC ms, inclusive). */
    cover: v.array(v.array(v.number())),
    version: v.number(),
  }).index("by_key", ["account", "kind", "symbol", "tf", "period"]),

  /** History the chart asked the EA for (delivered in the webhook answer). */
  ohlcRequests: defineTable({
    account: v.string(),
    kind: v.union(v.literal("bars"), v.literal("ticks")),
    symbol: v.string(),
    tf: v.string(),
    fromMs: v.number(),
    toMs: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("taken"),
      v.literal("done"),
      v.literal("failed")
    ),
    createdAt: v.number(),
    /** Last sign of life (taken or a block received). */
    activeAt: v.number(),
    chunks: v.number(),
    error: v.optional(v.string()),
  })
    .index("by_account_status", ["account", "status"])
    .index("by_series", ["account", "kind", "symbol", "tf", "status"]),

  /** The home screen's wallpaper file (photo or video); at most one. */
  homeWallpapers: defineTable({
    storageId: v.id("_storage"),
    kind: v.union(v.literal("image"), v.literal("video")),
    createdAt: v.number(),
  }),
  /**
   * Wine Monitor (By The Glass dispensers) mirror, filled every 15 minutes
   * by services/wine-monitor-sync (read-only copy of the portal).
   * One state document per business: machines, bottle positions, wines.
   */
  wmState: defineTable({
    company: v.string(),
    takenAt: v.number(),
    syncedAt: v.number(),
    ms: v.number(),
    node: v.any(),
    dispensers: v.any(),
    positions: v.any(),
    wines: v.any(),
  }).index("by_company", ["company"]),

  /** Wine Monitor cards (prepaid credit / debit tab) of a business. */
  wmCards: defineTable({
    company: v.string(),
    updatedAt: v.number(),
    cards: v.any(),
  }).index("by_company", ["company"]),

  /** Every pour from the dispensers (history kept after the portal's 24 h). */
  wmSales: defineTable({
    company: v.string(),
    at: v.number(),
    cardId: v.optional(v.string()),
    clientId: v.optional(v.string()),
    dispenser: v.string(),
    wine: v.string(),
    sku: v.optional(v.string()),
    ml: v.number(),
    price: v.number(),
    discount: v.number(),
  }).index("by_company_at", ["company", "at"]),

  /** Card top-ups and balance resets. */
  wmCredits: defineTable({
    company: v.string(),
    record: v.string(),
    at: v.number(),
    cardId: v.optional(v.string()),
    clientId: v.optional(v.string()),
    source: v.optional(v.string()),
    oldValue: v.number(),
    newValue: v.number(),
    diff: v.number(),
  })
    .index("by_record", ["company", "record"])
    .index("by_company_at", ["company", "at"]),

  /** Bottle changes and residue adjustments on the dispensers. */
  wmChanges: defineTable({
    company: v.string(),
    key: v.string(),
    kind: v.union(v.literal("change"), v.literal("adjust")),
    at: v.number(),
    since: v.optional(v.number()),
    sku: v.optional(v.string()),
    wine: v.string(),
    dispenser: v.string(),
    position: v.number(),
    oldMl: v.number(),
    newMl: v.number(),
    cardId: v.optional(v.string()),
  })
    .index("by_key", ["company", "key"])
    .index("by_company_at", ["company", "at"]),
});
