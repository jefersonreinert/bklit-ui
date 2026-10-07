/** Point of sale: products, floor plan, orders and payment settings. */

export interface PosProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  /** Tile color in the register grid. */
  color: string;
  available: boolean;
}

export type TableShape = "round" | "square" | "rect";

export interface PosTable {
  id: string;
  name: string;
  /** Position and size in floor units (the floor is 1000 × 700). */
  x: number;
  y: number;
  w: number;
  h: number;
  shape: TableShape;
  seats: number;
  color: string;
}

export interface FloorArea {
  id: string;
  name: string;
  tables: PosTable[];
}

export interface OrderItem {
  id: string;
  productId: string | null;
  name: string;
  price: number;
  qty: number;
  /** Already sent to the kitchen. */
  sent: boolean;
}

export type PaymentMethod = "card" | "cash" | "link" | "other";

export interface Payment {
  method: PaymentMethod;
  amount: number;
  tip: number;
  /** Provider reference, e.g. the SumUp transaction code. */
  ref?: string;
  at: number;
}

export type OrderStatus = "open" | "paying" | "paid" | "void";

export interface PosOrder {
  id: string;
  number: number;
  tableId: string | null;
  name: string;
  items: OrderItem[];
  /** Percent applied on top of the items (0 = none). */
  taxRate: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  payment?: Payment;
}

export interface PosSettings {
  currency: string;
  /** Default tax percent offered by "Adicionar taxa". */
  taxRate: number;
  /** SumUp affiliate key (Payment Switch → Tap to Pay on the phone). */
  sumupAffiliateKey: string;
  /** Payment link with {amount} / {ref} placeholders (Revolut, Stripe, SumUp…). */
  paymentLink: string;
}

export interface PosData {
  products: PosProduct[];
  areas: FloorArea[];
  orders: PosOrder[];
  settings: PosSettings;
  nextOrderNumber: number;
}
