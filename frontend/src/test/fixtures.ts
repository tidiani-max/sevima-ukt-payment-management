import type { Invoice, Session, Student, Transaction } from "../types";

// Test-only fixtures. They are NOT shipped in the production bundle (nothing in src/ imports this file).
export const adminSession: Session = {
  user: { id: "u1", name: "Andi Firmansyah", email: "admin.keuangan@um.ac.id", role: "ADMIN", institutionId: "i1" },
  institution: { id: "i1", code: "UM001", name: "Universitas Negeri Malang" },
};
export const studentSession: Session = {
  user: { id: "u2", name: "Nadia Putri Ramadhani", email: "nadia@student.um.ac.id", role: "STUDENT", institutionId: "i1", studentId: "s1" },
  institution: adminSession.institution,
};
export const student: Student = { id: "s1", institutionId: "i1", nim: "2310111208", name: "Nadia Putri Ramadhani", program: "Management", faculty: "FEB" };
export const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: "inv1", institutionId: "i1", invoiceNumber: "UKT-2026-0001", studentId: "s1", semester: "Ganjil 2026/2027",
  amount: 6500000, issuedAt: "2026-08-01", expiresAt: "2026-12-15", status: "UNPAID", ...over,
});
export const transaction = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1", institutionId: "i1", invoiceId: "inv1", invoiceNumber: "UKT-2026-0001", eventId: "evt_1", type: "payment.success",
  amount: 6500000, occurredAt: "2026-09-03T03:12:00.000Z", resultingStatus: "PAID", ...over,
});

/** Installs a fetch stub that answers by "METHOD /path" and records every call. */
export function stubFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const key = `${(init.method ?? "GET").toUpperCase()} ${url.replace(/^\/api/, "").split("?")[0]}`;
    const r = routes[key];
    if (!r) return new Response(JSON.stringify({ message: `unmocked ${key}` }), { status: 599 });
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  globalThis.fetch = fn as unknown as typeof fetch;
  return calls;
}
