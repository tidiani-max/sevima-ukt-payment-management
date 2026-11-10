export interface PageInfo { page: number; pages: number; total: number; from: number; to: number }

/** Slices `rows` for the requested page; the page number is clamped so filtering can never leave you on an empty page. */
export function paginate<T>(rows: T[], page: number, size: number): PageInfo & { rows: T[] } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return {
    rows: rows.slice(start, start + size), page: current, pages, total: rows.length,
    from: rows.length ? start + 1 : 0, to: Math.min(start + size, rows.length),
  };
}

/** Case-insensitive "contains" across several optional fields; an empty term matches everything. */
export function matchesTerm(term: string, ...values: (string | undefined)[]): boolean {
  const t = term.trim().toLowerCase();
  return !t || values.some((v) => v?.toLowerCase().includes(t));
}
