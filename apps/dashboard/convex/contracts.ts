import { ConvexError, v } from "convex/values";
import {
  buildContract,
  type ContractFields,
  contractText,
  sha256Hex,
} from "../lib/hr/contract";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { meta, newToken } from "./access";
import { isPanel, requirePanel } from "./lib";
import { hrSettings } from "./payroll";

/**
 * Contracts of employment with electronic signatures (simple electronic
 * signature, Electronic Commerce Act Cap. 426 / eIDAS). The text is frozen
 * with its SHA-256 on creation; the company signs in the panel, then the
 * employee signs through a secret link (/assinar/?t=…), and the signature
 * is recorded with its time, IP and browser.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE = 200_000;

const WORKPLACES: Record<string, string> = {
  "the-brew": "The Brew",
  "ribs-house": "Ribs House by The Brew",
  vinomad: "Vinomad",
  main: "Casa Brasa",
};

const today = () => new Date().toISOString().slice(0, 10);

function checkSignature(sig: string) {
  if (!PNG.test(sig) || sig.length > MAX_SIGNATURE) {
    throw new ConvexError("Assinatura inválida.");
  }
}

const summary = (c: Doc<"hrContracts">) => ({
  id: c._id,
  status: c.status,
  createdAt: c.createdAt,
  hash: c.hash,
  token: c.status === "void" ? null : c.token,
  fields: c.fields as ContractFields,
  employerSignature: c.employerSignature ?? null,
  employerSignedAt: c.employerSignedAt ?? null,
  sentAt: c.sentAt ?? null,
  employeeName: c.employeeName ?? null,
  employeeSignature: c.employeeSignature ?? null,
  employeeSignedAt: c.employeeSignedAt ?? null,
  employeeIp: c.employeeIp ?? null,
  employeeAgent: c.employeeAgent ?? null,
});

export const list = query({
  args: { userId: v.id("posUsers") },
  handler: async (ctx, { userId }) => {
    if (!(await isPanel(ctx))) {
      return null;
    }
    const rows = await ctx.db
      .query("hrContracts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(50);
    return rows.sort((a, b) => b.createdAt - a.createdAt).map(summary);
  },
});

export const create = mutation({
  args: {
    userId: v.id("posUsers"),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    probationMonths: v.number(),
    weeklyHours: v.number(),
  },
  handler: async (ctx, a) => {
    await requirePanel(ctx);
    const user = await ctx.db.get(a.userId);
    if (!user) {
      throw new ConvexError("Funcionário não encontrado.");
    }
    const profile = await ctx.db
      .query("hrProfiles")
      .withIndex("by_user", (q) => q.eq("userId", a.userId))
      .unique();
    if (!profile) {
      throw new ConvexError("Preencha e salve a ficha de RH primeiro.");
    }
    if (!DAY.test(a.startDate) || (a.endDate && !DAY.test(a.endDate))) {
      throw new ConvexError("Data inválida.");
    }
    if (a.endDate && a.endDate <= a.startDate) {
      throw new ConvexError("O término deve ser depois do início.");
    }
    const s = await hrSettings(ctx);
    const place = profile.workplace ?? "the-brew";
    const placeMeta = await meta(ctx, place);
    const receipt = (placeMeta?.receipt ?? {}) as { address?: string };
    const useId = profile.origin === "eu" && profile.idNumber;
    const fields: ContractFields = {
      employer: {
        name: s.employerName,
        regNo: s.regNo,
        address: s.employerAddress,
        signatory: s.signatory,
        signatoryTitle: s.signatoryTitle,
      },
      employee: {
        name: user.name,
        idLabel: useId ? "identity card" : "passport",
        idNumber: (useId ? profile.idNumber : profile.passportNumber) ?? "",
        address: profile.address ?? "",
        nationality: profile.nationality ?? "",
      },
      origin: profile.origin,
      jobTitle: user.jobTitle ?? "",
      workplace: {
        name: WORKPLACES[place] ?? place,
        address: receipt.address ?? "",
      },
      date: today(),
      startDate: a.startDate,
      endDate: a.endDate || undefined,
      probationMonths: Math.max(0, Math.min(12, Math.round(a.probationMonths))),
      weeklyHours: Math.max(1, Math.min(60, a.weeklyHours)),
      payType: profile.payType,
      monthlySalary: profile.monthlySalary,
      hourlyRate: user.hourlyRate,
      overtime: s.overtime,
    };
    const text = contractText(buildContract(fields));
    return await ctx.db.insert("hrContracts", {
      userId: a.userId,
      status: "draft",
      fields,
      text,
      hash: await sha256Hex(text),
      token: newToken(),
      createdAt: Date.now(),
    });
  },
});

export const signAsEmployer = mutation({
  args: { id: v.id("hrContracts"), signature: v.string() },
  handler: async (ctx, { id, signature }) => {
    await requirePanel(ctx);
    checkSignature(signature);
    const c = await ctx.db.get(id);
    if (!c || c.status !== "draft") {
      throw new ConvexError("Só um rascunho pode ser assinado pela empresa.");
    }
    await ctx.db.patch(id, {
      employerSignature: signature,
      employerSignedAt: Date.now(),
    });
  },
});

export const send = mutation({
  args: { id: v.id("hrContracts") },
  handler: async (ctx, { id }) => {
    await requirePanel(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.status !== "draft") {
      throw new ConvexError("Este contrato não está em rascunho.");
    }
    if (!c.employerSignature) {
      throw new ConvexError("A empresa assina antes de enviar.");
    }
    await ctx.db.patch(id, { status: "sent", sentAt: Date.now() });
  },
});

export const cancel = mutation({
  args: { id: v.id("hrContracts") },
  handler: async (ctx, { id }) => {
    await requirePanel(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.status === "signed") {
      throw new ConvexError("Contrato assinado não pode ser cancelado.");
    }
    await ctx.db.patch(id, { status: "void", voidedAt: Date.now() });
  },
});

/* -------------------------- the employee's link --------------------------- */

const TOKEN = /^[0-9a-f]{48}$/;

/** What the signing page shows (public: the token is the secret). */
export const forSigning = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!TOKEN.test(token)) {
      return null;
    }
    const c = await ctx.db
      .query("hrContracts")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!c || c.status === "draft" || c.status === "void") {
      return null;
    }
    return summary(c);
  },
});

/** Records the employee's signature (called by POST /hr/sign). */
export const signByToken = internalMutation({
  args: {
    token: v.string(),
    name: v.string(),
    signature: v.string(),
    ip: v.string(),
    agent: v.string(),
  },
  handler: async (ctx, a) => {
    if (!TOKEN.test(a.token)) {
      throw new ConvexError("Link inválido.");
    }
    const c = await ctx.db
      .query("hrContracts")
      .withIndex("by_token", (q) => q.eq("token", a.token))
      .unique();
    if (!c || c.status !== "sent") {
      throw new ConvexError(
        c?.status === "signed"
          ? "Este contrato já foi assinado."
          : "Este link não está ativo."
      );
    }
    const name = a.name.trim().slice(0, 120);
    if (name.length < 3) {
      throw new ConvexError("Escreva o seu nome completo.");
    }
    checkSignature(a.signature);
    await ctx.db.patch(c._id, {
      status: "signed",
      employeeName: name,
      employeeSignature: a.signature,
      employeeSignedAt: Date.now(),
      employeeIp: a.ip.slice(0, 64),
      employeeAgent: a.agent.slice(0, 300),
    });
  },
});
