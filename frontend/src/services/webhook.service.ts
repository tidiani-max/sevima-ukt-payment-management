import { api } from "./api";
import type { ProcessingStatus, Session, WebhookEvent, WebhookEventType } from "../types";

export const WEBHOOK_PATH = "POST /api/webhooks/payment";
export const SIGNATURE_HEADER = "X-Signature";

export interface WebhookPayload {
  event_id: string; event_type: WebhookEventType; institution_code: string;
  invoice_number: string; amount: number; occurred_at: string;
}
export const buildPayload = (p: {
  eventId: string; eventType: WebhookEventType; institutionCode: string; invoiceNumber: string; amount: number; occurredAt: string;
}): WebhookPayload => ({
  event_id: p.eventId, event_type: p.eventType, institution_code: p.institutionCode,
  invoice_number: p.invoiceNumber, amount: p.amount, occurred_at: p.occurredAt,
});

/** Body of the dev-only simulator endpoint. The backend signs `payload` itself; `tamperSignature` asks it to corrupt the signature. */
export interface SimulationRequest { payload: WebhookPayload; tamperSignature: boolean }

export interface SimulationResult {
  /** True when the backend delivered the request to the webhook endpoint. */
  sent: boolean;
  httpStatus?: number; processingStatus?: ProcessingStatus; signature?: string; message: string;
}

/**
 * The browser never holds HMAC secrets. The backend's development-only simulator signs the exact serialised body with the
 * institution's secret (HMAC-SHA256), POSTs it to the real webhook endpoint and returns the real outcome.
 */
export const simulateWebhook = (req: SimulationRequest): Promise<SimulationResult> =>
  api<SimulationResult>("/dev/webhooks/simulate", { method: "POST", body: JSON.stringify(req) });

/** Persisted audit rows for the signed-in institution only (events that belong to no institution are never returned). */
export const listWebhookEvents = (_s: Session): Promise<WebhookEvent[]> => api<WebhookEvent[]>("/webhooks/events?limit=500");
