import type { PaymentStatus, ProcessingStatus, WebhookEventType } from "../types";
import { parseDate } from "./dates.ts";

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
/** Formats an amount in Indonesian rupiah, e.g. "Rp 6.500.000". */
export const rupiah = (n: number) => money.format(n);

export function fmtDate(iso: string): string {
  const d = parseDate(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
export function fmtDateTime(iso: string, seconds = false): string {
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}),
  });
}

export const STATUSES: PaymentStatus[] = ["PAID", "UNPAID", "EXPIRED"];
const STATUS_LABEL: Record<PaymentStatus, string> = { PAID: "Lunas", UNPAID: "Belum Bayar", EXPIRED: "Kedaluwarsa" };
export const statusLabel = (s: PaymentStatus) => STATUS_LABEL[s] ?? s;

const EVENT_LABEL: Record<WebhookEventType, string> = { "payment.success": "Pembayaran berhasil", "payment.expired": "Pembayaran kedaluwarsa" };
export const eventLabel = (t: WebhookEventType) => EVENT_LABEL[t] ?? t;

/** Human-readable meaning of each webhook processing outcome (derived from the status; the backend supplies no free-text error). */
export const PROCESSING_INFO: Record<ProcessingStatus, { label: string; detail: string }> = {
  PROCESSED: { label: "Diproses", detail: "" },
  DUPLICATE: { label: "Duplikat", detail: "ID event ini sudah pernah diproses, sehingga pengiriman ulang diabaikan." },
  INVALID_SIGNATURE: { label: "Signature tidak valid", detail: "Signature tidak cocok, sehingga event ditolak." },
  INVOICE_NOT_FOUND: { label: "Tagihan tidak ditemukan", detail: "Tidak ada tagihan dengan nomor ini di institusi tersebut." },
  INVALID_PAYLOAD: { label: "Payload tidak valid", detail: "Request body tidak memuat field yang wajib atau berisi nilai yang tidak valid." },
  AMOUNT_MISMATCH: { label: "Jumlah tidak sesuai", detail: "Jumlah yang dibayar berbeda dengan jumlah tagihan, sehingga tagihan tidak ditandai lunas." },
  INVALID_STATE: { label: "Status tidak valid", detail: "Tagihan sudah terselesaikan, sehingga event diabaikan." },
  REQUIRES_REVIEW: { label: "Perlu ditinjau", detail: "Pembayaran dilaporkan untuk tagihan yang sudah kedaluwarsa. Pembayaran tidak diterapkan dan perlu rekonsiliasi manual." },
  EVENT_CONFLICT: { label: "Konflik ID event", detail: "ID event ini sudah digunakan dengan isi yang berbeda." },
  UNKNOWN_INSTITUTION: { label: "Institusi tidak dikenal", detail: "Kode institusi tidak dikenali." },
};
// UNKNOWN_INSTITUTION events are never listed (they belong to no tenant), so it is not offered as a filter.
export const PROCESSING_STATUSES = (Object.keys(PROCESSING_INFO) as ProcessingStatus[]).filter((s) => s !== "UNKNOWN_INSTITUTION");

/**
 * Semester values are sent to / received from the API as-is (e.g. "Ganjil 2026/2027").
 * Only the displayed label is translated, so the API contract is untouched.
 */
export const semesterLabel = (s: string) => s.replace(/^Ganjil\b/i, "Semester Ganjil").replace(/^Genap\b/i, "Semester Genap");

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  // Quote every cell and neutralise spreadsheet formula injection (OWASP CSV injection).
  const cell = (v: string | number) => {
    const s = String(v).replace(/"/g, '""');
    return `"${/^[=+\-@\t\r]/.test(s) ? "'" + s : s}"`;
  };
  const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** What the transaction did, in plain words (the invoice status it produced is shown separately). */
export const TRANSACTION_RESULT: Record<WebhookEventType, string> = {
  "payment.success": "Pembayaran tercatat: tagihan telah dilunasi.",
  "payment.expired": "Kedaluwarsa tercatat: batas waktu pembayaran berakhir tanpa pembayaran.",
};
