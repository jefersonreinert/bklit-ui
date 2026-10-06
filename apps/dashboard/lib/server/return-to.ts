/** Only same-site relative paths ("/ia/"), never "//evil.com". */
export function safeReturnTo(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
