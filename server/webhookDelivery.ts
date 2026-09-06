import crypto from "node:crypto";
import { assertPublicHostname } from "./webhookSecurity.js";
import { buildPayload, type CanonicalEvent, type WebhookEvent } from "./webhookPayloads.js";

const TIMEOUT_MS = 6000;
const MAX_ATTEMPTS = 3;
const MAX_ERROR_LENGTH = 300;

export interface DeliverableEndpoint {
  id: string;
  destination: "discord" | "slack" | "other";
  url: string;
  signingSecret?: string;
}

export interface DeliveryResult {
  status: "success" | "failed";
  at: string;
  event?: WebhookEvent;
  statusCode?: number;
  error?: string;
}

export function generateSigningSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}

export function generateDeliveryId(): string {
  return `evt_${crypto.randomBytes(9).toString("base64url")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value: string): string {
  const s = (value || "").trim();
  return s.length > MAX_ERROR_LENGTH ? `${s.slice(0, MAX_ERROR_LENGTH - 1)}…` : s;
}

/** Permanent failures - retrying will not help. */
function isPermanent(message: string): boolean {
  return /private or reserved|could not resolve|redirect/i.test(message);
}

/**
 * POSTs one event to one endpoint with bounded retries.
 *
 * Never throws - the caller records the returned result on the endpoint so the
 * user can see delivery health in the UI.
 */
export async function deliver(
  endpoint: DeliverableEndpoint,
  event: CanonicalEvent
): Promise<DeliveryResult> {
  const body = JSON.stringify(buildPayload(endpoint.destination, event));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "ReflectionsJournal-Webhooks/1.0",
    "X-Reflections-Event": event.type,
    "X-Reflections-Delivery": event.id,
  };

  // Generic endpoints get an HMAC so the receiver can verify authenticity.
  // Discord/Slack authenticate by possession of the URL itself.
  if (endpoint.destination === "other" && endpoint.signingSecret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac("sha256", endpoint.signingSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    headers["X-Reflections-Timestamp"] = timestamp;
    headers["X-Reflections-Signature"] = `t=${timestamp},v1=${signature}`;
  }

  let lastError = "Delivery failed.";
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Re-resolve on every attempt: the allowlist/DNS answer could have
      // changed since the endpoint was saved.
      const { hostname } = new URL(endpoint.url);
      await assertPublicHostname(hostname);

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body,
        redirect: "error", // a redirect is an SSRF escape hatch
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      // We never need the response body; discard it without buffering.
      response.body?.cancel().catch(() => {});

      if (response.ok) {
        return {
          status: "success",
          at: new Date().toISOString(),
          event: event.type,
          statusCode: response.status,
        };
      }

      lastStatus = response.status;
      lastError = `Endpoint responded with ${response.status}.`;

      // 4xx is the receiver rejecting us - only 408/429 are worth retrying.
      if (response.status < 500 && response.status !== 408 && response.status !== 429) {
        break;
      }
    } catch (err: any) {
      lastError = truncate(err?.message || String(err));
      if (isPermanent(lastError)) break;
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(300 * 2 ** (attempt - 1));
    }
  }

  return {
    status: "failed",
    at: new Date().toISOString(),
    event: event.type,
    statusCode: lastStatus,
    error: truncate(lastError),
  };
}
