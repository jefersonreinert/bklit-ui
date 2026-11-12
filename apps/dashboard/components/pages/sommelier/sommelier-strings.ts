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
  askAbout: (n) => `Tell me about ${n}: tasting notes, story and what to eat with it.`,
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
  askAbout: (n) => `Me fale do ${n}: notas de prova, história e com o que combina.`,
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
  privacy: "Suas perguntas são guardadas de forma anônima para melhorar o serviço.",
  newChat: "Nova conversa",
  connecting: "Conectando…",
  liveEnd: "Toque para encerrar a conversa",
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
  askAbout: (n) => `Parlami di ${n}: note di degustazione, storia e abbinamenti.`,
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
  askAbout: (n) => `Parlez-moi de ${n} : notes de dégustation, histoire et accords.`,
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
  askAbout: (n) => `Erzählen Sie mir von ${n}: Verkostungsnotizen, Geschichte und Speisen dazu.`,
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
};

const ALL: Record<string, GuestStrings> = { en, pt, it, es, fr, de };

export const guestStrings = (code: string) => ALL[code] ?? en;
