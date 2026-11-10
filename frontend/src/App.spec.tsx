import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";
import { UNAUTHORIZED_EVENT } from "./services/api";
import { act } from "react";
import { adminSession, invoice, stubFetch, studentSession, transaction } from "./test/fixtures";

const adminRoutes = {
  "GET /auth/me": { body: adminSession },
  "GET /config": { body: { mockGatewayEnabled: true, environment: "development" } },
  "GET /invoices": { body: [invoice(), invoice({ id: "inv2", invoiceNumber: "UKT-2026-0002", status: "PAID" })] },
  "GET /students": { body: [] },
  "GET /transactions": { body: [transaction()] },
};

describe("App session handling", () => {
  it("shows a loading state while restoring, then the dashboard for a restored admin session (browser refresh)", async () => {
    stubFetch(adminRoutes);
    render(<App />);
    expect(screen.getByText(/memulihkan sesi anda/i)).toBeInTheDocument();
    expect(await screen.findByText("Admin Keuangan")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /simulator gateway/i })).toBeInTheDocument();
  });

  it("falls back to the sign-in screen when there is no session", async () => {
    stubFetch({ "GET /auth/me": { status: 401, body: { message: "Authentication required." } } });
    render(<App />);
    expect(await screen.findByRole("heading", { name: /masuk ke akun anda/i })).toBeInTheDocument();
  });

  it("hides the Gateway Simulator when the backend has the mock gateway disabled", async () => {
    stubFetch({ ...adminRoutes, "GET /config": { body: { mockGatewayEnabled: false, environment: "production" } } });
    render(<App />);
    await screen.findByText("Admin Keuangan");
    await waitFor(() => expect(screen.queryByRole("button", { name: /simulator gateway/i })).not.toBeInTheDocument());
  });

  it("students get the student navigation and no administrator pages", async () => {
    stubFetch({ "GET /auth/me": { body: studentSession }, "GET /me/invoices": { body: [invoice()] }, "GET /me/transactions": { body: [] }, "GET /me/student": { body: { id: "s1", institutionId: "i1", nim: "1", name: "Nadia", program: "M", faculty: "F" } } });
    render(<App />);
    expect(await screen.findByRole("button", { name: /tagihan saya/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pemantauan webhook/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simulator gateway/i })).not.toBeInTheDocument();
  });

  it("returns to sign-in with an explanation when the session expires mid-use", async () => {
    stubFetch(adminRoutes);
    render(<App />);
    await screen.findByText("Admin Keuangan");
    act(() => { window.dispatchEvent(new Event(UNAUTHORIZED_EVENT)); });
    expect(await screen.findByText(/sesi anda telah berakhir/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /masuk ke akun anda/i })).toBeInTheDocument();
  });
});
