/**
 * Countries for pickers: ISO 3166-1 alpha-2 codes that have a round flag
 * in /public/flags (circle-flags, MIT). Names come from the browser
 * (Intl.DisplayNames) in the app language; the value saved on products is
 * the English short name ("France", "United States"), which the
 * sommelier, the menu and older data already use.
 */

const CODES = [
  "ac",
  "ad",
  "ae",
  "af",
  "ag",
  "ai",
  "al",
  "am",
  "an",
  "ao",
  "aq",
  "ar",
  "as",
  "at",
  "au",
  "aw",
  "ax",
  "az",
  "ba",
  "bb",
  "bd",
  "be",
  "bf",
  "bg",
  "bh",
  "bi",
  "bj",
  "bl",
  "bm",
  "bn",
  "bo",
  "bq",
  "br",
  "bs",
  "bt",
  "bv",
  "bw",
  "by",
  "bz",
  "ca",
  "cc",
  "cd",
  "cf",
  "cg",
  "ch",
  "ci",
  "ck",
  "cl",
  "cm",
  "cn",
  "co",
  "cp",
  "cq",
  "cr",
  "cu",
  "cv",
  "cw",
  "cx",
  "cy",
  "cz",
  "de",
  "dg",
  "dj",
  "dk",
  "dm",
  "do",
  "dz",
  "ea",
  "ec",
  "ee",
  "eg",
  "eh",
  "er",
  "es",
  "et",
  "eu",
  "fi",
  "fj",
  "fk",
  "fm",
  "fo",
  "fr",
  "fx",
  "ga",
  "gb",
  "gd",
  "ge",
  "gf",
  "gg",
  "gh",
  "gi",
  "gl",
  "gm",
  "gn",
  "gp",
  "gq",
  "gr",
  "gs",
  "gt",
  "gu",
  "gw",
  "gy",
  "hk",
  "hm",
  "hn",
  "hr",
  "ht",
  "hu",
  "ic",
  "id",
  "ie",
  "il",
  "im",
  "in",
  "io",
  "iq",
  "ir",
  "is",
  "it",
  "je",
  "jm",
  "jo",
  "jp",
  "ke",
  "kg",
  "kh",
  "ki",
  "km",
  "kn",
  "kp",
  "kr",
  "kw",
  "ky",
  "kz",
  "la",
  "lb",
  "lc",
  "li",
  "lk",
  "lr",
  "ls",
  "lt",
  "lu",
  "lv",
  "ly",
  "ma",
  "mc",
  "md",
  "me",
  "mf",
  "mg",
  "mh",
  "mk",
  "ml",
  "mm",
  "mn",
  "mo",
  "mp",
  "mq",
  "mr",
  "ms",
  "mt",
  "mu",
  "mv",
  "mw",
  "mx",
  "my",
  "mz",
  "na",
  "nc",
  "ne",
  "nf",
  "ng",
  "ni",
  "nl",
  "no",
  "np",
  "nr",
  "nu",
  "nz",
  "om",
  "pa",
  "pe",
  "pf",
  "pg",
  "ph",
  "pk",
  "pl",
  "pm",
  "pn",
  "pr",
  "ps",
  "pt",
  "pw",
  "py",
  "qa",
  "re",
  "ro",
  "rs",
  "ru",
  "rw",
  "sa",
  "sb",
  "sc",
  "sd",
  "se",
  "sg",
  "sh",
  "si",
  "sj",
  "sk",
  "sl",
  "sm",
  "sn",
  "so",
  "sr",
  "ss",
  "st",
  "su",
  "sv",
  "sx",
  "sy",
  "sz",
  "ta",
  "tc",
  "td",
  "tf",
  "tg",
  "th",
  "tj",
  "tk",
  "tl",
  "tm",
  "tn",
  "to",
  "tr",
  "tt",
  "tv",
  "tw",
  "tz",
  "ua",
  "ug",
  "uk",
  "um",
  "un",
  "us",
  "uy",
  "uz",
  "va",
  "vc",
  "ve",
  "vg",
  "vi",
  "vn",
  "vu",
  "wf",
  "ws",
  "xk",
  "xx",
  "ye",
  "yt",
  "yu",
  "za",
  "zm",
  "zw",
] as const;

/** Wine countries shown first in the wine pickers. */
export const WINE_COUNTRIES = [
  "fr",
  "it",
  "es",
  "pt",
  "mt",
  "de",
  "at",
  "gr",
  "ge",
  "hu",
  "si",
  "hr",
  "lb",
  "il",
  "us",
  "ar",
  "cl",
  "uy",
  "br",
  "au",
  "nz",
  "za",
  "cn",
];

/** Older spellings in the data → code. */
const ALIASES: Record<string, string> = {
  usa: "us",
  us: "us",
  "united states of america": "us",
  america: "us",
  uk: "gb",
  england: "gb",
  scotland: "gb",
  "great britain": "gb",
  potugal: "pt",
  holland: "nl",
  "czech republic": "cz",
  turkey: "tr",
};

export interface Country {
  code: string;
  /** English short name (the saved value). */
  value: string;
  /** Name in the app language. */
  label: string;
}

const fold = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function names(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    return null;
  }
}

const cache = new Map<string, Country[]>();

/** Every country with a flag, named in `locale`, sorted by that name. */
export function countries(locale = "pt-BR"): Country[] {
  const hit = cache.get(locale);
  if (hit) {
    return hit;
  }
  const en = names("en");
  const local = names(locale) ?? en;
  const list: Country[] = [];
  for (const code of CODES) {
    const upper = code.toUpperCase();
    const value = en?.of(upper);
    // Skip codes the browser doesn't know as a region
    if (!value || value === upper) {
      continue;
    }
    list.push({ code, value, label: local?.of(upper) ?? value });
  }
  list.sort((a, b) => a.label.localeCompare(b.label, locale));
  cache.set(locale, list);
  return list;
}

/**
 * The country of a saved value: English or local name, code or an older
 * spelling ("USA", "Loire Valley France" → France).
 */
export function findCountry(
  value: string | undefined,
  locale = "pt-BR"
): Country | undefined {
  const v = fold(value ?? "");
  if (!v) {
    return;
  }
  const list = countries(locale);
  const alias = ALIASES[v];
  const exact = list.find(
    (c) => c.code === (alias ?? v) || fold(c.value) === v || fold(c.label) === v
  );
  if (exact) {
    return exact;
  }
  // "Loire Valley France": a country name inside a longer text
  return list.find((c) => {
    const n = fold(c.value);
    return n.length > 3 && ` ${v} `.includes(` ${n} `);
  });
}

/** Search by local name, English name or code, ignoring accents. */
export function matchCountry(c: Country, query: string) {
  const q = fold(query);
  return (
    !q || fold(c.label).includes(q) || fold(c.value).includes(q) || c.code === q
  );
}
