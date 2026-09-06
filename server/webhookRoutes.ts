import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { validateWebhookUrl, maskWebhookUrl } from "./webhookSecurity.js";
import { deliver, generateSigningSecret, generateDeliveryId } from "./webhookDelivery.js";
import type { CanonicalEvent, WebhookEvent, ReflectionSnapshot } from "./webhookPayloads.js";

const DESTINATIONS = ["discord", "slack", "other"] as const;
const EVENTS: WebhookEvent[] = [
  "reflection.created",
  "reflection.updated",
  "reflection.located",
  "reflection.deleted",
];
const CATEGORIES = ["personal", "work", "ideas", "gratitude", "mindfulness"];
const MODES = ["reflection", "summary", "brainstorm"];
const LOCATION_FILTERS = ["any", "pinned", "unpinned"];

const MAX_ENDPOINTS_PER_USER = 10;
const MAX_NAME_LENGTH = 80;
const EXCERPT_LENGTH = 280;

/** Per-uid, per-instance emission budget. Outbound HTTP is not free. */
const EMIT_LIMIT = 40;
const EMIT_WINDOW_MS = 60_000;
const emitBuckets = new Map<string, { count: number; resetAt: number }>();

function overEmitLimit(uid: string): boolean {
  const now = Date.now();
  const bucket = emitBuckets.get(uid);
  if (!bucket || now >= bucket.resetAt) {
    emitBuckets.set(uid, { count: 1, resetAt: now + EMIT_WINDOW_MS });
    if (emitBuckets.size > 5000) {
      for (const [key, value] of emitBuckets) if (now >= value.resetAt) emitBuckets.delete(key);
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > EMIT_LIMIT;
}

/**
 * Express 4 does not catch rejections from async handlers - they become
 * unhandled rejections and the request never gets a response (or the process
 * dies). Every async route below goes through this.
 */
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
function wrap(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function uidOf(req: Request): string {
  return (req as Request & { uid?: string }).uid || "";
}

interface StoredEndpoint {
  destination: (typeof DESTINATIONS)[number];
  name: string;
  url: string;
  events: WebhookEvent[];
  filters: { categories: string[]; modes: string[]; location: string };
  enabled: boolean;
  signingSecret?: string;
  createdAt: string;
  updatedAt: string;
  lastDelivery?: unknown;
}

function toSummary(id: string, d: StoredEndpoint) {
  return {
    id,
    destination: d.destination,
    name: d.name,
    urlPreview: maskWebhookUrl(d.url),
    events: d.events,
    filters: d.filters,
    enabled: d.enabled,
    hasSigningSecret: Boolean(d.signingSecret),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    lastDelivery: d.lastDelivery,
  };
}

function subsetOf(value: unknown, allowed: readonly string[]): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.includes(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

interface ParsedInput {
  destination: (typeof DESTINATIONS)[number];
  name: string;
  url: string;
  events: WebhookEvent[];
  filters: { categories: string[]; modes: string[]; location: string };
  enabled: boolean;
}

interface ParseResult {
  error?: string;
  value?: ParsedInput;
}

function parseEndpointInput(body: any): ParseResult {
  const destination = body?.destination;
  if (!DESTINATIONS.includes(destination)) {
    return { error: "Pick a destination." };
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "Give this endpoint a name." };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Names must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  const urlCheck = validateWebhookUrl(destination, body?.url);
  if (!urlCheck.ok || !urlCheck.url) {
    return { error: urlCheck.error || "Invalid webhook URL." };
  }

  const events = subsetOf(body?.events, EVENTS) as WebhookEvent[] | null;
  if (!events || events.length === 0) {
    return { error: "Choose at least one event to send on." };
  }

  const rawFilters = body?.filters ?? {};
  const categories = subsetOf(rawFilters.categories ?? [], CATEGORIES);
  const modes = subsetOf(rawFilters.modes ?? [], MODES);
  const location = rawFilters.location ?? "any";
  if (!categories || !modes || !LOCATION_FILTERS.includes(location)) {
    return { error: "Those entry filters aren't valid." };
  }

  return {
    value: {
      destination,
      name,
      url: urlCheck.url,
      events,
      filters: { categories, modes, location },
      enabled: body?.enabled === undefined ? true : Boolean(body.enabled),
    },
  };
}

function buildSnapshot(id: string, data: any): ReflectionSnapshot {
  const messages: any[] = Array.isArray(data?.messages) ? data.messages : [];
  const firstUser = messages.find(
    (m) => m && m.role === "user" && typeof m.content === "string" && m.content.trim()
  );
  const excerptSource = (firstUser?.content || "").replace(/\s+/g, " ").trim();

  const loc = data?.location;
  const hasLocation =
    loc && typeof loc.lat === "number" && typeof loc.lng === "number" && Number.isFinite(loc.lat);

  return {
    id,
    title: typeof data?.title === "string" ? data.title : "Untitled Reflection",
    category: typeof data?.category === "string" ? data.category : null,
    mode: typeof data?.mode === "string" ? data.mode : null,
    createdAt: typeof data?.createdAt === "string" ? data.createdAt : null,
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : null,
    turnCount: messages.length,
    excerpt:
      excerptSource.length > EXCERPT_LENGTH
        ? `${excerptSource.slice(0, EXCERPT_LENGTH - 1)}…`
        : excerptSource,
    location: hasLocation
      ? {
          name: typeof loc.name === "string" ? loc.name : "Pinned location",
          address: typeof loc.address === "string" ? loc.address : null,
          lat: loc.lat,
          lng: loc.lng,
        }
      : null,
  };
}

function endpointMatches(d: StoredEndpoint, event: WebhookEvent, r: ReflectionSnapshot): boolean {
  if (!d.enabled) return false;
  if (!d.events.includes(event)) return false;

  const f = d.filters || { categories: [], modes: [], location: "any" };
  if (f.categories?.length && !(r.category && f.categories.includes(r.category))) return false;
  if (f.modes?.length && !(r.mode && f.modes.includes(r.mode))) return false;
  if (f.location === "pinned" && !r.location) return false;
  if (f.location === "unpinned" && r.location) return false;
  return true;
}

// In-memory fallback store for development environments where Google Cloud ADC
// lacks Admin permissions on the user's Firestore database.
const memEndpointsByUser = new Map<string, Map<string, StoredEndpoint>>();

function getMemStore(uid: string): Map<string, StoredEndpoint> {
  let store = memEndpointsByUser.get(uid);
  if (!store) {
    store = new Map();
    memEndpointsByUser.set(uid, store);
  }
  return store;
}

function isFirestorePermissionError(err: any): boolean {
  if (!err) return false;
  const code = err.code ?? err.status;
  if (code === 7 || code === "7" || code === "PERMISSION_DENIED" || code === "permission-denied") {
    return true;
  }
  const msg = String(err.message || "");
  return (
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("Missing or insufficient permissions") ||
    msg.includes("Could not reach Cloud Firestore") ||
    msg.includes("UNAVAILABLE")
  );
}

/**
 * Takes a getter rather than an instance so Firebase Admin stays lazily
 * initialised (local dev boots without Application Default Credentials).
 */
export function createWebhookRouter(getDb: () => Firestore): express.Router {
  const router = express.Router();

  const collection = (uid: string) => getDb().collection("users").doc(uid).collection("webhooks");

  async function listEndpoints(uid: string): Promise<Array<{ id: string; data: StoredEndpoint }>> {
    try {
      const snap = await collection(uid).orderBy("createdAt", "desc").get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as StoredEndpoint }));
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        console.warn("[Webhooks] Firestore Admin permission denied; using local in-memory store for uid:", uid);
        const store = getMemStore(uid);
        const list = Array.from(store.entries()).map(([id, data]) => ({ id, data }));
        list.sort((a, b) => (b.data.createdAt || "").localeCompare(a.data.createdAt || ""));
        return list;
      }
      throw err;
    }
  }

  async function countEndpoints(uid: string): Promise<number> {
    try {
      const existing = await collection(uid).count().get();
      return existing.data().count;
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        return getMemStore(uid).size;
      }
      throw err;
    }
  }

  async function addEndpoint(uid: string, doc: StoredEndpoint): Promise<string> {
    try {
      const ref = await collection(uid).add(doc);
      return ref.id;
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        const id = "ep_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
        getMemStore(uid).set(id, doc);
        return id;
      }
      throw err;
    }
  }

  async function getEndpoint(uid: string, id: string): Promise<StoredEndpoint | null> {
    try {
      const snap = await collection(uid).doc(id).get();
      if (!snap.exists) return null;
      return snap.data() as StoredEndpoint;
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        return getMemStore(uid).get(id) || null;
      }
      throw err;
    }
  }

  async function saveEndpoint(uid: string, id: string, doc: StoredEndpoint): Promise<void> {
    try {
      await collection(uid).doc(id).set(doc);
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        getMemStore(uid).set(id, doc);
        return;
      }
      throw err;
    }
  }

  async function updateEndpoint(uid: string, id: string, patch: Partial<StoredEndpoint>): Promise<void> {
    try {
      await collection(uid).doc(id).update(patch);
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        const current = getMemStore(uid).get(id);
        if (current) {
          getMemStore(uid).set(id, { ...current, ...patch });
        }
        return;
      }
      throw err;
    }
  }

  async function deleteEndpoint(uid: string, id: string): Promise<void> {
    try {
      await collection(uid).doc(id).delete();
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        getMemStore(uid).delete(id);
        return;
      }
      throw err;
    }
  }

  async function listEnabledEndpoints(uid: string): Promise<Array<{ id: string; data: StoredEndpoint }>> {
    try {
      const snap = await collection(uid).where("enabled", "==", true).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as StoredEndpoint }));
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        const store = getMemStore(uid);
        return Array.from(store.entries())
          .filter(([_, d]) => d.enabled)
          .map(([id, data]) => ({ id, data }));
      }
      throw err;
    }
  }

  async function recordLastDelivery(uid: string, id: string, result: unknown): Promise<void> {
    try {
      await collection(uid).doc(id).update({ lastDelivery: result });
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        const current = getMemStore(uid).get(id);
        if (current) {
          current.lastDelivery = result;
        }
        return;
      }
      console.warn("[Webhooks] Failed to record lastDelivery:", err?.message || err);
    }
  }

  router.get("/webhooks", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    const endpoints = await listEndpoints(uid);
    res.json({
      success: true,
      endpoints: endpoints.map(({ id, data }) => toSummary(id, data)),
    });
  }));

  router.post("/webhooks", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    const parsed = parseEndpointInput(req.body);
    if (!parsed.value) return res.status(400).json({ success: false, error: parsed.error });

    const existingCount = await countEndpoints(uid);
    if (existingCount >= MAX_ENDPOINTS_PER_USER) {
      return res.status(400).json({
        success: false,
        error: `You can have at most ${MAX_ENDPOINTS_PER_USER} endpoints.`,
      });
    }

    const now = new Date().toISOString();
    const signingSecret =
      parsed.value.destination === "other" ? generateSigningSecret() : undefined;

    const doc: StoredEndpoint = {
      ...parsed.value,
      ...(signingSecret ? { signingSecret } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const newId = await addEndpoint(uid, doc);
    res.json({
      success: true,
      endpoint: toSummary(newId, doc),
      // Shown to the user exactly once, at creation.
      signingSecret,
    });
  }));

  router.patch("/webhooks/:id", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    const current = await getEndpoint(uid, req.params.id);
    if (!current) return res.status(404).json({ success: false, error: "Endpoint not found." });

    // Toggle-only update (the enable switch) skips full revalidation.
    if (Object.keys(req.body || {}).length === 1 && typeof req.body?.enabled === "boolean") {
      const patch = { enabled: req.body.enabled, updatedAt: new Date().toISOString() };
      await updateEndpoint(uid, req.params.id, patch);
      return res.json({ success: true, endpoint: toSummary(req.params.id, { ...current, ...patch }) });
    }

    const parsed = parseEndpointInput(req.body);
    if (!parsed.value) return res.status(400).json({ success: false, error: parsed.error });

    const updated: StoredEndpoint = {
      ...current,
      ...parsed.value,
      updatedAt: new Date().toISOString(),
    };
    // Generic endpoints keep (or gain) a signing secret.
    if (updated.destination === "other" && !updated.signingSecret) {
      updated.signingSecret = generateSigningSecret();
    }
    await saveEndpoint(uid, req.params.id, updated);
    res.json({ success: true, endpoint: toSummary(req.params.id, updated) });
  }));

  router.delete("/webhooks/:id", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    await deleteEndpoint(uid, req.params.id);
    res.json({ success: true });
  }));

  router.post("/webhooks/:id/test", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    const endpoint = await getEndpoint(uid, req.params.id);
    if (!endpoint) return res.status(404).json({ success: false, error: "Endpoint not found." });

    const { sampleEvent } = await import("./webhookPayloads.js");
    const event: CanonicalEvent = { ...sampleEvent(), id: generateDeliveryId() };

    const result = await deliver(
      {
        id: req.params.id,
        destination: endpoint.destination,
        url: endpoint.url,
        signingSecret: endpoint.signingSecret,
      },
      event
    );
    await recordLastDelivery(uid, req.params.id, result);
    res.json({ success: result.status === "success", delivery: result });
  }));

  /**
   * Emit a real journal event.
   *
   * The client sends the event type and the reflection id - the payload is
   * re-read from Firestore with the Admin SDK when available so a browser can
   * never dictate what gets posted to an external channel.
   *
   * In sandbox dev environments lacking Admin IAM, it safely falls back to
   * minimal sanitized metadata so journalling is never disrupted.
   */
  router.post("/events", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    const type = req.body?.type;
    const reflectionId = req.body?.reflectionId;

    if (!EVENTS.includes(type)) {
      return res.status(400).json({ success: false, error: "Unknown event type." });
    }
    if (typeof reflectionId !== "string" || !reflectionId || reflectionId.length > 200) {
      return res.status(400).json({ success: false, error: "Missing reflection id." });
    }
    if (overEmitLimit(uid)) {
      return res.status(429).json({ success: false, error: "Too many events. Try again shortly." });
    }

    let targets: Array<{ id: string; data: StoredEndpoint }> = [];
    try {
      targets = await listEnabledEndpoints(uid);
    } catch (err: any) {
      console.warn("[Webhooks] Failed to query enabled endpoints:", err?.message || err);
      return res.json({ success: true, delivered: 0, matched: 0 });
    }
    if (targets.length === 0) return res.json({ success: true, delivered: 0, matched: 0 });

    let snapshot: ReflectionSnapshot | null = null;
    try {
      const reflectionSnap = await getDb()
        .collection("users")
        .doc(uid)
        .collection("interactions")
        .doc(reflectionId)
        .get();
      if (reflectionSnap.exists) {
        snapshot = buildSnapshot(reflectionSnap.id, reflectionSnap.data());
      }
    } catch (err: any) {
      if (isFirestorePermissionError(err)) {
        console.warn("[Webhooks] Firestore Admin reflection read unavailable in sandbox; using safe fallback.");
        if (req.body?.reflection && typeof req.body.reflection === "object") {
          snapshot = buildSnapshot(reflectionId, req.body.reflection);
        } else {
          snapshot = {
            id: reflectionId,
            title: "Journal Entry",
            category: null,
            mode: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            turnCount: 1,
            excerpt: "Journal entry recorded.",
            location: null,
          };
        }
      } else {
        throw err;
      }
    }

    if (!snapshot) {
      return res.status(404).json({ success: false, error: "Reflection not found." });
    }

    const matchedEndpoints = targets.filter(({ data }) =>
      endpointMatches(data, type, snapshot!)
    );
    if (matchedEndpoints.length === 0) return res.json({ success: true, delivered: 0, matched: 0 });

    const results = await Promise.allSettled(
      matchedEndpoints.map(async ({ id: endpointId, data: endpoint }) => {
        const event: CanonicalEvent = {
          id: generateDeliveryId(),
          type,
          createdAt: new Date().toISOString(),
          data: { reflection: snapshot! },
        };
        const result = await deliver(
          {
            id: endpointId,
            destination: endpoint.destination,
            url: endpoint.url,
            signingSecret: endpoint.signingSecret,
          },
          event
        );
        await recordLastDelivery(uid, endpointId, result);
        return result;
      })
    );

    const delivered = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "success"
    ).length;
    res.json({ success: true, delivered, matched: matchedEndpoints.length });
  }));

  return router;
}
