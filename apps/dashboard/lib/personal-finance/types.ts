/** One statement line, normalized from any bank's CSV or PDF. */
export interface Txn {
  /** Stable id for de-duplicating re-imported statements. */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  /** Signed: negative = money out. Excludes the fee. */
  amount: number;
  /** Fee charged on top (positive). */
  fee: number;
  currency: string;
  /** Account balance after the line, when the statement has it. */
  balance: number | null;
  kind: TxnKind;
  /** Main account or savings pots ("Pockets"/"Savings"). */
  account: "main" | "pocket";
  pending: boolean;
  category: CategoryId;
  /** Moves between the person's own accounts (not income/spending). */
  internal: boolean;
  /** Name of the imported file the line came from. */
  source: string;
}

export type TxnKind =
  | "card"
  | "transfer"
  | "exchange"
  | "atm"
  | "topup"
  | "fee"
  | "other";

export type CategoryId =
  | "mercado"
  | "restaurantes"
  | "transporte"
  | "moradia"
  | "lazer"
  | "compras"
  | "servicos"
  | "saques"
  | "cambio"
  | "transferencias"
  | "recebimentos"
  | "taxas"
  | "poupanca"
  | "outros";

export interface ImportedFile {
  name: string;
  importedAt: number;
  count: number;
  format: "csv" | "pdf";
  bank: string;
}

export interface ParseResult {
  txns: Omit<Txn, "id" | "category" | "internal" | "source">[];
  bank: string;
  currency: string;
}
