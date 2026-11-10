// Run with: npm test   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, isValidDateString, parseDate, toDateInputValue } from "./dates.ts";
import { fmtDate, rupiah, semesterLabel, statusLabel } from "./format.ts";
import { friendlyError } from "./errors.ts";
import { paginate } from "./table.ts";
import {
  dueState, dueLabel, filterInvoices, parseAmount, pickCurrentInvoice, suggestInvoiceNumber, summarizeInvoices, validateInvoiceForm,
  type InvoiceFormValues,
} from "./invoices.ts";
import { paymentFor, sortTransactions } from "./transactions.ts";
import type { Invoice, Student, Transaction } from "../types";

const inv = (n: string, studentId: string, status: Invoice["status"], amount = 1_000_000, expiresAt = "2026-12-15", issuedAt = "2026-08-01"): Invoice =>
  ({ id: n, institutionId: "i", invoiceNumber: n, studentId, semester: "Ganjil 2026/2027", amount, issuedAt, expiresAt, status });
const students: Student[] = [
  { id: "s1", institutionId: "i", nim: "2310111208", name: "Nadia Putri", program: "Management", faculty: "Economics" },
  { id: "s2", institutionId: "i", nim: "2210501042", name: "Farhan Akbar", program: "Informatics", faculty: "Engineering" },
];
const studentOf = (id: string) => students.find((s) => s.id === id);
const all = [inv("UKT-1", "s1", "UNPAID", 6_500_000), inv("UKT-2", "s2", "PAID", 7_250_000), inv("UKT-3", "s1", "EXPIRED", 5_750_000), inv("UKT-4", "s2", "PAID", 1_000_000)];

test("dates: date-only strings are local calendar dates, not UTC", () => {
  const d = parseDate("2026-12-15");
  assert.equal([d.getFullYear(), d.getMonth(), d.getDate()].join("-"), "2026-11-15");
  assert.equal(toDateInputValue(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(fmtDate("2026-12-15"), "15 Des 2026");
  assert.equal(fmtDate("garbage"), "—");
});
test("dates: validity and day counting", () => {
  assert.ok(isValidDateString("2026-02-28"));
  assert.ok(!isValidDateString("2026-02-31"));
  assert.ok(!isValidDateString("15/12/2026"));
  const now = new Date(2026, 10, 8, 23, 59);
  assert.equal(daysUntil("2026-11-08", now), 0);
  assert.equal(daysUntil("2026-11-09", now), 1);
  assert.equal(daysUntil("2026-11-07", now), -1);
});
test("format: currency, labels, semester translation (value untouched)", () => {
  assert.match(rupiah(6_500_000), /Rp\s?6\.500\.000/);
  assert.equal(statusLabel("EXPIRED"), "Kedaluwarsa");
  assert.equal(semesterLabel("Ganjil 2026/2027"), "Semester Ganjil 2026/2027");
  assert.equal(semesterLabel("Genap 2025/2026"), "Semester Genap 2025/2026");
  assert.equal(semesterLabel("Odd 2027"), "Odd 2027");
});

test("summary: counts and amounts are derived from data and expired is not counted as unpaid/paid", () => {
  const s = summarizeInvoices(all);
  assert.deepEqual([s.total, s.paid, s.unpaid, s.expired], [4, 2, 1, 1]);
  assert.equal(s.collected, 8_250_000);
  assert.equal(s.outstanding, 6_500_000);
  assert.equal(s.expiredAmount, 5_750_000);
  assert.equal(s.billed, 20_500_000);
  assert.deepEqual(summarizeInvoices([]), { total: 0, paid: 0, unpaid: 0, expired: 0, collected: 0, outstanding: 0, expiredAmount: 0, billed: 0 });
});

test("filter: search by invoice number, student name, NIM; combines with status", () => {
  const ids = (rows: Invoice[]) => rows.map((i) => i.invoiceNumber);
  assert.deepEqual(ids(filterInvoices(all, studentOf, "ALL", "ukt-2")), ["UKT-2"]);
  assert.deepEqual(ids(filterInvoices(all, studentOf, "ALL", "nadia")), ["UKT-1", "UKT-3"]);
  assert.deepEqual(ids(filterInvoices(all, studentOf, "ALL", "2210501042")), ["UKT-2", "UKT-4"]);
  assert.deepEqual(ids(filterInvoices(all, studentOf, "EXPIRED", "nadia")), ["UKT-3"]);
  assert.deepEqual(ids(filterInvoices(all, studentOf, "PAID", "nadia")), []);
  assert.equal(filterInvoices(all, studentOf, "ALL", "   ").length, 4);
  assert.equal(filterInvoices(all, () => undefined, "ALL", "nadia").length, 0);
});

test("due state: only UNPAID invoices; overdue UNPAID stays UNPAID", () => {
  const now = new Date(2026, 10, 8);
  assert.equal(dueState({ status: "PAID", expiresAt: "2026-11-09" }, now), null);
  assert.equal(dueState({ status: "EXPIRED", expiresAt: "2026-10-01" }, now), null);
  assert.equal(dueState({ status: "UNPAID", expiresAt: "2026-12-15" }, now), null);
  assert.deepEqual(dueState({ status: "UNPAID", expiresAt: "2026-11-22" }, now), { kind: "soon", days: 14 });
  assert.deepEqual(dueState({ status: "UNPAID", expiresAt: "2026-11-05" }, now), { kind: "overdue", days: 3 });
  assert.equal(dueLabel({ kind: "soon", days: 0 }), "Kedaluwarsa hari ini");
  assert.equal(dueLabel({ kind: "soon", days: 1 }), "Kedaluwarsa besok");
  assert.equal(dueLabel({ kind: "soon", days: 5 }), "Kedaluwarsa dalam 5 hari");
  assert.equal(dueLabel({ kind: "overdue", days: 1 }), "Melewati tanggal kedaluwarsa 1 hari");
});

test("current invoice: soonest-expiring unpaid, else latest issued, else null", () => {
  const a = inv("A", "s1", "UNPAID", 1, "2026-12-20"), b = inv("B", "s1", "UNPAID", 1, "2026-11-30");
  assert.equal(pickCurrentInvoice([a, b])?.invoiceNumber, "B");
  const old = inv("OLD", "s1", "PAID", 1, "2026-03-15", "2026-02-01"), recent = inv("NEW", "s1", "EXPIRED", 1, "2026-10-15", "2026-08-01");
  assert.equal(pickCurrentInvoice([old, recent])?.invoiceNumber, "NEW");
  assert.equal(pickCurrentInvoice([]), null);
});

const good: InvoiceFormValues = { studentId: "s1", invoiceNumber: "UKT-2026-0099", semester: "Ganjil 2026/2027", amount: "6500000", issuedAt: "2026-11-01", expiresAt: "2026-12-01" };
const ctx = { studentIds: ["s1", "s2"], existingInvoiceNumbers: ["UKT-2026-0001", "UKT-2026-0002"] };
test("form: valid input has no errors", () => assert.deepEqual(validateInvoiceForm(good, ctx), {}));
test("form: every required field is reported", () => {
  const e = validateInvoiceForm({ studentId: "", invoiceNumber: " ", semester: "", amount: "", issuedAt: "", expiresAt: "" }, ctx);
  assert.deepEqual(Object.keys(e).sort(), ["amount", "expiresAt", "invoiceNumber", "issuedAt", "semester", "studentId"]);
});
test("form: student must be a known student", () => assert.ok(validateInvoiceForm({ ...good, studentId: "ghost" }, ctx).studentId));
test("form: duplicate invoice number (trimmed, case-insensitive)", () => {
  assert.ok(validateInvoiceForm({ ...good, invoiceNumber: "UKT-2026-0001" }, ctx).invoiceNumber);
  assert.ok(validateInvoiceForm({ ...good, invoiceNumber: "  ukt-2026-0002 " }, ctx).invoiceNumber);
  assert.equal(validateInvoiceForm({ ...good, invoiceNumber: "UKT-2026-0003" }, ctx).invoiceNumber, undefined);
});
test("form: amount must be a whole number greater than zero", () => {
  for (const amount of ["0", "000"]) assert.match(validateInvoiceForm({ ...good, amount }, ctx).amount ?? "", /lebih besar dari nol/);
  for (const amount of ["-5", "6500000.50", "6,5", "abc"]) assert.match(validateInvoiceForm({ ...good, amount }, ctx).amount ?? "", /hanya angka/);
  assert.equal(validateInvoiceForm({ ...good, amount: "1" }, ctx).amount, undefined);
  assert.ok(validateInvoiceForm({ ...good, amount: "99999999999999999999" }, ctx).amount);
  assert.equal(parseAmount("650000050"), 650000050);
  assert.ok(Number.isNaN(parseAmount("6500000.50")));
});
test("form: expiration may equal but not precede issue date; dates must be real", () => {
  assert.equal(validateInvoiceForm({ ...good, expiresAt: good.issuedAt }, ctx).expiresAt, undefined);
  assert.match(validateInvoiceForm({ ...good, expiresAt: "2026-10-31" }, ctx).expiresAt ?? "", /lebih awal dari tanggal terbit/);
  assert.match(validateInvoiceForm({ ...good, expiresAt: "2026-02-31" }, ctx).expiresAt ?? "", /valid/);
  assert.match(validateInvoiceForm({ ...good, issuedAt: "nope" }, ctx).issuedAt ?? "", /valid/);
});
test("invoice number suggestion never collides", () => {
  assert.equal(suggestInvoiceNumber([], 2026), "UKT-2026-0001");
  assert.equal(suggestInvoiceNumber(["UKT-2026-0001", "UKT-2026-0007", "OTHER-1"], 2026), "UKT-2026-0008");
  assert.equal(suggestInvoiceNumber(["UKT-2025-0009"], 2026), "UKT-2026-0001");
});

test("pagination clamps the page and reports the visible range", () => {
  const rows = Array.from({ length: 23 }, (_, i) => i);
  const p = paginate(rows, 3, 10);
  assert.deepEqual([p.page, p.pages, p.from, p.to, p.rows.length], [3, 3, 21, 23, 3]);
  assert.equal(paginate(rows, 99, 10).page, 3);
  assert.equal(paginate(rows, -4, 10).page, 1);
  assert.deepEqual(paginate([], 1, 10), { rows: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
});

test("friendlyError never leaks raw technical text", () => {
  class Api extends Error { status: number; constructor(status: number, m: string) { super(m); this.status = status; } }
  assert.match(friendlyError(new TypeError("Failed to fetch")), /Tidak dapat terhubung ke server/);
  assert.equal(friendlyError(new Error("boom: stack at x.js:1")), "Terjadi kesalahan. Silakan coba lagi.");
  assert.match(friendlyError(new Api(500, "SQLSTATE[23000] constraint")), /Server mengalami masalah/);
  assert.match(friendlyError(new Api(401, "Unauthorized")), /Sesi Anda telah berakhir/);
  assert.match(friendlyError(new Api(404, "Not Found")), /tidak ditemukan/);
  assert.equal(friendlyError(new Api(409, "This invoice number is already in use.")), "This invoice number is already in use.");
  assert.equal(friendlyError(new Api(401, "x"), { 401: "Incorrect email or password." }), "Incorrect email or password.");
});

test("transactions: newest first; payment lookup uses real success events only", () => {
  const t = (id: string, invoiceId: string, type: Transaction["type"], occurredAt: string): Transaction =>
    ({ id, institutionId: "i", invoiceId, invoiceNumber: invoiceId, eventId: "e" + id, type, amount: 1, occurredAt, resultingStatus: type === "payment.success" ? "PAID" : "EXPIRED" });
  const rows = [t("1", "A", "payment.success", "2026-09-01T10:00:00+07:00"), t("2", "B", "payment.expired", "2026-10-01T10:00:00+07:00"), t("3", "C", "payment.success", "2026-09-15T10:00:00+07:00")];
  assert.deepEqual(sortTransactions(rows).map((r) => r.id), ["2", "3", "1"]);
  assert.equal(rows[0].id, "1"); // input untouched
  assert.equal(paymentFor("A", rows)?.id, "1");
  assert.equal(paymentFor("B", rows), undefined);
  assert.equal(paymentFor("Z", rows), undefined);
});
