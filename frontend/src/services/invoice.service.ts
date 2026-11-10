import { api } from "./api";
import type { CreateInvoiceInput, Invoice, Session } from "../types";

export const listInvoices = (s: Session): Promise<Invoice[]> =>
  api<Invoice[]>(s.user.role === "ADMIN" ? "/invoices?limit=500" : "/me/invoices?limit=500");

// institutionId is intentionally NOT part of the payload; the backend derives it from the session (and rejects it if sent).
export const createInvoice = (_s: Session, input: CreateInvoiceInput): Promise<Invoice> =>
  api<Invoice>("/invoices", { method: "POST", body: JSON.stringify(input) });
