import type { Invoice, Semester, Transaction, WebhookEvent } from '@prisma/client';

const day = (d: Date) => d.toISOString().slice(0, 10);

/** BigInt -> number. Amounts are validated <= 1e12 on input and the DB column is BIGINT, so this is lossless. */
export const num = (b: bigint) => Number(b);

export const toInvoiceDto = (i: Invoice & { semester: Pick<Semester, 'value'> }) => ({
  id: i.id,
  institutionId: i.institutionId,
  invoiceNumber: i.invoiceNumber,
  studentId: i.studentId,
  semester: i.semester.value,
  amount: num(i.amount),
  issuedAt: day(i.issuedAt),
  expiresAt: day(i.expiresAt),
  status: i.status,
  paidAt: i.paidAt?.toISOString() ?? null,
});

export const toTransactionDto = (t: Transaction & { invoice: { invoiceNumber: string } }) => ({
  id: t.id,
  institutionId: t.institutionId,
  invoiceId: t.invoiceId,
  invoiceNumber: t.invoice.invoiceNumber,
  eventId: t.eventId,
  type: t.type === 'PAYMENT_SUCCESS' ? 'payment.success' : 'payment.expired',
  amount: num(t.amount),
  occurredAt: t.occurredAt.toISOString(),
  resultingStatus: t.resultingStatus,
});

/** Audit row as the monitoring page expects it. `rawBody` is intentionally not exposed in list responses. */
export const toWebhookEventDto = (e: WebhookEvent) => ({
  id: e.id,
  eventId: e.eventId ?? '',
  eventType: e.eventType ?? '',
  institutionCode: e.institutionCode,
  invoiceNumber: e.invoiceNumber ?? '',
  amount: e.amount === null ? 0 : num(e.amount),
  occurredAt: e.occurredAt?.toISOString() ?? '',
  receivedAt: e.receivedAt.toISOString(),
  signature: e.signature ?? '',
  signatureValid: e.signatureValid,
  processingStatus: e.processingStatus,
  httpStatus: e.httpStatus,
  ...(e.errorMessage ? { errorMessage: e.errorMessage } : {}),
});
