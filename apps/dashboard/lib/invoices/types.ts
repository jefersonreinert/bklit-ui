/**
 * Supplier invoices (notas fiscais de entrada) for a group of companies
 * and locations. Each invoice line points to a canonical ingredient, so
 * the same product bought by different companies, from different
 * suppliers and under different names can be compared by unit price.
 */

/** What Claude returns for one invoice (lib/server/extract.ts). */
export interface ExtractedInvoice {
  supplier: { name: string; taxId: string; address: string };
  buyer: { name: string; taxId: string; address: string };
  number: string;
  date: string;
  dueDate: string;
  currency: string;
  subtotal: number | null;
  vatTotal: number | null;
  total: number | null;
  lines: {
    description: string;
    code: string;
    ean: string;
    quantity: number | null;
    unit: string;
    packSize: number | null;
    packUnit: string;
    unitPrice: number | null;
    vatRate: number | null;
    lineTotal: number | null;
    category: string;
    genericName: string;
  }[];
}

export type BaseUnit = "kg" | "l" | "un";

export interface Company {
  id: string;
  name: string;
  taxId: string;
  locations: { id: string; name: string }[];
}

export interface Supplier {
  id: string;
  name: string;
  taxId: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  /** Unit prices are compared per kg, litre or unit. */
  baseUnit: BaseUnit;
  /** Other names seen on invoices (normalized), learned when linking. */
  aliases: string[];
  eans: string[];
  /** Linked wine of the cellar, when the ingredient is a wine. */
  wineId?: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  code: string;
  ean: string;
  quantity: number;
  unit: string;
  /** Content of one invoiced unit in the base unit (5 for a 5 L can). */
  packSize: number;
  baseUnit: BaseUnit;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  category: string;
  genericName: string;
  ingredientId: string | null;
  /** How the link was made, to show which ones need a look. */
  match: "ean" | "alias" | "similar" | "manual" | "new" | null;
  score: number;
}

export interface Invoice {
  id: string;
  companyId: string;
  locationId: string;
  supplierId: string;
  number: string;
  date: string;
  dueDate: string;
  currency: string;
  subtotal: number;
  vatTotal: number;
  total: number;
  lines: InvoiceLine[];
  fileName: string;
  status: "review" | "approved";
  createdAt: number;
}

export interface InvoiceData {
  companies: Company[];
  suppliers: Supplier[];
  ingredients: Ingredient[];
  invoices: Invoice[];
}

export const EMPTY_INVOICES: InvoiceData = {
  companies: [],
  suppliers: [],
  ingredients: [],
  invoices: [],
};

export const INGREDIENT_CATEGORIES = [
  { value: "produce", label: "Hortifrúti" },
  { value: "meat", label: "Carnes" },
  { value: "fish", label: "Peixes e frutos do mar" },
  { value: "dairy", label: "Laticínios" },
  { value: "dry goods", label: "Mercearia" },
  { value: "bakery", label: "Padaria" },
  { value: "beverages", label: "Bebidas" },
  { value: "wine", label: "Vinhos" },
  { value: "spirits", label: "Destilados" },
  { value: "beer", label: "Cervejas" },
  { value: "cleaning", label: "Limpeza" },
  { value: "packaging", label: "Embalagens" },
  { value: "other", label: "Outros" },
] as const;

export const categoryLabel = (c: string) =>
  INGREDIENT_CATEGORIES.find((x) => x.value === c)?.label ?? c;
