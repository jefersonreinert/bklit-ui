/** Guest page texts in the guest's language (English for the rest). */

export interface GuestStrings {
  hello: string;
  tap: string;
  listening: string;
  thinking: string;
  speaking: string;
  stop: string;
  type: string;
  send: string;
  handsFree: string;
  onTap: string;
  ask: string;
  askAbout: (name: string) => string;
  noMic: string;
  micDenied: string;
  closed: string;
  error: string;
  ideas: string[];
  glass: string;
  bottle: string;
  privacy: string;
  newChat: string;
  connecting: string;
  liveEnd: string;
  askAnything: string;
  photo: string;
  photoAsk: string;
  photoBad: string;
  talk: string;
  release: string;
  endCall: string;
  photoBtn: string;
}

const en: GuestStrings = {
  hello:
    "Hello! I'm your sommelier. Tell me what you like, or ask me about any wine on our machines.",
  tap: "Tap and talk",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Tap to interrupt",
  stop: "Stop",
  type: "Type your question",
  send: "Send",
  handsFree: "Conversation mode",
  onTap: "On tap now",
  ask: "Ask",
  askAbout: (n) =>
    `Tell me about ${n}: tasting notes, story and what to eat with it.`,
  noMic: "Voice isn't available in this browser. You can type instead.",
  micDenied: "Please allow the microphone to talk with me, or type instead.",
  closed: "This sommelier isn't available right now.",
  error: "Something went wrong. Please try again.",
  ideas: [
    "Recommend a red to try",
    "Make me a tasting flight of three",
    "What goes well with cheese?",
    "Tell me about Maltese wine",
  ],
  glass: "glass",
  bottle: "bottle",
  privacy: "Your questions are saved anonymously to improve the service.",
  newChat: "New conversation",
  connecting: "Connecting…",
  liveEnd: "Tap to end the conversation",
  askAnything: "Ask anything",
  photo: "Photo of a wine",
  photoAsk: "What wine is this? Tell me all about it.",
  photoBad: "I couldn't open that photo. Please try again.",
  talk: "Hold to talk",
  release: "Release to send",
  endCall: "End call",
  photoBtn: "Photo",
};

const pt: GuestStrings = {
  hello:
    "Olá! Sou o seu sommelier. Me conte do que você gosta ou pergunte sobre qualquer vinho das nossas máquinas.",
  tap: "Toque e fale",
  listening: "Ouvindo…",
  thinking: "Pensando…",
  speaking: "Toque para interromper",
  stop: "Parar",
  type: "Escreva sua pergunta",
  send: "Enviar",
  handsFree: "Modo conversa",
  onTap: "Nas máquinas agora",
  ask: "Perguntar",
  askAbout: (n) =>
    `Me fale do ${n}: notas de prova, história e com o que combina.`,
  noMic: "A voz não funciona neste navegador. Você pode escrever.",
  micDenied: "Permita o microfone para conversar comigo, ou escreva.",
  closed: "Este sommelier não está disponível agora.",
  error: "Algo deu errado. Tente de novo.",
  ideas: [
    "Me indique um tinto para provar",
    "Monte uma degustação de três vinhos",
    "O que combina com queijo?",
    "Me fale dos vinhos de Malta",
  ],
  glass: "taça",
  bottle: "garrafa",
  privacy:
    "Suas perguntas são guardadas de forma anônima para melhorar o serviço.",
  newChat: "Nova conversa",
  connecting: "Conectando…",
  liveEnd: "Toque para encerrar a conversa",
  askAnything: "Pergunte qualquer coisa",
  photo: "Foto de um vinho",
  photoAsk: "Que vinho é este? Me conte tudo sobre ele.",
  photoBad: "Não consegui abrir essa foto. Tente de novo.",
  talk: "Segure para falar",
  release: "Solte para enviar",
  endCall: "Encerrar",
  photoBtn: "Foto",
};

const it: GuestStrings = {
  ...en,
  hello:
    "Ciao! Sono il tuo sommelier. Dimmi cosa ti piace o chiedimi di qualsiasi vino delle nostre macchine.",
  tap: "Tocca e parla",
  listening: "Ti ascolto…",
  thinking: "Ci penso…",
  speaking: "Tocca per interrompere",
  stop: "Ferma",
  type: "Scrivi la tua domanda",
  send: "Invia",
  handsFree: "Modalità conversazione",
  onTap: "Alla spina ora",
  ask: "Chiedi",
  askAbout: (n) =>
    `Parlami di ${n}: note di degustazione, storia e abbinamenti.`,
  ideas: [
    "Consigliami un rosso da provare",
    "Crea una degustazione di tre vini",
    "Cosa si abbina al formaggio?",
    "Parlami dei vini maltesi",
  ],
  glass: "calice",
  bottle: "bottiglia",
  newChat: "Nuova conversazione",
  connecting: "Connessione…",
  liveEnd: "Tocca per chiudere la conversazione",
  askAnything: "Chiedimi qualsiasi cosa",
  photo: "Foto di un vino",
  photoAsk: "Che vino è questo? Raccontami tutto.",
  photoBad: "Non riesco ad aprire la foto. Riprova.",
  talk: "Tieni premuto per parlare",
  release: "Rilascia per inviare",
  endCall: "Chiudi",
  photoBtn: "Foto",
};

const es: GuestStrings = {
  ...en,
  hello:
    "¡Hola! Soy tu sumiller. Cuéntame qué te gusta o pregúntame por cualquier vino de nuestras máquinas.",
  tap: "Toca y habla",
  listening: "Escuchando…",
  thinking: "Pensando…",
  speaking: "Toca para interrumpir",
  stop: "Parar",
  type: "Escribe tu pregunta",
  send: "Enviar",
  handsFree: "Modo conversación",
  onTap: "En las máquinas ahora",
  ask: "Preguntar",
  askAbout: (n) => `Háblame de ${n}: notas de cata, historia y maridaje.`,
  ideas: [
    "Recomiéndame un tinto para probar",
    "Prepárame una cata de tres vinos",
    "¿Qué va bien con queso?",
    "Háblame de los vinos de Malta",
  ],
  glass: "copa",
  bottle: "botella",
  newChat: "Nueva conversación",
  connecting: "Conectando…",
  liveEnd: "Toca para terminar la conversación",
  askAnything: "Pregúntame lo que quieras",
  photo: "Foto de un vino",
  photoAsk: "¿Qué vino es este? Cuéntame todo sobre él.",
  photoBad: "No pude abrir esa foto. Inténtalo de nuevo.",
  talk: "Mantén para hablar",
  release: "Suelta para enviar",
  endCall: "Terminar",
  photoBtn: "Foto",
};

const fr: GuestStrings = {
  ...en,
  hello:
    "Bonjour ! Je suis votre sommelier. Dites-moi ce que vous aimez ou demandez-moi n'importe quel vin de nos machines.",
  tap: "Touchez et parlez",
  listening: "Je vous écoute…",
  thinking: "Je réfléchis…",
  speaking: "Touchez pour interrompre",
  stop: "Arrêter",
  type: "Écrivez votre question",
  send: "Envoyer",
  handsFree: "Mode conversation",
  onTap: "Au verre maintenant",
  ask: "Demander",
  askAbout: (n) =>
    `Parlez-moi de ${n} : notes de dégustation, histoire et accords.`,
  ideas: [
    "Conseillez-moi un rouge à goûter",
    "Composez-moi une dégustation de trois vins",
    "Qu'est-ce qui va avec le fromage ?",
    "Parlez-moi des vins de Malte",
  ],
  glass: "verre",
  bottle: "bouteille",
  newChat: "Nouvelle conversation",
  connecting: "Connexion…",
  liveEnd: "Touchez pour terminer la conversation",
  askAnything: "Demandez-moi tout",
  photo: "Photo d'un vin",
  photoAsk: "Quel est ce vin ? Racontez-moi tout.",
  photoBad: "Impossible d'ouvrir cette photo. Réessayez.",
  talk: "Maintenez pour parler",
  release: "Relâchez pour envoyer",
  endCall: "Raccrocher",
  photoBtn: "Photo",
};

const de: GuestStrings = {
  ...en,
  hello:
    "Hallo! Ich bin Ihr Sommelier. Sagen Sie mir, was Sie mögen, oder fragen Sie mich nach jedem Wein an unseren Automaten.",
  tap: "Tippen und sprechen",
  listening: "Ich höre zu…",
  thinking: "Einen Moment…",
  speaking: "Tippen zum Unterbrechen",
  stop: "Stopp",
  type: "Frage eingeben",
  send: "Senden",
  handsFree: "Gesprächsmodus",
  onTap: "Jetzt im Ausschank",
  ask: "Fragen",
  askAbout: (n) =>
    `Erzählen Sie mir von ${n}: Verkostungsnotizen, Geschichte und Speisen dazu.`,
  ideas: [
    "Empfehlen Sie mir einen Rotwein",
    "Stellen Sie mir eine Verkostung mit drei Weinen zusammen",
    "Was passt zu Käse?",
    "Erzählen Sie mir von maltesischem Wein",
  ],
  glass: "Glas",
  bottle: "Flasche",
  newChat: "Neues Gespräch",
  connecting: "Verbinde…",
  liveEnd: "Tippen, um das Gespräch zu beenden",
  askAnything: "Frag mich alles",
  photo: "Foto eines Weins",
  photoAsk: "Welcher Wein ist das? Erzähl mir alles darüber.",
  photoBad: "Das Foto ließ sich nicht öffnen. Bitte nochmal versuchen.",
  talk: "Halten zum Sprechen",
  release: "Loslassen zum Senden",
  endCall: "Beenden",
  photoBtn: "Foto",
};

const ALL: Record<string, GuestStrings> = { en, pt, it, es, fr, de };

export const guestStrings = (code: string) => ALL[code] ?? en;

/* ------------------------------- wine sheets ------------------------------ */

export interface SheetStrings {
  origin: string;
  type: string;
  grapes: string;
  vintage: string;
  alcohol: string;
  appellation: string;
  winery: string;
  serve: string;
  bottle: string;
  onTap: string;
  vegan: string;
  body: string;
  tannin: string;
  acidity: string;
  sweetness: string;
  tasting: string;
  colour: string;
  nose: string;
  palate: string;
  pairing: string;
  serving: string;
  decanting: string;
  ageing: string;
  vineyards: string;
  soils: string;
  climate: string;
  winemaking: string;
  more: string;
  less: string;
  ask: string;
  loading: string;
  aiNote: string;
  colors: Record<string, string>;
}

const sheetEn: SheetStrings = {
  origin: "Origin",
  type: "Wine type",
  grapes: "Grape variety",
  vintage: "Vintage",
  alcohol: "Alcohol",
  appellation: "Appellation",
  winery: "Winery",
  serve: "Served",
  bottle: "bottle",
  onTap: "On tap now",
  vegan: "Vegan",
  body: "Body",
  tannin: "Tannin",
  acidity: "Acidity",
  sweetness: "Sweetness",
  tasting: "Tasting notes",
  colour: "Colour",
  nose: "Nose",
  palate: "Palate",
  pairing: "Food pairing",
  serving: "Serving temperature",
  decanting: "Decanting",
  ageing: "Ageing potential",
  vineyards: "Vineyards",
  soils: "Soils",
  climate: "Climate",
  winemaking: "Winemaking",
  more: "Full sheet",
  less: "Less",
  ask: "Ask about it",
  loading: "Preparing the full sheet…",
  aiNote:
    "Sheet written by the AI sommelier from the house notes and what is known about this wine.",
  colors: {
    red: "Red wine",
    white: "White wine",
    rose: "Rosé wine",
    orange: "Orange wine",
    sparkling: "Sparkling wine",
    dessert: "Dessert wine",
  },
};

const sheetPt: SheetStrings = {
  origin: "Origem",
  type: "Tipo de vinho",
  grapes: "Uva",
  vintage: "Safra",
  alcohol: "Teor alcoólico",
  appellation: "Denominação",
  winery: "Vinícola",
  serve: "Servido",
  bottle: "garrafa",
  onTap: "Na máquina agora",
  vegan: "Vegano",
  body: "Corpo",
  tannin: "Tanino",
  acidity: "Acidez",
  sweetness: "Doçura",
  tasting: "Notas de prova",
  colour: "Cor",
  nose: "Nariz",
  palate: "Boca",
  pairing: "Harmonização",
  serving: "Temperatura de serviço",
  decanting: "Decantação",
  ageing: "Potencial de guarda",
  vineyards: "Vinhedos",
  soils: "Solos",
  climate: "Clima",
  winemaking: "Vinificação",
  more: "Ficha completa",
  less: "Menos",
  ask: "Perguntar",
  loading: "Preparando a ficha completa…",
  aiNote:
    "Ficha escrita pelo sommelier IA com as notas da casa e o que se sabe deste vinho.",
  colors: {
    red: "Vinho tinto",
    white: "Vinho branco",
    rose: "Vinho rosé",
    orange: "Vinho laranja",
    sparkling: "Espumante",
    dessert: "Vinho de sobremesa",
  },
};

const sheetIt: SheetStrings = {
  ...sheetEn,
  origin: "Origine",
  type: "Tipologia",
  grapes: "Vitigno",
  vintage: "Annata",
  alcohol: "Alcol",
  appellation: "Denominazione",
  winery: "Cantina",
  serve: "Servito",
  bottle: "bottiglia",
  onTap: "In mescita ora",
  vegan: "Vegano",
  body: "Corpo",
  tannin: "Tannino",
  acidity: "Acidità",
  sweetness: "Dolcezza",
  tasting: "Note di degustazione",
  colour: "Colore",
  nose: "Naso",
  palate: "Bocca",
  pairing: "Abbinamenti",
  serving: "Temperatura di servizio",
  decanting: "Decantazione",
  ageing: "Potenziale di invecchiamento",
  vineyards: "Vigneti",
  soils: "Terreni",
  climate: "Clima",
  winemaking: "Vinificazione",
  more: "Scheda completa",
  less: "Meno",
  ask: "Chiedi",
  loading: "Preparo la scheda completa…",
  aiNote:
    "Scheda scritta dal sommelier IA con le note della casa e ciò che si sa di questo vino.",
  colors: {
    red: "Vino rosso",
    white: "Vino bianco",
    rose: "Vino rosato",
    orange: "Vino orange",
    sparkling: "Spumante",
    dessert: "Vino da dessert",
  },
};

const sheetEs: SheetStrings = {
  ...sheetEn,
  origin: "Origen",
  type: "Tipo de vino",
  grapes: "Variedad",
  vintage: "Añada",
  alcohol: "Alcohol",
  appellation: "Denominación",
  winery: "Bodega",
  serve: "Se sirve",
  bottle: "botella",
  onTap: "En la máquina ahora",
  vegan: "Vegano",
  body: "Cuerpo",
  tannin: "Tanino",
  acidity: "Acidez",
  sweetness: "Dulzor",
  tasting: "Notas de cata",
  colour: "Color",
  nose: "Nariz",
  palate: "Boca",
  pairing: "Maridaje",
  serving: "Temperatura de servicio",
  decanting: "Decantación",
  ageing: "Potencial de guarda",
  vineyards: "Viñedos",
  soils: "Suelos",
  climate: "Clima",
  winemaking: "Elaboración",
  more: "Ficha completa",
  less: "Menos",
  ask: "Preguntar",
  loading: "Preparando la ficha completa…",
  aiNote:
    "Ficha escrita por el sumiller IA con las notas de la casa y lo que se sabe de este vino.",
  colors: {
    red: "Vino tinto",
    white: "Vino blanco",
    rose: "Vino rosado",
    orange: "Vino naranja",
    sparkling: "Espumoso",
    dessert: "Vino de postre",
  },
};

const sheetFr: SheetStrings = {
  ...sheetEn,
  origin: "Origine",
  type: "Type de vin",
  grapes: "Cépage",
  vintage: "Millésime",
  alcohol: "Alcool",
  appellation: "Appellation",
  winery: "Domaine",
  serve: "Servi",
  bottle: "bouteille",
  onTap: "Au verre maintenant",
  vegan: "Vegan",
  body: "Corps",
  tannin: "Tanins",
  acidity: "Acidité",
  sweetness: "Sucrosité",
  tasting: "Notes de dégustation",
  colour: "Robe",
  nose: "Nez",
  palate: "Bouche",
  pairing: "Accords mets-vins",
  serving: "Température de service",
  decanting: "Carafage",
  ageing: "Potentiel de garde",
  vineyards: "Vignobles",
  soils: "Sols",
  climate: "Climat",
  winemaking: "Vinification",
  more: "Fiche complète",
  less: "Moins",
  ask: "Demander",
  loading: "Préparation de la fiche complète…",
  aiNote:
    "Fiche écrite par le sommelier IA à partir des notes de la maison et de ce que l'on sait de ce vin.",
  colors: {
    red: "Vin rouge",
    white: "Vin blanc",
    rose: "Vin rosé",
    orange: "Vin orange",
    sparkling: "Vin effervescent",
    dessert: "Vin de dessert",
  },
};

const sheetDe: SheetStrings = {
  ...sheetEn,
  origin: "Herkunft",
  type: "Weinart",
  grapes: "Rebsorte",
  vintage: "Jahrgang",
  alcohol: "Alkohol",
  appellation: "Anbaugebiet",
  winery: "Weingut",
  serve: "Ausschank",
  bottle: "Flasche",
  onTap: "Jetzt im Ausschank",
  vegan: "Vegan",
  body: "Körper",
  tannin: "Tannin",
  acidity: "Säure",
  sweetness: "Süße",
  tasting: "Verkostungsnotizen",
  colour: "Farbe",
  nose: "Nase",
  palate: "Gaumen",
  pairing: "Speiseempfehlung",
  serving: "Trinktemperatur",
  decanting: "Dekantieren",
  ageing: "Lagerpotenzial",
  vineyards: "Weinberge",
  soils: "Böden",
  climate: "Klima",
  winemaking: "Ausbau",
  more: "Ganzes Datenblatt",
  less: "Weniger",
  ask: "Fragen",
  loading: "Datenblatt wird erstellt…",
  aiNote:
    "Vom KI-Sommelier aus den Hausnotizen und bekanntem Wissen über diesen Wein erstellt.",
  colors: {
    red: "Rotwein",
    white: "Weißwein",
    rose: "Roséwein",
    orange: "Orange Wine",
    sparkling: "Schaumwein",
    dessert: "Dessertwein",
  },
};

const SHEETS: Record<string, SheetStrings> = {
  en: sheetEn,
  pt: sheetPt,
  it: sheetIt,
  es: sheetEs,
  fr: sheetFr,
  de: sheetDe,
};

export const sheetStrings = (code: string) => SHEETS[code] ?? sheetEn;
