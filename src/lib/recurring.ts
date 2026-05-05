import { addDays, isValid } from "date-fns";

/**
 * Compute the next occurrence timestamp for a recurring task.
 * Returns null if the pattern is unrecognised or `from` can't be parsed.
 *
 * Patterns:
 *   - "daily" / "weekly" / "monthly" — bare cadence relative to `from`
 *   - "weekly:mon,wed,fri" — pick the next listed weekday after `from`
 */
export function nextOccurrence(pattern: string, fromIso: string | null): string | null {
  const base = fromIso ? new Date(fromIso) : new Date();
  if (!isValid(base)) return null;
  const lower = pattern.toLowerCase().trim();

  if (lower === "daily") return addDays(base, 1).toISOString();
  if (lower === "weekly") return addDays(base, 7).toISOString();
  if (lower === "monthly") return addDays(base, 30).toISOString();

  if (lower.startsWith("weekly:")) {
    const days = lower.slice("weekly:".length).split(",").map((d) => d.trim());
    const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const targets = days.map((d) => dayMap[d]).filter((n) => n !== undefined);
    if (targets.length === 0) return null;
    for (let offset = 1; offset <= 7; offset++) {
      const candidate = addDays(base, offset);
      if (targets.includes(candidate.getDay())) return candidate.toISOString();
    }
  }
  return null;
}
