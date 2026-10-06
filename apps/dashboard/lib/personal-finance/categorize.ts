import type { CategoryId, ParseResult, Txn } from "./types";

/** Spending categories, labels in Portuguese (dashboard and charts). */
export const CATEGORIES: Record<CategoryId, { label: string; color: string }> =
  {
    mercado: { label: "Mercado", color: "#c96442" },
    restaurantes: { label: "Restaurantes e bares", color: "#d4a27f" },
    transporte: { label: "Transporte", color: "#8a7560" },
    moradia: { label: "Casa e serviços", color: "#6b5a49" },
    lazer: { label: "Lazer", color: "#b5835a" },
    compras: { label: "Compras", color: "#a0522d" },
    servicos: { label: "Assinaturas e digitais", color: "#7d6b5d" },
    saques: { label: "Saques", color: "#5c4d3f" },
    cambio: { label: "Câmbio", color: "#9c8b7a" },
    transferencias: { label: "Transferências enviadas", color: "#4a3f35" },
    recebimentos: { label: "Recebimentos", color: "#3d7a5f" },
    taxas: { label: "Taxas", color: "#b03a2e" },
    poupanca: { label: "Cofrinhos / poupança", color: "#aaa092" },
    outros: { label: "Outros", color: "#c2b8ab" },
  };

const RULES: [RegExp, CategoryId][] = [
  [
    /(super ?store|supermerc|lidl|spar\b|mini ?market|\bmart\b|market|convenience|eurosaver|pick & go|ideal store|grocery|carrefour|aldi|tesco|pao de acucar|atacad|hortifruti)/i,
    "mercado",
  ],
  [
    /(wolt|ifood|uber ?eats|glovo|bar\b|pub\b|gelat|burger|restaur|cafe|caf[eé]|coffee|lounge|pizza|sushi|kitchen|grill|bistro|king|noma|marokk|dave'?s|bakery|padaria|lanchon)/i,
    "restaurantes",
  ],
  [
    /(transport|bolt|uber|taxi|cabify|99 ?app|ryanair|airline|airways|easyjet|wizz|tap air|latam|gol linhas|azul|moke|\bgo\b|metro|bus\b|train|fuel|posto|shell|petrol)/i,
    "transporte",
  ],
  [
    /(rent\b|aluguel|contractor|ac service|electric|water|internet|vodafone|melita|epic|energia|condom)/i,
    "moradia",
  ],
  [
    /(spa\b|resort|fun\b|tipsy|cinema|club|beach|museum|ticket|ingresso|park|parque)/i,
    "lazer",
  ],
  [
    /(kiabi|zara|h&m|primark|amazon|shein|aliexpress|shop|store\b|loja|mercado livre|decathlon)/i,
    "compras",
  ],
  [
    /(ftmo|netflix|spotify|apple|google|icloud|openai|anthropic|chatgpt|adobe|microsoft|youtube|prime video|disney)/i,
    "servicos",
  ],
];

const ATM = /cash withdrawal|saque/i;
const TRANSFER = /^(transfer|payment|pix|ted|doc)\b/i;
const INTERNAL =
  /(spare change|pocket withdrawal|to pocket|from pocket|savings|vault|cofrinho|caixinha|poupan)/i;

/** Category and whether the line is an internal move. */
export function categorize(
  t: ParseResult["txns"][number]
): Pick<Txn, "category" | "internal"> {
  if (t.account === "pocket" || INTERNAL.test(t.description)) {
    return { category: "poupanca", internal: true };
  }
  if (t.kind === "exchange") {
    return { category: "cambio", internal: false };
  }
  if (t.kind === "atm" || ATM.test(t.description)) {
    return { category: "saques", internal: false };
  }
  if (t.kind === "fee") {
    return { category: "taxas", internal: false };
  }
  if (t.amount > 0) {
    return { category: "recebimentos", internal: false };
  }
  for (const [re, cat] of RULES) {
    if (re.test(t.description)) {
      return { category: cat, internal: false };
    }
  }
  if (t.kind === "transfer" || TRANSFER.test(t.description)) {
    return { category: "transferencias", internal: false };
  }
  return { category: "outros", internal: false };
}

const SPACES = /\s+/g;

/** Stable id so the same statement imported twice doesn't duplicate. */
export function txnId(t: ParseResult["txns"][number]) {
  const key = `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase().replace(SPACES, " ")}|${t.balance ?? ""}|${t.account}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = (h * 33 + key.charCodeAt(i)) % 2_147_483_647;
  }
  return `${h.toString(36)}-${key.length}`;
}
