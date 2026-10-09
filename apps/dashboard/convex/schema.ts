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
    createdAt: v.number(),
    updatedAt: v.number(),
    deleted: v.boolean(),
  })
    .index("by_clientId", ["clientId"])
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

  stores: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
    device: v.string(),
  }).index("by_key", ["key"]),
});
