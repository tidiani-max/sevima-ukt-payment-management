import type { PaymentStatus, ProcessingStatus } from '@prisma/client';
import type { EventType } from './payload';

/**
 * Pure payment state machine. Only UNPAID invoices may change, and only to the state the event describes.
 *
 *   UNPAID --payment.success (amount matches)--> PAID
 *   UNPAID --payment.expired-------------------> EXPIRED
 *   PAID    is terminal: a late payment.expired is ignored (409 INVALID_STATE)
 *   EXPIRED is terminal: a late payment.success is NOT auto-applied; it is flagged REQUIRES_REVIEW (409) because money
 *           may really have moved and a human must reconcile it (see DECISIONS.md #4).
 */
export type Decision =
  | { kind: 'APPLY'; to: PaymentStatus }
  | { kind: 'REJECT'; status: Exclude<ProcessingStatus, 'PROCESSED' | 'DUPLICATE' | 'INVALID_SIGNATURE' | 'INVALID_PAYLOAD' | 'INVOICE_NOT_FOUND' | 'EVENT_CONFLICT'>; httpStatus: number; message: string };

export function decide(invoice: { status: PaymentStatus; amount: number; invoiceNumber: string }, event: { type: EventType; amount: number }): Decision {
  const n = invoice.invoiceNumber;
  if (event.type === 'payment.success') {
    if (invoice.status === 'PAID') return { kind: 'REJECT', status: 'INVALID_STATE', httpStatus: 409, message: `Invoice ${n} is already paid; the event was not applied.` };
    if (invoice.status === 'EXPIRED') {
      return { kind: 'REJECT', status: 'REQUIRES_REVIEW', httpStatus: 409, message: `A payment was reported for invoice ${n}, which is already expired. It was NOT applied and needs manual reconciliation.` };
    }
    if (event.amount !== invoice.amount) {
      return { kind: 'REJECT', status: 'AMOUNT_MISMATCH', httpStatus: 422, message: `The amount ${event.amount} does not match the invoice amount ${invoice.amount}; the invoice was not marked paid.` };
    }
    return { kind: 'APPLY', to: 'PAID' };
  }
  if (invoice.status === 'PAID') return { kind: 'REJECT', status: 'INVALID_STATE', httpStatus: 409, message: `Invoice ${n} is already paid; the late expiry event was ignored.` };
  if (invoice.status === 'EXPIRED') return { kind: 'REJECT', status: 'INVALID_STATE', httpStatus: 409, message: `Invoice ${n} is already expired; the event was not applied.` };
  return { kind: 'APPLY', to: 'EXPIRED' };
}
