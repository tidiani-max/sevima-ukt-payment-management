import type { Transaction } from "../types";
import { matchesTerm } from "./table.ts";

/** Newest first. Does not mutate the input. */
export const sortTransactions = (rows: Transaction[]) =>
  [...rows].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

export const matchesTransactionQuery = (t: Transaction, studentName: string | undefined, query: string) =>
  matchesTerm(query, t.id, t.eventId, t.invoiceNumber, studentName);

/** The settling payment for an invoice, if one is on record (never inferred from the invoice status alone). */
export const paymentFor = (invoiceId: string, rows: Transaction[]) =>
  sortTransactions(rows).find((t) => t.invoiceId === invoiceId && t.type === "payment.success");
