/** Map settings timezone string to IANA timezone identifier */
export function settingsToIANA(tz: string): string {
  if (tz.includes("Lisbon")) return "Europe/Lisbon";
  if (tz.includes("New York")) return "America/New_York";
  if (tz.includes("Sao Paulo")) return "America/Sao_Paulo";
  if (tz.includes("London")) return "Europe/London";
  if (tz.includes("Tokyo")) return "Asia/Tokyo";
  if (tz.includes("Chicago")) return "America/Chicago";
  // Fallback to local
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Format a Date for the X-axis label: shows date + time, adaptive to zoom level */
export function formatAxisLabel(date: Date, tz: string, showDate: boolean): string {
  const iana = settingsToIANA(tz);
  if (showDate) {
    // Show "MMM dd HH:mm"
    return date.toLocaleString("en-US", {
      timeZone: iana,
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  // Time only "HH:mm:ss"
  return date.toLocaleTimeString("en-US", {
    timeZone: iana,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Format for tooltip: full date + time */
export function formatTooltipDate(date: Date, tz: string): string {
  const iana = settingsToIANA(tz);
  return date.toLocaleString("en-US", {
    timeZone: iana,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Short timezone label for display */
export function tzShortLabel(tz: string): string {
  const iana = settingsToIANA(tz);
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "short" }).formatToParts(new Date());
    const tzPart = parts.find(p => p.type === "timeZoneName");
    return tzPart?.value || "";
  } catch {
    return "";
  }
}
