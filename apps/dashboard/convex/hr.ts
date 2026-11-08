import { ConvexError, v } from "convex/values";
import { DOC_KIND_IDS } from "../lib/hr/malta-documents";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { isPanel, requirePanel } from "./lib";

/**
 * Human resources (panel only): each POS user's HR file, origin (EU or
 * not) and documents for living and working legally in Malta. Personal
 * data: never exposed to POS devices.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 200;

const clean = (s: string | undefined, max = MAX_TEXT) => {
  const t = s?.trim().slice(0, max);
  return t ? t : undefined;
};

function day(s: string | undefined) {
  const t = clean(s, 10);
  if (t && !DAY.test(t)) {
    throw new ConvexError("Data inválida (use AAAA-MM-DD).");
  }
  return t;
}

async function userOf(ctx: QueryCtx, userId: Id<"posUsers">) {
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("Funcionário não encontrado.");
  }
  return user;
}

const profileOf = (ctx: QueryCtx, userId: Id<"posUsers">) =>
  ctx.db
    .query("hrProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

const docsOf = (ctx: QueryCtx, userId: Id<"posUsers">) =>
  ctx.db
    .query("hrDocuments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(200);

const person = (u: Doc<"posUsers">) => ({
  id: u._id,
  name: u.name,
  role: u.role,
  active: u.active,
  jobTitle: u.jobTitle,
  phone: u.phone,
  email: u.email,
  hourlyRate: u.hourlyRate,
  startDate: u.startDate,
  companies: u.companies ?? [],
});

/** Everyone with their origin and documents (null: panel locked). */
export const employees = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const users = await ctx.db.query("posUsers").take(500);
    return await Promise.all(
      users.map(async (u) => {
        const [profile, docs] = await Promise.all([
          profileOf(ctx, u._id),
          docsOf(ctx, u._id),
        ]);
        return {
          ...person(u),
          origin: profile?.origin ?? null,
          nationality: profile?.nationality,
          payType: profile?.payType ?? "hourly",
          docs: docs.map((d) => ({
            kind: d.kind,
            expiresAt: d.expiresAt,
            hasFile: Boolean(d.storageId),
            number: d.number,
          })),
        };
      })
    );
  },
});

/** One employee: HR file and documents with temporary file links. */
export const employee = query({
  args: { userId: v.id("posUsers") },
  handler: async (ctx, { userId }) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const user = await userOf(ctx, userId);
    const [profile, docs] = await Promise.all([
      profileOf(ctx, userId),
      docsOf(ctx, userId),
    ]);
    return {
      ...person(user),
      profile,
      docs: await Promise.all(
        docs.map(async (d) => ({
          id: d._id,
          kind: d.kind,
          label: d.label,
          number: d.number,
          expiresAt: d.expiresAt,
          fileName: d.fileName,
          mimeType: d.mimeType,
          note: d.note,
          updatedAt: d.updatedAt,
          url: d.storageId ? await ctx.storage.getUrl(d.storageId) : null,
        }))
      ),
    };
  },
});

export const saveProfile = mutation({
  args: {
    userId: v.id("posUsers"),
    origin: v.union(v.literal("eu"), v.literal("non-eu")),
    nationality: v.optional(v.string()),
    gender: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    address: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    passportNumber: v.optional(v.string()),
    tin: v.optional(v.string()),
    ssn: v.optional(v.string()),
    iban: v.optional(v.string()),
    payType: v.union(v.literal("hourly"), v.literal("monthly")),
    monthlySalary: v.optional(v.number()),
    hourlyRate: v.optional(v.number()),
    jobTitle: v.optional(v.string()),
    startDate: v.optional(v.string()),
    workplace: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    await userOf(ctx, a.userId);
    const money = (n: number | undefined) =>
      n === undefined || !Number.isFinite(n) || n < 0
        ? undefined
        : Math.round(n * 100) / 100;
    const fields = {
      origin: a.origin,
      nationality: clean(a.nationality, 60),
      gender: clean(a.gender, 20),
      birthDate: day(a.birthDate),
      address: clean(a.address),
      idNumber: clean(a.idNumber, 40),
      passportNumber: clean(a.passportNumber, 40),
      tin: clean(a.tin, 40),
      ssn: clean(a.ssn, 40),
      iban: clean(a.iban, 40)?.replace(/\s+/g, "").toUpperCase(),
      payType: a.payType,
      monthlySalary: money(a.monthlySalary),
      workplace: clean(a.workplace, 40),
      updatedAt: Date.now(),
    };
    const current = await profileOf(ctx, a.userId);
    if (current) {
      await ctx.db.replace(current._id, { userId: a.userId, ...fields });
    } else {
      await ctx.db.insert("hrProfiles", { userId: a.userId, ...fields });
    }
    // Job title, start date and hourly rate live on the POS user (rota, pay)
    await ctx.db.patch(a.userId, {
      jobTitle: clean(a.jobTitle, 60),
      startDate: day(a.startDate),
      hourlyRate: money(a.hourlyRate),
    });
  },
});

export const uploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

async function dropFile(ctx: MutationCtx, id: Id<"_storage"> | undefined) {
  if (id) {
    await ctx.storage.delete(id).catch(() => undefined);
  }
}

/** Adds or updates a document; a new file replaces the old one. */
export const saveDocument = mutation({
  args: {
    id: v.optional(v.id("hrDocuments")),
    userId: v.id("posUsers"),
    kind: v.string(),
    label: v.optional(v.string()),
    number: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    note: v.optional(v.string()),
    file: v.optional(
      v.object({
        storageId: v.id("_storage"),
        name: v.string(),
        mimeType: v.string(),
      })
    ),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    await userOf(ctx, a.userId);
    if (!DOC_KIND_IDS.includes(a.kind)) {
      throw new ConvexError("Tipo de documento inválido.");
    }
    const fields = {
      userId: a.userId,
      kind: a.kind,
      label: clean(a.label, 80),
      number: clean(a.number, 60),
      expiresAt: day(a.expiresAt),
      note: clean(a.note, 300),
      updatedAt: Date.now(),
    };
    const current = a.id ? await ctx.db.get(a.id) : null;
    if (current && current.userId !== a.userId) {
      throw new ConvexError("Documento de outra pessoa.");
    }
    const file = a.file
      ? {
          storageId: a.file.storageId,
          fileName: clean(a.file.name, 120),
          mimeType: clean(a.file.mimeType, 80),
        }
      : {
          storageId: current?.storageId,
          fileName: current?.fileName,
          mimeType: current?.mimeType,
        };
    if (current) {
      if (a.file) {
        await dropFile(ctx, current.storageId);
      }
      await ctx.db.replace(current._id, { ...fields, ...file });
      return current._id;
    }
    return await ctx.db.insert("hrDocuments", { ...fields, ...file });
  },
});

export const deleteDocument = mutation({
  args: { id: v.id("hrDocuments") },
  handler: async (ctx, { id }) => {
    await requirePanel(ctx);
    const doc = await ctx.db.get(id);
    if (!doc) {
      return;
    }
    await dropFile(ctx, doc.storageId);
    await ctx.db.delete(id);
  },
});
