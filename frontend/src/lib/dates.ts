// Date helpers. Kept free of runtime imports so they can be unit-tested with plain Node.
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses "YYYY-MM-DD" as a *local* calendar date (avoids the off-by-one-day shift of `new Date("YYYY-MM-DD")`). */
export function parseDate(value: string): Date {
  const m = DATE_ONLY.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

/** True only for real calendar dates in YYYY-MM-DD form (rejects e.g. 2026-02-31). */
export function isValidDateString(value: string): boolean {
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** Local date as YYYY-MM-DD, suitable for <input type="date">. */
export function toDateInputValue(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Whole calendar days from `now` until `value` (negative when `value` is in the past). */
export function daysUntil(value: string, now: Date = new Date()): number {
  const target = parseDate(value);
  const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}
