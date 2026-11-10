import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, csrfToken, UNAUTHORIZED_EVENT } from "./api";
import { getSession } from "./auth.service";
import { createInvoice, listInvoices } from "./invoice.service";
import { simulateWebhook } from "./webhook.service";
import { adminSession, invoice, stubFetch, studentSession } from "../test/fixtures";

afterEach(() => { document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT"; });

describe("api client", () => {
  it("sends credentials same-origin, never puts tokens in storage, and adds the CSRF header only on writes", async () => {
    document.cookie = "XSRF-TOKEN=tok%2F123";
    const calls = stubFetch({ "GET /invoices": { body: [] }, "POST /invoices": { status: 201, body: invoice() } });
    await api("/invoices");
    await api("/invoices", { method: "POST", body: "{}" });
    expect(calls[0].init.credentials).toBe("same-origin");
    expect((calls[0].init.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
    expect((calls[1].init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("tok/123");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("reads the CSRF cookie among others", () => {
    expect(csrfToken("a=1; XSRF-TOKEN=abc; b=2")).toBe("abc");
    expect(csrfToken("a=1")).toBeUndefined();
  });

  it("maps error responses to ApiError with the server message", async () => {
    stubFetch({ "POST /invoices": { status: 409, body: { message: "This invoice number is already used at your institution." } } });
    await expect(createInvoice(adminSession, { studentId: "s", invoiceNumber: "x", semester: "y", amount: 1, issuedAt: "2026-01-01", expiresAt: "2026-02-01" }))
      .rejects.toMatchObject({ status: 409, message: "This invoice number is already used at your institution." });
  });

  it("announces an expired session (401) to the app, but not for auth endpoints", async () => {
    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    stubFetch({ "GET /invoices": { status: 401, body: { message: "Authentication required." } }, "GET /auth/me": { status: 401, body: {} } });
    await expect(api("/invoices")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await getSession()).toBeNull(); // restoring a session when signed out is normal, not an expiry
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  });

  it("handles empty (204) bodies", async () => {
    stubFetch({ "POST /auth/logout": { status: 204 } });
    await expect(api("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});

describe("services call the right endpoints (tenant comes from the session, never the request)", () => {
  it("admins and students use different invoice routes", async () => {
    const calls = stubFetch({ "GET /invoices": { body: [invoice()] }, "GET /me/invoices": { body: [invoice()] } });
    await listInvoices(adminSession);
    await listInvoices(studentSession);
    expect(calls.map((c) => c.url)).toEqual(["/api/invoices?limit=500", "/api/me/invoices?limit=500"]);
  });

  it("createInvoice never sends institutionId", async () => {
    const calls = stubFetch({ "POST /invoices": { status: 201, body: invoice() } });
    await createInvoice(adminSession, { studentId: "s1", invoiceNumber: "N", semester: "Ganjil 2026/2027", amount: 5, issuedAt: "2026-11-09", expiresAt: "2027-01-01" });
    expect(String(calls[0].init.body)).not.toMatch(/institution/i);
  });

  it("the simulator sends the payload and the tamper flag, and no secret or signature of its own", async () => {
    const calls = stubFetch({ "POST /dev/webhooks/simulate": { body: { sent: true, httpStatus: 200, processingStatus: "PROCESSED", message: "ok" } } });
    const payload = { event_id: "e", event_type: "payment.success" as const, institution_code: "UM001", invoice_number: "N", amount: 1, occurred_at: "2026-11-09T10:00:00+07:00" };
    const r = await simulateWebhook({ payload, tamperSignature: true });
    expect(r.processingStatus).toBe("PROCESSED");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ payload, tamperSignature: true });
  });
});
