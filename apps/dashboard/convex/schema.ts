import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    updatedAt: v.number(),
  }).index("by_cid", ["cid"]),

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
  })
    .index("by_cid", ["cid"])
    .index("by_status_closed", ["status", "closedAt"]),

  /** Settings, floor plan and receipt design (one document, key "main"). */
  posMeta: defineTable({
    key: v.string(),
    areas: v.any(),
    settings: v.any(),
    receipt: v.any(),
    /** Printers and their routing, shared by every device. */
    printers: v.optional(v.any()),
    nextOrderNumber: v.number(),
    failedLogins: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
  }).index("by_key", ["key"]),

  posStock: defineTable({
    productCid: v.string(),
    qty: v.number(),
    kind: v.union(
      v.literal("sale"),
      v.literal("purchase"),
      v.literal("adjust"),
      v.literal("waste")
    ),
    unitCost: v.optional(v.number()),
    note: v.optional(v.string()),
    orderCid: v.optional(v.string()),
    userName: v.optional(v.string()),
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
  }).index("by_day", ["day"]),

  posUsers: defineTable({
    name: v.string(),
    role: v.string(),
    perms: v.array(v.string()),
    color: v.string(),
    /** SHA-256 of the PIN with a server secret; the PIN is never stored. */
    pinKey: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_pinKey", ["pinKey"]),

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

  posAudit: defineTable({
    userName: v.string(),
    action: v.string(),
    detail: v.string(),
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
});
