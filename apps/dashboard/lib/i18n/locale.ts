/**
 * Language on screen, without React: plain modules (formatters, stores) and
 * server code can import it. On the server it is always Portuguese.
 */

export const SOURCE = "pt";

let shown = SOURCE;

export const setShownLocale = (code: string) => {
  shown = code;
};

export const shownLocale = () => shown;

/** BCP 47 locale for dates, numbers and money on screen. */
export const appLocale = () => (shown === SOURCE ? "pt-BR" : shown);
