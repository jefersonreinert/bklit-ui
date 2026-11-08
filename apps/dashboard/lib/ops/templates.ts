/**
 * Ready-made departments and checklists for a bar and restaurant
 * (food safety / HACCP good practice, cleaning and closing routines).
 * Texts in English: the sheets hang on the walls of venues in Malta.
 */

export type Frequency = "daily" | "weekly" | "monthly" | "log";

export interface FormTemplate {
  department: string;
  title: string;
  frequency: Frequency;
  items: string[];
  /** Time slots of a log sheet (e.g. toilet checks). */
  slots?: string[];
  note?: string;
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  log: "Registro por horário",
};

export const DEPARTMENTS = [
  "Bar",
  "Kitchen",
  "Toilets",
  "Floor",
  "Management",
] as const;

const HOURLY = [
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
  "23:00",
  "00:00",
  "01:00",
];

export const TEMPLATES: FormTemplate[] = [
  {
    department: "Toilets",
    title: "Toilet Cleaning Log",
    frequency: "log",
    slots: HOURLY,
    items: [
      "Floor clean and dry",
      "Toilets / urinals cleaned",
      "Sinks and mirrors cleaned",
      "Soap refilled",
      "Toilet paper refilled",
      "Hand towels / dryer OK",
      "Bins emptied",
      "No bad smell",
    ],
    note: "Check every hour while open. Report any damage or leak to the manager immediately.",
  },
  {
    department: "Toilets",
    title: "Toilets Deep Clean (Weekly)",
    frequency: "weekly",
    items: [
      "Walls and doors washed",
      "Toilets and urinals descaled",
      "Drains cleaned",
      "Under sinks and pipes cleaned",
      "Dispensers cleaned inside",
      "Vents and lights dusted",
      "Baby changing station sanitised",
    ],
  },
  {
    department: "Kitchen",
    title: "Kitchen Daily Cleaning",
    frequency: "daily",
    items: [
      "Work surfaces cleaned and sanitised",
      "Chopping boards washed and sanitised",
      "Cooker, grill and griddle cleaned",
      "Fryers cleaned (oil checked / changed)",
      "Ovens wiped inside and out",
      "Microwave cleaned",
      "Fridge and freezer handles and seals wiped",
      "Fridge temperatures recorded (0–5 °C)",
      "Freezer temperatures recorded (-18 °C or below)",
      "Food labelled, dated and covered",
      "Out-of-date food discarded",
      "Sinks and taps cleaned",
      "Dishwasher emptied and cleaned",
      "Bins emptied and cleaned",
      "Floors swept and mopped",
      "Hand-wash basin stocked (soap, towels)",
    ],
    note: "Use the right colour-coded cloths and boards. Sanitiser must stay on surfaces for the contact time on the label.",
  },
  {
    department: "Kitchen",
    title: "Kitchen Weekly Cleaning",
    frequency: "weekly",
    items: [
      "Fridges emptied and fully cleaned",
      "Freezers checked for ice build-up",
      "Extraction hood and filters degreased",
      "Walls and tiles washed",
      "Behind and under equipment cleaned",
      "Shelves and storage areas cleaned",
      "Dry store tidied (FIFO, no pests)",
      "Drains and grease traps checked",
      "Light fittings and vents dusted",
      "Pest control checks (no droppings / damage)",
    ],
  },
  {
    department: "Bar",
    title: "Bar Daily Cleaning",
    frequency: "daily",
    items: [
      "Bar top and back bar cleaned",
      "Speed rails and bottles wiped",
      "Beer taps and drip trays cleaned",
      "Coffee machine cleaned (steam wand, group heads)",
      "Glasswasher emptied and cleaned",
      "Ice machine scoop clean, ice bin covered",
      "Fridges wiped, temperatures OK",
      "Fruit and garnishes covered and dated",
      "Sinks cleaned",
      "Bins emptied",
      "Floor mats washed",
      "Floor swept and mopped",
    ],
  },
  {
    department: "Bar",
    title: "Bar Weekly Cleaning",
    frequency: "weekly",
    items: [
      "Beer lines cleaned",
      "Ice machine cleaned and sanitised",
      "Fridges emptied and fully cleaned",
      "Shelves and bottles dusted",
      "Glassware polished and chipped glasses removed",
      "Under the bar cleaned",
      "Stock rotated (FIFO)",
    ],
  },
  {
    department: "Bar",
    title: "Bar Closing Checklist",
    frequency: "daily",
    items: [
      "Last orders called on time",
      "Bar cleaned (see daily cleaning)",
      "Garnishes stored, perishables in fridge",
      "Bottles capped, speed pourers covered",
      "Glassware washed and stored",
      "Stock to restock noted",
      "Coffee machine off and cleaned",
      "Fridges closed and on",
      "Lights and music off",
      "Bins taken out",
    ],
  },
  {
    department: "Floor",
    title: "Floor Daily Cleaning",
    frequency: "daily",
    items: [
      "Tables and chairs cleaned",
      "Menus clean and complete",
      "Condiments and cutlery refilled",
      "Floor swept and mopped",
      "Terrace cleaned",
      "Entrance and windows cleaned",
    ],
  },
  {
    department: "Management",
    title: "Daily Closing — Manager / Supervisor",
    frequency: "daily",
    items: [
      "Z report printed and checked",
      "Cash counted, float left, difference recorded",
      "Card terminal batch closed and matched",
      "Tips counted and recorded",
      "Cash and safe locked",
      "All staff clocked out",
      "Kitchen, bar and toilets checklists completed",
      "Fridges and freezers on and closed",
      "Gas, ovens, fryers and coffee machine off",
      "Windows and back doors locked",
      "Lights, music and AC off",
      "Alarm set",
      "Incidents / breakages / complaints reported",
    ],
  },
  {
    department: "Management",
    title: "Weekly Closing — Manager / Supervisor",
    frequency: "weekly",
    items: [
      "Weekly sales reviewed against target",
      "Stock count of key items",
      "Orders placed with suppliers",
      "Next week's roster published",
      "Time clock reviewed and corrected",
      "Waste and breakage recorded",
      "Weekly cleaning checklists checked",
      "Maintenance issues reported",
      "Staff feedback / training points noted",
    ],
  },
  {
    department: "Management",
    title: "Monthly Closing — Manager",
    frequency: "monthly",
    items: [
      "Full stock take done",
      "Cost of goods and margins reviewed",
      "Monthly hours approved for payroll",
      "Staff documents and permits checked (expiry dates)",
      "Supplier invoices checked and filed",
      "Fire extinguishers and first aid kit checked",
      "Pest control visit report filed",
      "Equipment maintenance and service dates checked",
      "Licences and certificates valid",
      "Deep clean schedule for next month planned",
    ],
  },
];
