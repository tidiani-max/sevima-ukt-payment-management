import type { Invoice, Semester } from "../types";

/**
 * Semesters already used by existing invoices stay selectable even if the API list does not contain them
 * (for example after the API trims old terms). Order: the API list first, then any extras.
 */
export function mergeSemesters(known: Semester[], invoices: Pick<Invoice, "semester">[]): Semester[] {
  const seen = new Set(known.map((s) => s.value));
  const extra: Semester[] = [];
  for (const i of invoices) if (!seen.has(i.semester)) { seen.add(i.semester); extra.push({ value: i.semester, label: i.semester }); }
  return [...known, ...extra];
}
