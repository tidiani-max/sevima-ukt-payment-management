import type { Invoice, PaymentStatus, Student } from "../types";
import { daysUntil, isValidDateString } from "./dates.ts";
import { matchesTerm } from "./table.ts";

// ---------- Statistics (always derived from the loaded invoices) ----------
export interface InvoiceSummary {
  total: number; paid: number; unpaid: number; expired: number;
  /** Sum of PAID invoice amounts. */ collected: number;
  /** Sum of UNPAID invoice amounts (expired invoices are reported separately). */ outstanding: number;
  expiredAmount: number; billed: number;
}
export function summarizeInvoices(invoices: Invoice[]): InvoiceSummary {
  const s: InvoiceSummary = { total: invoices.length, paid: 0, unpaid: 0, expired: 0, collected: 0, outstanding: 0, expiredAmount: 0, billed: 0 };
  for (const i of invoices) {
    s.billed += i.amount;
    if (i.status === "PAID") { s.paid++; s.collected += i.amount; }
    else if (i.status === "UNPAID") { s.unpaid++; s.outstanding += i.amount; }
    else if (i.status === "EXPIRED") { s.expired++; s.expiredAmount += i.amount; }
  }
  return s;
}

// ---------- Search + status filter (they combine) ----------
export type InvoiceFilter = "ALL" | PaymentStatus;
export const matchesInvoiceQuery = (i: Invoice, student: Student | undefined, query: string) =>
  matchesTerm(query, i.invoiceNumber, student?.name, student?.nim);

export function filterInvoices(invoices: Invoice[], studentOf: (id: string) => Student | undefined, status: InvoiceFilter, query: string): Invoice[] {
  return invoices.filter((i) => (status === "ALL" || i.status === status) && matchesInvoiceQuery(i, studentOf(i.studentId), query));
}

// ---------- Expiration awareness ----------
export const SOON_DAYS = 14;
export interface DueState { kind: "soon" | "overdue"; days: number }
/**
 * Only UNPAID invoices can be "due". The invoice's status is never rewritten here: an UNPAID invoice whose date has
 * passed stays UNPAID (the backend/webhook decides when it becomes EXPIRED); it is just flagged as past its date.
 */
export function dueState(invoice: Pick<Invoice, "status" | "expiresAt">, now: Date = new Date()): DueState | null {
  if (invoice.status !== "UNPAID") return null;
  const days = daysUntil(invoice.expiresAt, now);
  if (days < 0) return { kind: "overdue", days: -days };
  return days <= SOON_DAYS ? { kind: "soon", days } : null;
}
export function dueLabel(d: DueState): string {
  const n = (x: number) => `${x} hari`;
  if (d.kind === "overdue") return `Melewati tanggal kedaluwarsa ${n(d.days)}`;
  return d.days === 0 ? "Kedaluwarsa hari ini" : d.days === 1 ? "Kedaluwarsa besok" : `Kedaluwarsa dalam ${n(d.days)}`;
}

/** The invoice a student should see first: the unpaid one expiring soonest, otherwise the most recently issued. */
export function pickCurrentInvoice(invoices: Invoice[]): Invoice | null {
  if (!invoices.length) return null;
  const unpaid = invoices.filter((i) => i.status === "UNPAID").sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  if (unpaid.length) return unpaid[0];
  return [...invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.expiresAt.localeCompare(a.expiresAt))[0];
}

// ---------- Create-invoice form ----------
export interface InvoiceFormValues { studentId: string; invoiceNumber: string; semester: string; amount: string; issuedAt: string; expiresAt: string }
export type InvoiceFormErrors = Partial<Record<keyof InvoiceFormValues, string>>;
export const MAX_INVOICE_NUMBER_LENGTH = 40;

export const parseAmount = (raw: string) => (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN);

export function validateInvoiceForm(v: InvoiceFormValues, ctx: { studentIds: string[]; existingInvoiceNumbers: string[] }): InvoiceFormErrors {
  const e: InvoiceFormErrors = {};
  if (!v.studentId) e.studentId = "Pilih mahasiswa.";
  else if (!ctx.studentIds.includes(v.studentId)) e.studentId = "Pilih mahasiswa yang valid dari daftar.";

  const no = v.invoiceNumber.trim();
  if (!no) e.invoiceNumber = "Masukkan nomor tagihan.";
  else if (no.length > MAX_INVOICE_NUMBER_LENGTH) e.invoiceNumber = `Nomor tagihan maksimal ${MAX_INVOICE_NUMBER_LENGTH} karakter.`;
  else if (ctx.existingInvoiceNumbers.some((x) => x.trim().toLowerCase() === no.toLowerCase())) e.invoiceNumber = "Nomor tagihan ini sudah digunakan di institusi Anda.";

  if (!v.semester) e.semester = "Pilih semester akademik.";

  if (!v.amount.trim()) e.amount = "Masukkan jumlah UKT.";
  else {
    const amount = parseAmount(v.amount);
    if (Number.isNaN(amount)) e.amount = "Gunakan hanya angka, tanpa desimal atau simbol.";
    else if (amount <= 0) e.amount = "Jumlah harus lebih besar dari nol.";
    else if (!Number.isSafeInteger(amount)) e.amount = "Jumlah terlalu besar.";
  }

  if (!v.issuedAt) e.issuedAt = "Pilih tanggal terbit.";
  else if (!isValidDateString(v.issuedAt)) e.issuedAt = "Masukkan tanggal terbit yang valid.";

  if (!v.expiresAt) e.expiresAt = "Pilih tanggal kedaluwarsa.";
  else if (!isValidDateString(v.expiresAt)) e.expiresAt = "Masukkan tanggal kedaluwarsa yang valid.";
  else if (!e.issuedAt && v.expiresAt < v.issuedAt) e.expiresAt = "Tanggal kedaluwarsa tidak boleh lebih awal dari tanggal terbit.";
  return e;
}

/** Suggests the next free "UKT-<year>-NNNN" number (highest existing sequence + 1, never a duplicate). */
export function suggestInvoiceNumber(existing: string[], year: number): string {
  const prefix = `UKT-${year}-`;
  const taken = new Set(existing.map((x) => x.toLowerCase()));
  let seq = existing.reduce((max, x) => {
    const m = new RegExp(`^${prefix}(\\d+)$`, "i").exec(x);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0) + 1;
  let candidate = prefix + String(seq).padStart(4, "0");
  while (taken.has(candidate.toLowerCase())) candidate = prefix + String(++seq).padStart(4, "0");
  return candidate;
}
