/** Point of sale: products, floor plan, orders and payment settings. */

export interface PosProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  /** Tile color in the register grid. */
  color: string;
  available: boolean;
  /** Unit cost (purchase price), for margin and profit. */
  cost?: number;
  sku?: string;
  barcode?: string;
  /** Sale unit shown on stock (un, kg, L, garrafa…). */
  unit?: string;
  /** Count stock for this product (decrements on each sale). */
  trackStock?: boolean;
  stock?: number;
  /** Alert when stock falls to this level. */
  minStock?: number;
  description?: string;
  /** Option groups ("steps"): ice, lemon, doneness… */
  modifiers?: ModifierGroup[];
}

export interface ModifierOption {
  id: string;
  name: string;
  /** Added to the unit price (0 = free). */
  price: number;
  active: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  /** Must pick one before adding. */
  required: boolean;
  /** Several options can be picked. */
  multiple: boolean;
  active: boolean;
  options: ModifierOption[];
}

export interface ItemMod {
  group: string;
  name: string;
  price: number;
}

export type StockMoveKind = "sale" | "purchase" | "adjust" | "waste";

export interface StockMove {
  id: string;
  productId: string;
  /** Positive adds, negative removes. */
  qty: number;
  kind: StockMoveKind;
  /** Unit cost of a purchase. */
  unitCost?: number;
  note?: string;
  orderId?: string;
  at: number;
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
  /** Unit cost when added, for profit reports. */
  cost?: number;
  /** Chosen options (already included in price). */
  mods?: ItemMod[];
  /** Free text for the kitchen ("sem tomate"). */
  note?: string;
  /** Already sent to the kitchen. */
  sent: boolean;
}

export type PaymentMethod = "card" | "qr" | "cash" | "link" | "other";

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
  /** Lock every device after these idle minutes (0 = never). */
  autoLockMin?: number;
}

export type ReceiptTemplate = "modern" | "classic" | "compact";
export type PaperSize = "58" | "80" | "a4";
export type Align = "left" | "center" | "right";

export interface ReceiptSettings {
  businessName: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** Data URL (PNG/JPEG), "" for none. */
  logo: string;
  logoAlign: Align;
  /** Logo width as a percent of the paper width (10–100). */
  logoWidth: number;
  /** Space above the logo in mm (move it down). */
  logoOffset: number;
  template: ReceiptTemplate;
  paper: PaperSize;
  accent: string;
  headerNote: string;
  footer: string;
  /** Legal line, e.g. "Este documento não serve de fatura". */
  legalNote: string;
  showTaxId: boolean;
  showTable: boolean;
  showPayment: boolean;
  /** QR with the business site or review link at the bottom. */
  qrUrl: string;
}

export type PrinterKind = "epos" | "share";

export interface PrinterConfig {
  id: string;
  name: string;
  /** epos: Epson Wi-Fi/LAN (ePOS-Print); share: PDF to the Epson app or AirPrint. */
  kind: PrinterKind;
  host: string;
  /** The printer's ePOS device id (local_printer by default). */
  deviceId: string;
  paper: "58" | "80";
  autoPrint: boolean;
  copies: number;
  /** Open the cash drawer after printing a cash payment. */
  drawer: boolean;
  /** Prints customer receipts/invoices (default true). */
  receipts?: boolean;
  /** Prints kitchen/bar tickets when items are sent. */
  kitchen?: boolean;
  /** Only these product categories go to this printer's tickets (empty = all). */
  categories?: string[];
}

export interface PosData {
  products: PosProduct[];
  areas: FloorArea[];
  orders: PosOrder[];
  settings: PosSettings;
  nextOrderNumber: number;
  stockMoves: StockMove[];
  receipt: ReceiptSettings;
  printers: PrinterConfig[];
}
