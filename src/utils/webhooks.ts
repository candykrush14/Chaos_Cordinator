import { authedFetch } from '../firebase/config';
import type {
  WebhookEndpointSummary,
  WebhookEndpointInput,
  WebhookEvent,
  WebhookDeliveryResult,
} from '../types';

async function unwrap<T>(response: Response): Promise<T> {
  const raw = await response.text().catch(() => '');
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* not JSON - handled below */
  }

  if (!response.ok || !data?.success) {
    if (data?.error) throw new Error(data.error);

    // A non-JSON body on an /api route almost always means the request never
    // reached the Express API and was answered by the SPA fallback instead.
    if (raw && data === null) {
      const looksLikeHtml = /^\s*<(?:!doctype|html)/i.test(raw);
      throw new Error(
        looksLikeHtml
          ? `The API returned the app's HTML page instead of JSON (HTTP ${response.status}). ` +
            'The Express API server does not appear to be handling /api — make sure `npm run dev` ' +
            'is the process serving this port, and that no stray Vite dev server is bound to it.'
          : `Unexpected response from the server (HTTP ${response.status}).`
      );
    }
    throw new Error(`Request failed (${response.status}).`);
  }
  return data as T;
}

export async function listWebhooks(): Promise<WebhookEndpointSummary[]> {
  const res = await authedFetch('/api/webhooks');
  const data = await unwrap<{ endpoints: WebhookEndpointSummary[] }>(res);
  return data.endpoints || [];
}

export async function createWebhook(
  input: WebhookEndpointInput
): Promise<{ endpoint: WebhookEndpointSummary; signingSecret?: string }> {
  const res = await authedFetch('/api/webhooks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return unwrap<{ endpoint: WebhookEndpointSummary; signingSecret?: string }>(res);
}

export async function updateWebhook(
  id: string,
  input: WebhookEndpointInput
): Promise<WebhookEndpointSummary> {
  const res = await authedFetch(`/api/webhooks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  const data = await unwrap<{ endpoint: WebhookEndpointSummary }>(res);
  return data.endpoint;
}

export async function setWebhookEnabled(
  id: string,
  enabled: boolean
): Promise<WebhookEndpointSummary> {
  const res = await authedFetch(`/api/webhooks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
  const data = await unwrap<{ endpoint: WebhookEndpointSummary }>(res);
  return data.endpoint;
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await authedFetch(`/api/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await unwrap<{ success: true }>(res);
}

export async function testWebhook(id: string): Promise<WebhookDeliveryResult> {
  const res = await authedFetch(`/api/webhooks/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const raw = await res.text().catch(() => '');
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok || !data) throw new Error(data?.error || `Test failed (${res.status}).`);
  // A delivered-but-rejected test still returns 200 with success:false.
  return data.delivery as WebhookDeliveryResult;
}

/**
 * Tell the server something happened. The server re-reads the reflection from
 * Firestore and decides what (if anything) to send, so nothing here is trusted.
 *
 * Fire-and-forget: notification failures must never disrupt journalling.
 */
export function emitReflectionEvent(type: WebhookEvent, reflectionId: string): void {
  if (!reflectionId) return;
  void authedFetch('/api/events', {
    method: 'POST',
    body: JSON.stringify({ type, reflectionId }),
  }).catch((err) => {
    console.warn('[webhooks] event emit failed:', err);
  });
}

/**
 * Deletes are emitted *before* the Firestore delete so the server can still
 * read the document. Bounded so a slow endpoint never blocks the UI.
 */
export async function emitReflectionEventAndWait(
  type: WebhookEvent,
  reflectionId: string,
  timeoutMs = 10000
): Promise<void> {
  if (!reflectionId) return;
  try {
    await authedFetch('/api/events', {
      method: 'POST',
      body: JSON.stringify({ type, reflectionId }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    console.warn('[webhooks] event emit failed:', err);
  }
}
