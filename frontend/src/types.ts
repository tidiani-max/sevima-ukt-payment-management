export type PaymentStatus = "UNPAID" | "PAID" | "EXPIRED";
export type WebhookEventType = "payment.success" | "payment.expired";
export type Role = "ADMIN" | "STUDENT";

export interface Institution { id: string; code: string; name: string }
export interface User {
  id: string; name: string; email: string; role: Role;
  institutionId: string; studentId?: string;
}
export interface Student {
  id: string; institutionId: string; nim: string; name: string; program: string; faculty: string;
}
export interface Invoice {
  id: string; institutionId: string; invoiceNumber: string; studentId: string;
  semester: string; amount: number; issuedAt: string; expiresAt: string; status: PaymentStatus;
}
export interface Transaction {
  id: string; institutionId: string; invoiceId: string; invoiceNumber: string; eventId: string;
  type: WebhookEventType; amount: number; occurredAt: string; resultingStatus: PaymentStatus;
}
export type ProcessingStatus =
  | "PROCESSED" | "DUPLICATE" | "INVALID_SIGNATURE" | "INVALID_PAYLOAD" | "INVOICE_NOT_FOUND" | "AMOUNT_MISMATCH" | "INVALID_STATE"
  | "REQUIRES_REVIEW" | "EVENT_CONFLICT"
  /** Only ever appears in a simulator response: such events belong to no institution and are never listed. */
  | "UNKNOWN_INSTITUTION";
export interface WebhookEvent {
  eventId: string; eventType: WebhookEventType; institutionCode: string; invoiceNumber: string; amount: number;
  /** When the payment gateway generated the event (taken from the payload's `occurred_at`). */
  occurredAt: string;
  /** When this application received the HTTP request. Always set by the backend, never by the gateway. */
  receivedAt: string;
  signature: string;
  /** Result of the backend's HMAC check. The browser never computes or verifies signatures. */
  signatureValid: boolean;
  processingStatus: ProcessingStatus; httpStatus: number;
  /** Rejection / failure reason supplied by the backend; absent for PROCESSED events. */
  errorMessage?: string;
}
/** An academic term an invoice can be issued for. `value` is the API value; `label` is for display only. */
export interface Semester { value: string; label: string; current?: boolean }
export interface CreateInvoiceInput {
  studentId: string; invoiceNumber: string; semester: string; amount: number; issuedAt: string; expiresAt: string;
}
/** Session user only. institutionId always comes from the authenticated account, never from UI input. */
export interface Session { user: User; institution: Institution }
