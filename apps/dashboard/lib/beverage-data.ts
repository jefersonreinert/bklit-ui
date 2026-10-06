import type { IconName } from "@bklitui/icons";

/**
 * Beverage program for the Bebidas page: wine list, spirits, beers,
 * cocktails (recipes linked to spirits) and non-alcoholic drinks, plus the
 * shared inventory model. Deterministic mock data.
 */

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export type BeverageKind =
  | "vinho"
  | "destilado"
  | "cerveja"
  | "coquetel"
  | "sem-alcool";

export const kindLabel: Record<BeverageKind, string> = {
  vinho: "Vinhos",
  destilado: "Destilados",
  cerveja: "Cervejas",
  coquetel: "Coquetéis",
  "sem-alcool": "Sem álcool",
};

export const kindIcon: Record<BeverageKind, IconName> = {
  vinho: "IconGlass",
  destilado: "IconBottle",
  cerveja: "IconBeer",
  coquetel: "IconCocktail",
  "sem-alcool": "IconGlassWater",
};

/** Campos de estoque comuns a tudo que é contado no inventário. */
export interface Stocked {
  /** Unidades em estoque (garrafas, latas, barris). */
  stock: number;
  /** Estoque ideal (par level). */
  par: number;
  /** Ponto de reposição. */
  min: number;
  location: string;
  supplier: string;
  /** Vendas no mês (unidades de venda: taça/garrafa/dose/unidade). */
  sales: number;
}

export type WineStyle = "Tinto" | "Branco" | "Rosé" | "Espumante" | "Sobremesa";

export interface Wine extends Stocked {
  id: string;
  kind: "vinho";
  name: string;
  producer: string;
  country: string;
  region: string;
  grapes: string[];
  vintage: number | null;
  style: WineStyle;
  abv: number;
  volumeMl: number;
  body: "Leve" | "Médio" | "Encorpado";
  sweetness: "Seco" | "Meio seco" | "Doce";
  tastingNotes: string;
  pairing: string[];
  serviceTemp: string;
  decant: string | null;
  score: number | null;
  bottleCost: number;
  bottlePrice: number;
  /** Preço da taça (150 ml); null = só garrafa. */
  glassPrice: number | null;
  glassesSold: number;
  available: boolean;
}

export type SpiritCategory =
  | "Gin"
  | "Vodka"
  | "Whisky"
  | "Rum"
  | "Cachaça"
  | "Tequila"
  | "Licor"
  | "Vermute"
  | "Bitter";

export interface Spirit extends Stocked {
  id: string;
  kind: "destilado";
  name: string;
  brand: string;
  category: SpiritCategory;
  origin: string;
  abv: number;
  volumeMl: number;
  age: string | null;
  tastingNotes: string;
  bottleCost: number;
  /** Dose padrão servida pura (ml). */
  doseMl: number;
  dosePrice: number;
  /** Nível da garrafa aberta (0–100%). */
  openLevel: number;
  available: boolean;
}

export type BeerFormat = "Chope" | "Garrafa" | "Lata";

export interface Beer extends Stocked {
  id: string;
  kind: "cerveja";
  name: string;
  brewery: string;
  style: string;
  origin: string;
  abv: number;
  ibu: number;
  format: BeerFormat;
  /** Volume servido (ml). Para chope, o barril tem `kegLiters`. */
  serveMl: number;
  kegLiters: number | null;
  /** Custo por unidade em estoque (garrafa/lata/barril). */
  unitCost: number;
  price: number;
  serviceTemp: string;
  tastingNotes: string;
  available: boolean;
}

export interface CocktailIngredient {
  /** Liga ao destilado do estoque (custo por ml calculado). */
  spiritId?: string;
  name: string;
  ml?: number;
  /** Custo fixo (frutas, xaropes, guarnição) quando não é destilado. */
  cost?: number;
}

export interface Cocktail {
  id: string;
  kind: "coquetel";
  name: string;
  family: "Clássico" | "Autoral" | "Tiki" | "Sem álcool";
  method: "Batido" | "Mexido" | "Montado" | "Macerado";
  glass: string;
  garnish: string;
  ice: string;
  prepMinutes: number;
  ingredients: CocktailIngredient[];
  price: number;
  sales: number;
  description: string;
  available: boolean;
}

export interface SoftDrink extends Stocked {
  id: string;
  kind: "sem-alcool";
  name: string;
  category: "Água" | "Refrigerante" | "Suco" | "Café" | "Chá" | "Kombucha";
  volumeMl: number;
  unitCost: number;
  price: number;
  available: boolean;
}

/* -------------------------------------------------------------------------- */
/* Vinhos                                                                     */
/* -------------------------------------------------------------------------- */

const W = (
  id: string,
  name: string,
  producer: string,
  country: string,
  region: string,
  grapes: string[],
  vintage: number | null,
  style: WineStyle,
  abv: number,
  body: Wine["body"],
  sweetness: Wine["sweetness"],
  tastingNotes: string,
  pairing: string[],
  serviceTemp: string,
  decant: string | null,
  score: number | null,
  bottleCost: number,
  bottlePrice: number,
  glassPrice: number | null,
  stock: number,
  par: number,
  min: number,
  location: string,
  supplier: string,
  sales: number,
  glassesSold: number
): Wine => ({
  id,
  kind: "vinho",
  name,
  producer,
  country,
  region,
  grapes,
  vintage,
  style,
  abv,
  volumeMl: 750,
  body,
  sweetness,
  tastingNotes,
  pairing,
  serviceTemp,
  decant,
  score,
  bottleCost,
  bottlePrice,
  glassPrice,
  stock,
  par,
  min,
  location,
  supplier,
  sales,
  glassesSold,
  available: stock > 0,
});

export const wines: Wine[] = [
  W(
    "V01",
    "Catena Malbec",
    "Bodega Catena Zapata",
    "Argentina",
    "Mendoza",
    ["Malbec"],
    2021,
    "Tinto",
    13.5,
    "Encorpado",
    "Seco",
    "Ameixa madura, violeta, baunilha e taninos aveludados.",
    ["Picanha", "Costela", "Queijos curados"],
    "16–18 °C",
    "30 min",
    91,
    98,
    289,
    65,
    26,
    36,
    12,
    "Adega A1",
    "Importadora Andes",
    48,
    210
  ),
  W(
    "V02",
    "Casillero del Diablo Cabernet",
    "Concha y Toro",
    "Chile",
    "Vale Central",
    ["Cabernet Sauvignon"],
    2022,
    "Tinto",
    13.5,
    "Médio",
    "Seco",
    "Cassis, pimentão assado e cedro.",
    ["Filé à parmegiana", "Massas ao sugo"],
    "16–18 °C",
    null,
    87,
    52,
    159,
    34,
    34,
    30,
    10,
    "Adega A2",
    "Importadora Andes",
    64,
    240
  ),
  W(
    "V03",
    "Quinta do Crasto Douro",
    "Quinta do Crasto",
    "Portugal",
    "Douro",
    ["Touriga Nacional", "Tinta Roriz", "Touriga Franca"],
    2020,
    "Tinto",
    14,
    "Encorpado",
    "Seco",
    "Frutas negras, esteva e especiarias doces.",
    ["Bacalhau", "Cordeiro"],
    "16–18 °C",
    "45 min",
    92,
    135,
    389,
    null,
    9,
    12,
    4,
    "Adega B1",
    "Vinhos de Portugal Ltda.",
    14,
    0
  ),
  W(
    "V04",
    "Miolo Lote 43",
    "Miolo Wine Group",
    "Brasil",
    "Vale dos Vinhedos",
    ["Cabernet Sauvignon", "Merlot"],
    2019,
    "Tinto",
    13.5,
    "Encorpado",
    "Seco",
    "Cereja negra, tabaco e chocolate amargo.",
    ["Picanha", "Feijoada"],
    "16–18 °C",
    "30 min",
    90,
    118,
    339,
    null,
    7,
    10,
    3,
    "Adega B2",
    "Miolo",
    11,
    0
  ),
  W(
    "V05",
    "Barolo Serralunga",
    "Fontanafredda",
    "Itália",
    "Piemonte",
    ["Nebbiolo"],
    2018,
    "Tinto",
    14,
    "Encorpado",
    "Seco",
    "Rosa seca, alcatrão, cereja e taninos firmes.",
    ["Risoto de cogumelos", "Carnes de caça"],
    "17–18 °C",
    "1 h",
    93,
    260,
    690,
    null,
    4,
    6,
    2,
    "Adega reserva",
    "Mistral",
    4,
    0
  ),
  W(
    "V06",
    "Cloudy Bay Sauvignon Blanc",
    "Cloudy Bay",
    "Nova Zelândia",
    "Marlborough",
    ["Sauvignon Blanc"],
    2023,
    "Branco",
    13,
    "Leve",
    "Seco",
    "Maracujá, lima, capim-limão e acidez vibrante.",
    ["Ceviche", "Salada de burrata"],
    "8–10 °C",
    null,
    91,
    145,
    398,
    null,
    11,
    12,
    4,
    "Climatizada C1",
    "Mistral",
    18,
    0
  ),
  W(
    "V07",
    "Alvarinho Soalheiro",
    "Soalheiro",
    "Portugal",
    "Vinho Verde",
    ["Alvarinho"],
    2023,
    "Branco",
    12.5,
    "Leve",
    "Seco",
    "Pêssego branco, flor de laranjeira e mineralidade.",
    ["Moqueca", "Frutos do mar"],
    "8–10 °C",
    null,
    90,
    89,
    249,
    58,
    19,
    18,
    6,
    "Climatizada C1",
    "Vinhos de Portugal Ltda.",
    26,
    180
  ),
  W(
    "V08",
    "Chardonnay Reserva",
    "Casa Valduga",
    "Brasil",
    "Serra Gaúcha",
    ["Chardonnay"],
    2022,
    "Branco",
    13,
    "Médio",
    "Seco",
    "Abacaxi, manteiga e baunilha da barrica.",
    ["Risoto de camarão", "Salmão"],
    "10–12 °C",
    null,
    88,
    62,
    179,
    39,
    14,
    15,
    5,
    "Climatizada C2",
    "Valduga",
    22,
    132
  ),
  W(
    "V09",
    "Whispering Angel",
    "Château d'Esclans",
    "França",
    "Provence",
    ["Grenache", "Cinsault", "Rolle"],
    2023,
    "Rosé",
    13,
    "Leve",
    "Seco",
    "Morango fresco, pêssego e final salino.",
    ["Entradas", "Burrata"],
    "8–10 °C",
    null,
    90,
    165,
    449,
    null,
    6,
    10,
    3,
    "Climatizada C2",
    "Mistral",
    12,
    0
  ),
  W(
    "V10",
    "Cave Geisse Brut",
    "Cave Geisse",
    "Brasil",
    "Pinto Bandeira",
    ["Chardonnay", "Pinot Noir"],
    null,
    "Espumante",
    12,
    "Médio",
    "Seco",
    "Brioche, maçã verde e perlage fina.",
    ["Bolinho de bacalhau", "Celebrações"],
    "6–8 °C",
    null,
    92,
    98,
    279,
    62,
    22,
    20,
    8,
    "Climatizada C3",
    "Geisse",
    31,
    260
  ),
  W(
    "V11",
    "Moët & Chandon Impérial",
    "Moët & Chandon",
    "França",
    "Champagne",
    ["Pinot Noir", "Chardonnay", "Pinot Meunier"],
    null,
    "Espumante",
    12,
    "Médio",
    "Seco",
    "Pera, brioche e notas cítricas.",
    ["Ostras", "Celebrações"],
    "6–8 °C",
    null,
    90,
    340,
    890,
    null,
    3,
    6,
    2,
    "Climatizada C3",
    "Moët Hennessy BR",
    9,
    0
  ),
  W(
    "V12",
    "Porto Tawny 10 anos",
    "Taylor's",
    "Portugal",
    "Porto",
    ["Touriga Nacional", "Tinta Barroca"],
    null,
    "Sobremesa",
    20,
    "Encorpado",
    "Doce",
    "Figo seco, nozes, caramelo e laranja cristalizada.",
    ["Petit gâteau", "Queijos azuis"],
    "14–16 °C",
    null,
    92,
    160,
    459,
    95,
    8,
    6,
    2,
    "Adega B3",
    "Vinhos de Portugal Ltda.",
    6,
    74
  ),
];

/* -------------------------------------------------------------------------- */
/* Destilados                                                                 */
/* -------------------------------------------------------------------------- */

const S = (
  id: string,
  name: string,
  brand: string,
  category: SpiritCategory,
  origin: string,
  abv: number,
  volumeMl: number,
  age: string | null,
  tastingNotes: string,
  bottleCost: number,
  doseMl: number,
  dosePrice: number,
  stock: number,
  par: number,
  min: number,
  openLevel: number,
  supplier: string,
  sales: number
): Spirit => ({
  id,
  kind: "destilado",
  name,
  brand,
  category,
  origin,
  abv,
  volumeMl,
  age,
  tastingNotes,
  bottleCost,
  doseMl,
  dosePrice,
  stock,
  par,
  min,
  openLevel,
  location: "Bar · back bar",
  supplier,
  sales,
  available: stock > 0 || openLevel > 0,
});

export const spirits: Spirit[] = [
  S(
    "D01",
    "Tanqueray London Dry",
    "Tanqueray",
    "Gin",
    "Escócia",
    43.1,
    750,
    null,
    "Zimbro marcante, coentro e cítricos secos.",
    115,
    50,
    38,
    9,
    8,
    3,
    60,
    "Diageo BR",
    186
  ),
  S(
    "D02",
    "Hendrick's",
    "Hendrick's",
    "Gin",
    "Escócia",
    41.4,
    750,
    null,
    "Pepino, rosa e zimbro suave.",
    185,
    50,
    56,
    4,
    6,
    2,
    35,
    "William Grant",
    74
  ),
  S(
    "D03",
    "Ketel One",
    "Ketel One",
    "Vodka",
    "Holanda",
    40,
    1000,
    null,
    "Limpa, cítrica e final macio.",
    98,
    50,
    28,
    6,
    6,
    2,
    80,
    "Diageo BR",
    92
  ),
  S(
    "D04",
    "Johnnie Walker Black Label",
    "Johnnie Walker",
    "Whisky",
    "Escócia",
    40,
    1000,
    "12 anos",
    "Turfa leve, frutas secas e baunilha.",
    165,
    50,
    42,
    7,
    6,
    2,
    45,
    "Diageo BR",
    128
  ),
  S(
    "D05",
    "Macallan 12 Double Cask",
    "The Macallan",
    "Whisky",
    "Escócia · Speyside",
    40,
    700,
    "12 anos",
    "Mel, xerez, gengibre e carvalho.",
    520,
    50,
    150,
    2,
    3,
    1,
    70,
    "Edrington",
    36
  ),
  S(
    "D06",
    "Bulleit Bourbon",
    "Bulleit",
    "Whisky",
    "EUA · Kentucky",
    45,
    750,
    null,
    "Centeio picante, caramelo e noz-moscada.",
    135,
    50,
    45,
    5,
    5,
    2,
    25,
    "Diageo BR",
    84
  ),
  S(
    "D07",
    "Bacardi Carta Blanca",
    "Bacardi",
    "Rum",
    "Porto Rico",
    37.5,
    980,
    null,
    "Leve, notas de baunilha e amêndoa.",
    52,
    50,
    22,
    10,
    8,
    3,
    50,
    "Bacardi BR",
    140
  ),
  S(
    "D08",
    "Havana Club 7 Años",
    "Havana Club",
    "Rum",
    "Cuba",
    40,
    700,
    "7 anos",
    "Cacau, tabaco e canela.",
    128,
    50,
    42,
    3,
    4,
    2,
    55,
    "Pernod Ricard",
    46
  ),
  S(
    "D09",
    "Cachaça Weber Haus Prata",
    "Weber Haus",
    "Cachaça",
    "Brasil · RS",
    38,
    700,
    null,
    "Cana fresca, herbal e mineral.",
    58,
    50,
    20,
    14,
    12,
    4,
    40,
    "Weber Haus",
    420
  ),
  S(
    "D10",
    "Cachaça Anísio Santiago",
    "Havana (Salinas)",
    "Cachaça",
    "Brasil · MG",
    47,
    600,
    "Bálsamo, 8 anos",
    "Especiarias, mel e madeira de bálsamo.",
    390,
    30,
    85,
    2,
    2,
    1,
    75,
    "Alambique Minas",
    22
  ),
  S(
    "D11",
    "Don Julio Blanco",
    "Don Julio",
    "Tequila",
    "México · Jalisco",
    38,
    750,
    null,
    "Agave cozido, cítricos e pimenta-branca.",
    245,
    50,
    72,
    3,
    4,
    2,
    30,
    "Diageo BR",
    58
  ),
  S(
    "D12",
    "Cointreau",
    "Cointreau",
    "Licor",
    "França",
    40,
    700,
    null,
    "Casca de laranja doce e amarga.",
    135,
    25,
    24,
    4,
    4,
    2,
    65,
    "Rémy Cointreau",
    64
  ),
  S(
    "D13",
    "Campari",
    "Campari",
    "Bitter",
    "Itália",
    25,
    900,
    null,
    "Amargo de laranja, ervas e ruibarbo.",
    62,
    30,
    18,
    6,
    6,
    2,
    50,
    "Campari BR",
    152
  ),
  S(
    "D14",
    "Martini Rosso",
    "Martini",
    "Vermute",
    "Itália",
    15,
    995,
    null,
    "Ervas, baunilha e caramelo.",
    38,
    50,
    16,
    5,
    6,
    2,
    45,
    "Bacardi BR",
    140
  ),
  S(
    "D15",
    "Aperol",
    "Aperol",
    "Bitter",
    "Itália",
    11,
    750,
    null,
    "Laranja doce, ruibarbo e genciana.",
    58,
    60,
    22,
    1,
    6,
    3,
    20,
    "Campari BR",
    210
  ),
];

/* -------------------------------------------------------------------------- */
/* Cervejas                                                                   */
/* -------------------------------------------------------------------------- */

export const beers: Beer[] = [
  {
    id: "C01",
    kind: "cerveja",
    name: "Pilsen da casa",
    brewery: "Cervejaria Brasa (contrato)",
    style: "German Pilsner",
    origin: "Brasil",
    abv: 4.8,
    ibu: 28,
    format: "Chope",
    serveMl: 400,
    kegLiters: 30,
    unitCost: 390,
    price: 22,
    serviceTemp: "2–4 °C",
    tastingNotes: "Malte de pão, lúpulo herbal e final seco.",
    stock: 6,
    par: 8,
    min: 3,
    location: "Câmara fria",
    supplier: "Cervejaria Brasa",
    sales: 880,
    available: true,
  },
  {
    id: "C02",
    kind: "cerveja",
    name: "IPA Tropical",
    brewery: "Cervejaria Dogma",
    style: "American IPA",
    origin: "Brasil",
    abv: 6.5,
    ibu: 60,
    format: "Chope",
    serveMl: 400,
    kegLiters: 30,
    unitCost: 720,
    price: 36,
    serviceTemp: "6–8 °C",
    tastingNotes: "Manga, maracujá e amargor resinoso.",
    stock: 2,
    par: 4,
    min: 2,
    location: "Câmara fria",
    supplier: "Dogma",
    sales: 310,
    available: true,
  },
  {
    id: "C03",
    kind: "cerveja",
    name: "Heineken",
    brewery: "Heineken",
    style: "Premium Lager",
    origin: "Holanda",
    abv: 5,
    ibu: 19,
    format: "Garrafa",
    serveMl: 600,
    kegLiters: null,
    unitCost: 8.9,
    price: 26,
    serviceTemp: "2–4 °C",
    tastingNotes: "Leve, maltada e frutada.",
    stock: 96,
    par: 120,
    min: 48,
    location: "Câmara fria",
    supplier: "Distribuidora Sul",
    sales: 420,
    available: true,
  },
  {
    id: "C04",
    kind: "cerveja",
    name: "Eisenbahn Weizenbier",
    brewery: "Eisenbahn",
    style: "Weissbier",
    origin: "Brasil",
    abv: 4.8,
    ibu: 12,
    format: "Garrafa",
    serveMl: 355,
    kegLiters: null,
    unitCost: 6.4,
    price: 22,
    serviceTemp: "4–6 °C",
    tastingNotes: "Banana, cravo e corpo cremoso.",
    stock: 48,
    par: 48,
    min: 24,
    location: "Câmara fria",
    supplier: "Distribuidora Sul",
    sales: 140,
    available: true,
  },
  {
    id: "C05",
    kind: "cerveja",
    name: "Colorado Appia",
    brewery: "Colorado",
    style: "Wheat Ale com mel",
    origin: "Brasil",
    abv: 5.5,
    ibu: 10,
    format: "Garrafa",
    serveMl: 600,
    kegLiters: null,
    unitCost: 15.5,
    price: 48,
    serviceTemp: "4–6 °C",
    tastingNotes: "Mel de laranjeira e trigo.",
    stock: 18,
    par: 24,
    min: 12,
    location: "Câmara fria",
    supplier: "Ambev",
    sales: 96,
    available: true,
  },
  {
    id: "C06",
    kind: "cerveja",
    name: "Guinness Draught",
    brewery: "Guinness",
    style: "Irish Stout",
    origin: "Irlanda",
    abv: 4.2,
    ibu: 45,
    format: "Lata",
    serveMl: 440,
    kegLiters: null,
    unitCost: 14.8,
    price: 45,
    serviceTemp: "6–8 °C",
    tastingNotes: "Café torrado, chocolate amargo e espuma nitrogenada.",
    stock: 10,
    par: 24,
    min: 12,
    location: "Estoque seco",
    supplier: "Diageo BR",
    sales: 62,
    available: true,
  },
  {
    id: "C07",
    kind: "cerveja",
    name: "Baden Baden Red Ale",
    brewery: "Baden Baden",
    style: "Red Ale",
    origin: "Brasil",
    abv: 6.2,
    ibu: 22,
    format: "Garrafa",
    serveMl: 600,
    kegLiters: null,
    unitCost: 16.2,
    price: 49,
    serviceTemp: "6–8 °C",
    tastingNotes: "Caramelo, frutas vermelhas e malte tostado.",
    stock: 14,
    par: 18,
    min: 8,
    location: "Câmara fria",
    supplier: "Distribuidora Sul",
    sales: 54,
    available: true,
  },
  {
    id: "C08",
    kind: "cerveja",
    name: "Heineken 0,0",
    brewery: "Heineken",
    style: "Lager sem álcool",
    origin: "Holanda",
    abv: 0,
    ibu: 17,
    format: "Lata",
    serveMl: 350,
    kegLiters: null,
    unitCost: 4.9,
    price: 16,
    serviceTemp: "2–4 °C",
    tastingNotes: "Leve e refrescante.",
    stock: 60,
    par: 48,
    min: 24,
    location: "Câmara fria",
    supplier: "Distribuidora Sul",
    sales: 120,
    available: true,
  },
];

/* -------------------------------------------------------------------------- */
/* Sem álcool                                                                 */
/* -------------------------------------------------------------------------- */

export const softDrinks: SoftDrink[] = [
  {
    id: "N01",
    kind: "sem-alcool",
    name: "Água mineral sem gás",
    category: "Água",
    volumeMl: 500,
    unitCost: 1.6,
    price: 8,
    stock: 180,
    par: 240,
    min: 96,
    location: "Estoque seco",
    supplier: "Distribuidora Sul",
    sales: 640,
    available: true,
  },
  {
    id: "N02",
    kind: "sem-alcool",
    name: "Água com gás San Pellegrino",
    category: "Água",
    volumeMl: 505,
    unitCost: 7.2,
    price: 18,
    stock: 36,
    par: 48,
    min: 24,
    location: "Estoque seco",
    supplier: "Nestlé Waters",
    sales: 210,
    available: true,
  },
  {
    id: "N03",
    kind: "sem-alcool",
    name: "Coca-Cola",
    category: "Refrigerante",
    volumeMl: 350,
    unitCost: 2.9,
    price: 9,
    stock: 144,
    par: 144,
    min: 72,
    location: "Estoque seco",
    supplier: "Coca-Cola FEMSA",
    sales: 560,
    available: true,
  },
  {
    id: "N04",
    kind: "sem-alcool",
    name: "Guaraná Antarctica",
    category: "Refrigerante",
    volumeMl: 350,
    unitCost: 2.4,
    price: 8,
    stock: 96,
    par: 120,
    min: 48,
    location: "Estoque seco",
    supplier: "Ambev",
    sales: 380,
    available: true,
  },
  {
    id: "N05",
    kind: "sem-alcool",
    name: "Suco de laranja natural",
    category: "Suco",
    volumeMl: 400,
    unitCost: 3.2,
    price: 16,
    stock: 0,
    par: 0,
    min: 0,
    location: "Produção diária",
    supplier: "Verde Vale",
    sales: 690,
    available: true,
  },
  {
    id: "N06",
    kind: "sem-alcool",
    name: "Espresso",
    category: "Café",
    volumeMl: 50,
    unitCost: 1.1,
    price: 9,
    stock: 0,
    par: 0,
    min: 0,
    location: "Produção diária",
    supplier: "Café Orfeu",
    sales: 980,
    available: true,
  },
  {
    id: "N07",
    kind: "sem-alcool",
    name: "Chá gelado de hibisco",
    category: "Chá",
    volumeMl: 400,
    unitCost: 1.8,
    price: 14,
    stock: 0,
    par: 0,
    min: 0,
    location: "Produção diária",
    supplier: "Produção própria",
    sales: 160,
    available: true,
  },
  {
    id: "N08",
    kind: "sem-alcool",
    name: "Kombucha de gengibre",
    category: "Kombucha",
    volumeMl: 355,
    unitCost: 8.5,
    price: 22,
    stock: 20,
    par: 24,
    min: 12,
    location: "Câmara fria",
    supplier: "Kombucha Viva",
    sales: 72,
    available: true,
  },
];

/* -------------------------------------------------------------------------- */
/* Coquetéis                                                                  */
/* -------------------------------------------------------------------------- */

export const cocktails: Cocktail[] = [
  {
    id: "K01",
    kind: "coquetel",
    name: "Negroni",
    family: "Clássico",
    method: "Mexido",
    glass: "Old fashioned",
    garnish: "Casca de laranja",
    ice: "Pedra grande",
    prepMinutes: 3,
    price: 42,
    sales: 148,
    description: "Gin, Campari e vermute rosso em partes iguais.",
    available: true,
    ingredients: [
      { spiritId: "D01", name: "Gin", ml: 30 },
      { spiritId: "D13", name: "Campari", ml: 30 },
      { spiritId: "D14", name: "Vermute rosso", ml: 30 },
      { name: "Laranja (casca)", cost: 0.4 },
    ],
  },
  {
    id: "K02",
    kind: "coquetel",
    name: "Aperol Spritz",
    family: "Clássico",
    method: "Montado",
    glass: "Taça de vinho",
    garnish: "Rodela de laranja",
    ice: "Cubos",
    prepMinutes: 2,
    price: 48,
    sales: 210,
    description: "Aperol, prosecco e água com gás.",
    available: true,
    ingredients: [
      { spiritId: "D15", name: "Aperol", ml: 60 },
      { name: "Prosecco da casa (90 ml)", cost: 5.4 },
      { name: "Água com gás", cost: 0.9 },
      { name: "Laranja", cost: 0.5 },
    ],
  },
  {
    id: "K03",
    kind: "coquetel",
    name: "Caipirinha clássica",
    family: "Clássico",
    method: "Macerado",
    glass: "Old fashioned",
    garnish: "Limão",
    ice: "Gelo picado",
    prepMinutes: 3,
    price: 30,
    sales: 420,
    description: "Cachaça prata, limão-taiti e açúcar.",
    available: true,
    ingredients: [
      { spiritId: "D09", name: "Cachaça prata", ml: 60 },
      { name: "Limão-taiti", cost: 1.2 },
      { name: "Açúcar", cost: 0.15 },
    ],
  },
  {
    id: "K04",
    kind: "coquetel",
    name: "Gin Tônica Hendrick's",
    family: "Clássico",
    method: "Montado",
    glass: "Taça balão",
    garnish: "Pepino e pimenta-rosa",
    ice: "Cubos",
    prepMinutes: 2,
    price: 64,
    sales: 74,
    description: "Hendrick's com tônica premium.",
    available: true,
    ingredients: [
      { spiritId: "D02", name: "Gin Hendrick's", ml: 50 },
      { name: "Tônica premium", cost: 3.5 },
      { name: "Pepino", cost: 0.4 },
    ],
  },
  {
    id: "K05",
    kind: "coquetel",
    name: "Margarita",
    family: "Clássico",
    method: "Batido",
    glass: "Coupe",
    garnish: "Borda de sal",
    ice: "Batido no gelo",
    prepMinutes: 3,
    price: 72,
    sales: 58,
    description: "Tequila, Cointreau e limão.",
    available: true,
    ingredients: [
      { spiritId: "D11", name: "Tequila blanco", ml: 40 },
      { spiritId: "D12", name: "Cointreau", ml: 20 },
      { name: "Suco de limão", cost: 0.8 },
      { name: "Sal", cost: 0.05 },
    ],
  },
  {
    id: "K06",
    kind: "coquetel",
    name: "Mojito",
    family: "Clássico",
    method: "Macerado",
    glass: "Highball",
    garnish: "Ramo de hortelã",
    ice: "Gelo picado",
    prepMinutes: 4,
    price: 34,
    sales: 140,
    description: "Rum branco, hortelã, limão e soda.",
    available: true,
    ingredients: [
      { spiritId: "D07", name: "Rum branco", ml: 50 },
      { name: "Hortelã", cost: 0.9 },
      { name: "Limão", cost: 0.6 },
      { name: "Açúcar + soda", cost: 0.7 },
    ],
  },
  {
    id: "K07",
    kind: "coquetel",
    name: "Old Fashioned",
    family: "Clássico",
    method: "Mexido",
    glass: "Old fashioned",
    garnish: "Casca de laranja",
    ice: "Pedra grande",
    prepMinutes: 3,
    price: 52,
    sales: 84,
    description: "Bourbon, açúcar e bitters.",
    available: true,
    ingredients: [
      { spiritId: "D06", name: "Bourbon", ml: 60 },
      { name: "Angostura + açúcar", cost: 0.9 },
      { name: "Laranja (casca)", cost: 0.4 },
    ],
  },
  {
    id: "K08",
    kind: "coquetel",
    name: "Brasa Smoke",
    family: "Autoral",
    method: "Batido",
    glass: "Coupe",
    garnish: "Alecrim tostado",
    ice: "Batido no gelo",
    prepMinutes: 5,
    price: 62,
    sales: 96,
    description: "Cachaça envelhecida, cajá, xarope de pimenta defumada.",
    available: true,
    ingredients: [
      { spiritId: "D10", name: "Cachaça bálsamo", ml: 15 },
      { spiritId: "D09", name: "Cachaça prata", ml: 35 },
      { name: "Polpa de cajá", cost: 1.8 },
      { name: "Xarope defumado", cost: 1.1 },
      { name: "Alecrim", cost: 0.3 },
    ],
  },
  {
    id: "K09",
    kind: "coquetel",
    name: "Mai Tai",
    family: "Tiki",
    method: "Batido",
    glass: "Tiki mug",
    garnish: "Hortelã e limão",
    ice: "Gelo picado",
    prepMinutes: 4,
    price: 58,
    sales: 38,
    description: "Rum envelhecido, curaçau, orgeat e limão.",
    available: true,
    ingredients: [
      { spiritId: "D08", name: "Rum 7 anos", ml: 45 },
      { spiritId: "D12", name: "Licor de laranja", ml: 15 },
      { name: "Orgeat", cost: 1.6 },
      { name: "Limão", cost: 0.6 },
    ],
  },
  {
    id: "K10",
    kind: "coquetel",
    name: "Virgin Mule",
    family: "Sem álcool",
    method: "Montado",
    glass: "Caneca de cobre",
    garnish: "Limão e gengibre",
    ice: "Cubos",
    prepMinutes: 2,
    price: 26,
    sales: 66,
    description: "Ginger beer, limão e xarope de gengibre.",
    available: true,
    ingredients: [
      { name: "Ginger beer", cost: 4.2 },
      { name: "Limão", cost: 0.6 },
      { name: "Xarope de gengibre", cost: 0.8 },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Cálculos de custo e margem                                                 */
/* -------------------------------------------------------------------------- */

export const GLASSES_PER_BOTTLE = 5; // taça de 150 ml

export const wineGlassCost = (w: Wine) => w.bottleCost / GLASSES_PER_BOTTLE;
/** CMV da garrafa. */
export const wineCmv = (w: Wine) => (w.bottleCost / w.bottlePrice) * 100;
export const wineGlassCmv = (w: Wine) =>
  w.glassPrice ? (wineGlassCost(w) / w.glassPrice) * 100 : null;
export const wineMarkup = (w: Wine) => w.bottlePrice / w.bottleCost;

export const spiritCostPerMl = (s: Spirit) => s.bottleCost / s.volumeMl;
export const spiritDoses = (s: Spirit) => Math.floor(s.volumeMl / s.doseMl);
export const spiritDoseCost = (s: Spirit) => spiritCostPerMl(s) * s.doseMl;
/** Pour cost = custo da dose ÷ preço da dose. */
export const spiritPourCost = (s: Spirit) =>
  (spiritDoseCost(s) / s.dosePrice) * 100;
/** Receita potencial de uma garrafa vendida em doses. */
export const spiritBottleRevenue = (s: Spirit) => spiritDoses(s) * s.dosePrice;

export const beerServeCost = (b: Beer) =>
  b.format === "Chope" && b.kegLiters
    ? (b.unitCost / (b.kegLiters * 1000)) * b.serveMl * 1.08 // 8% de perda de espuma/linha
    : b.unitCost;
export const beerCmv = (b: Beer) => (beerServeCost(b) / b.price) * 100;

export function cocktailCost(c: Cocktail, spiritList: Spirit[] = spirits) {
  return c.ingredients.reduce((acc, i) => {
    if (i.spiritId && i.ml) {
      const s = spiritList.find((x) => x.id === i.spiritId);
      return acc + (s ? spiritCostPerMl(s) * i.ml : 0);
    }
    return acc + (i.cost ?? 0);
  }, 0);
}
export const cocktailCmv = (c: Cocktail, spiritList: Spirit[] = spirits) =>
  (cocktailCost(c, spiritList) / c.price) * 100;
/** Teor alcoólico aproximado do coquetel (sem diluição). */
export function cocktailAbv(c: Cocktail, spiritList: Spirit[] = spirits) {
  let alcohol = 0;
  let volume = 0;
  for (const i of c.ingredients) {
    if (i.spiritId && i.ml) {
      const s = spiritList.find((x) => x.id === i.spiritId);
      alcohol += (s?.abv ?? 0) * i.ml;
      volume += i.ml;
    } else {
      volume += 30; // mixers/sucos (estimativa)
    }
  }
  return volume === 0 ? 0 : alcohol / volume;
}

export const softCmv = (n: SoftDrink) => (n.unitCost / n.price) * 100;

/** Benchmarks de CMV/pour cost para bares. */
export const cmvTargets: Record<BeverageKind, number> = {
  vinho: 35,
  destilado: 20,
  cerveja: 30,
  coquetel: 22,
  "sem-alcool": 25,
};

export function cmvTone(kind: BeverageKind, cmv: number) {
  const target = cmvTargets[kind];
  if (cmv <= target) {
    return "good" as const;
  }
  return cmv <= target * 1.25 ? ("warn" as const) : ("bad" as const);
}

/* -------------------------------------------------------------------------- */
/* Inventário unificado                                                       */
/* -------------------------------------------------------------------------- */

export interface InventoryRow {
  id: string;
  kind: BeverageKind;
  name: string;
  detail: string;
  unit: string;
  stock: number;
  par: number;
  min: number;
  unitCost: number;
  location: string;
  supplier: string;
}

export interface BeverageState {
  wines: Wine[];
  spirits: Spirit[];
  beers: Beer[];
  cocktails: Cocktail[];
  softDrinks: SoftDrink[];
}

export const initialBeverageState: BeverageState = {
  wines,
  spirits,
  beers,
  cocktails,
  softDrinks,
};

export function inventoryRows(state: BeverageState): InventoryRow[] {
  return [
    ...state.wines.map((w) => ({
      id: w.id,
      kind: "vinho" as const,
      name: w.name,
      detail: `${w.style} · ${w.country}${w.vintage ? ` · ${w.vintage}` : ""}`,
      unit: "gfa",
      stock: w.stock,
      par: w.par,
      min: w.min,
      unitCost: w.bottleCost,
      location: w.location,
      supplier: w.supplier,
    })),
    ...state.spirits.map((s) => ({
      id: s.id,
      kind: "destilado" as const,
      name: s.name,
      detail: `${s.category} · ${s.volumeMl} ml · aberta ${s.openLevel}%`,
      unit: "gfa",
      stock: s.stock,
      par: s.par,
      min: s.min,
      unitCost: s.bottleCost,
      location: s.location,
      supplier: s.supplier,
    })),
    ...state.beers.map((b) => ({
      id: b.id,
      kind: "cerveja" as const,
      name: b.name,
      detail: `${b.style} · ${b.format}${b.kegLiters ? ` ${b.kegLiters} L` : ` ${b.serveMl} ml`}`,
      unit: b.format === "Chope" ? "barril" : "un",
      stock: b.stock,
      par: b.par,
      min: b.min,
      unitCost: b.unitCost,
      location: b.location,
      supplier: b.supplier,
    })),
    ...state.softDrinks
      .filter((n) => n.par > 0)
      .map((n) => ({
        id: n.id,
        kind: "sem-alcool" as const,
        name: n.name,
        detail: `${n.category} · ${n.volumeMl} ml`,
        unit: "un",
        stock: n.stock,
        par: n.par,
        min: n.min,
        unitCost: n.unitCost,
        location: n.location,
        supplier: n.supplier,
      })),
  ];
}

export type MovementType = "Entrada" | "Saída" | "Perda" | "Ajuste";

export interface Movement {
  id: string;
  date: Date;
  type: MovementType;
  itemId: string;
  itemName: string;
  qty: number;
  note: string;
}

const today = new Date(2026, 9, 6);
const ago = (d: number, h = 0) => {
  const x = new Date(today);
  x.setDate(x.getDate() - d);
  x.setHours(10 + h, 15);
  return x;
};

export const initialMovements: Movement[] = [
  {
    id: "M1",
    date: ago(0, 1),
    type: "Entrada",
    itemId: "V01",
    itemName: "Catena Malbec",
    qty: 12,
    note: "NF 44812 · Importadora Andes",
  },
  {
    id: "M2",
    date: ago(0),
    type: "Perda",
    itemId: "V07",
    itemName: "Alvarinho Soalheiro",
    qty: -1,
    note: "Garrafa quebrada no salão",
  },
  {
    id: "M3",
    date: ago(1, 2),
    type: "Saída",
    itemId: "D15",
    itemName: "Aperol",
    qty: -2,
    note: "Transferência para o bar da varanda",
  },
  {
    id: "M4",
    date: ago(1),
    type: "Entrada",
    itemId: "C01",
    itemName: "Pilsen da casa",
    qty: 4,
    note: "Barris 30 L",
  },
  {
    id: "M5",
    date: ago(2),
    type: "Ajuste",
    itemId: "D04",
    itemName: "Johnnie Walker Black Label",
    qty: -1,
    note: "Contagem semanal",
  },
  {
    id: "M6",
    date: ago(3),
    type: "Entrada",
    itemId: "C03",
    itemName: "Heineken",
    qty: 48,
    note: "Distribuidora Sul",
  },
];

/* -------------------------------------------------------------------------- */
/* Séries para gráficos                                                       */
/* -------------------------------------------------------------------------- */

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16_807) % 2_147_483_647;
    return (s - 1) / 2_147_483_646;
  };
}

const rnd = seeded(5150);
/** Receita diária de bebidas por tipo (30 dias). */
export const dailyBeverageRevenue = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(today);
  date.setDate(date.getDate() - 29 + i);
  const weekend = [0, 5, 6].includes(date.getDay());
  const f = weekend ? 1.6 : 1;
  return {
    date,
    vinhos: Math.round((2400 + rnd() * 900) * f),
    coqueteis: Math.round((1500 + rnd() * 700) * f),
    cervejas: Math.round((1300 + rnd() * 500) * f),
    destilados: Math.round((700 + rnd() * 400) * f),
  };
});

/* -------------------------------------------------------------------------- */
/* Lista unificada (carta completa e visão geral)                             */
/* -------------------------------------------------------------------------- */

export interface MenuLine {
  id: string;
  kind: BeverageKind;
  group: string;
  name: string;
  detail: string;
  /** Preço principal exibido na carta. */
  price: number;
  /** Rótulo do preço (garrafa, dose, taça…). */
  priceLabel: string;
  secondaryPrice?: { label: string; value: number };
  cost: number;
  cmv: number;
  sales: number;
  revenue: number;
  profit: number;
  available: boolean;
}

/** Share of spirit doses sold neat (the rest go into cocktails). */
const NEAT_SHARE = 0.4;

export function menuLines(state: BeverageState): MenuLine[] {
  const lines: MenuLine[] = [];
  for (const w of state.wines) {
    const revenue =
      w.sales * w.bottlePrice +
      (w.glassPrice ? w.glassesSold * w.glassPrice : 0);
    const cost = w.sales * w.bottleCost + w.glassesSold * wineGlassCost(w);
    lines.push({
      id: w.id,
      kind: "vinho",
      group: w.style,
      name: `${w.name}${w.vintage ? ` ${w.vintage}` : ""}`,
      detail: `${w.producer} · ${w.region}, ${w.country} · ${w.grapes.join(", ")}`,
      price: w.bottlePrice,
      priceLabel: "garrafa",
      secondaryPrice: w.glassPrice
        ? { label: "taça", value: w.glassPrice }
        : undefined,
      cost: w.bottleCost,
      cmv: wineCmv(w),
      sales: w.sales + w.glassesSold,
      revenue,
      profit: revenue - cost,
      available: w.available,
    });
  }
  for (const s of state.spirits) {
    const neat = Math.round(s.sales * NEAT_SHARE);
    lines.push({
      id: s.id,
      kind: "destilado",
      group: s.category,
      name: s.name,
      detail: `${s.origin} · ${s.abv}%${s.age ? ` · ${s.age}` : ""} · ${s.doseMl} ml`,
      price: s.dosePrice,
      priceLabel: "dose",
      cost: spiritDoseCost(s),
      cmv: spiritPourCost(s),
      sales: neat,
      revenue: neat * s.dosePrice,
      profit: neat * (s.dosePrice - spiritDoseCost(s)),
      available: s.available,
    });
  }
  for (const b of state.beers) {
    lines.push({
      id: b.id,
      kind: "cerveja",
      group: b.format,
      name: b.name,
      detail: `${b.brewery} · ${b.style} · ${b.abv}% · ${b.serveMl} ml`,
      price: b.price,
      priceLabel: b.format === "Chope" ? "copo" : "un",
      cost: beerServeCost(b),
      cmv: beerCmv(b),
      sales: b.sales,
      revenue: b.sales * b.price,
      profit: b.sales * (b.price - beerServeCost(b)),
      available: b.available,
    });
  }
  for (const c of state.cocktails) {
    const cost = cocktailCost(c, state.spirits);
    lines.push({
      id: c.id,
      kind: "coquetel",
      group: c.family,
      name: c.name,
      detail: c.description,
      price: c.price,
      priceLabel: "drink",
      cost,
      cmv: (cost / c.price) * 100,
      sales: c.sales,
      revenue: c.sales * c.price,
      profit: c.sales * (c.price - cost),
      available: c.available,
    });
  }
  for (const n of state.softDrinks) {
    lines.push({
      id: n.id,
      kind: "sem-alcool",
      group: n.category,
      name: n.name,
      detail: `${n.volumeMl} ml`,
      price: n.price,
      priceLabel: "un",
      cost: n.unitCost,
      cmv: softCmv(n),
      sales: n.sales,
      revenue: n.sales * n.price,
      profit: n.sales * (n.price - n.unitCost),
      available: n.available,
    });
  }
  return lines;
}
