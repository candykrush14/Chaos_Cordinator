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

/**
 * Takes a getter rather than an instance so Firebase Admin stays lazily
 * initialised (local dev boots without Application Default Credentials).
 */
export function createWebhookRouter(getDb: () => Firestore): express.Router {
  const router = express.Router();

  const collection = (uid: string) => getDb().collection("users").doc(uid).collection("webhooks");

  router.get("/webhooks", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    const snap = await collection(uid).orderBy("createdAt", "desc").get();
    res.json({
      success: true,
      endpoints: snap.docs.map((d) => toSummary(d.id, d.data() as StoredEndpoint)),
    });
  }));

  router.post("/webhooks", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    const parsed = parseEndpointInput(req.body);
    if (!parsed.value) return res.status(400).json({ success: false, error: parsed.error });

    const existing = await collection(uid).count().get();
    if (existing.data().count >= MAX_ENDPOINTS_PER_USER) {
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

    const ref = await collection(uid).add(doc);
    res.json({
      success: true,
      endpoint: toSummary(ref.id, doc),
      // Shown to the user exactly once, at creation.
      signingSecret,
    });
  }));

  router.patch("/webhooks/:id", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    const ref = collection(uid).doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: "Endpoint not found." });

    const current = snap.data() as StoredEndpoint;

    // Toggle-only update (the enable switch) skips full revalidation.
    if (Object.keys(req.body || {}).length === 1 && typeof req.body?.enabled === "boolean") {
      const patch = { enabled: req.body.enabled, updatedAt: new Date().toISOString() };
      await ref.update(patch);
      return res.json({ success: true, endpoint: toSummary(ref.id, { ...current, ...patch }) });
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
    await ref.set(updated);
    res.json({ success: true, endpoint: toSummary(ref.id, updated) });
  }));

  router.delete("/webhooks/:id", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    await collection(uid).doc(req.params.id).delete();
    res.json({ success: true });
  }));

  router.post("/webhooks/:id/test", wrap(async (req: Request, res: Response) => {
    const uid = uidOf(req);
    const ref = collection(uid).doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: "Endpoint not found." });

    const endpoint = snap.data() as StoredEndpoint;
    const { sampleEvent } = await import("./webhookPayloads.js");
    const event: CanonicalEvent = { ...sampleEvent(), id: generateDeliveryId() };

    const result = await deliver(
      {
        id: ref.id,
        destination: endpoint.destination,
        url: endpoint.url,
        signingSecret: endpoint.signingSecret,
      },
      event
    );
    await ref.update({ lastDelivery: result });
    res.json({ success: result.status === "success", delivery: result });
  }));

  /**
   * Emit a real journal event.
   *
   * The client only sends the event type and the reflection id - the payload is
   * re-read from Firestore with the Admin SDK so a browser can never dictate
   * what gets posted to an external channel.
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

    const endpointsSnap = await collection(uid).where("enabled", "==", true).get();
    if (endpointsSnap.empty) return res.json({ success: true, delivered: 0, matched: 0 });

    const reflectionSnap = await getDb()
      .collection("users")
      .doc(uid)
      .collection("interactions")
      .doc(reflectionId)
      .get();
    if (!reflectionSnap.exists) {
      return res.status(404).json({ success: false, error: "Reflection not found." });
    }

    const snapshot = buildSnapshot(reflectionSnap.id, reflectionSnap.data());
    const targets = endpointsSnap.docs.filter((d) =>
      endpointMatches(d.data() as StoredEndpoint, type, snapshot)
    );
    if (targets.length === 0) return res.json({ success: true, delivered: 0, matched: 0 });

    const results = await Promise.allSettled(
      targets.map(async (docSnap) => {
        const endpoint = docSnap.data() as StoredEndpoint;
        const event: CanonicalEvent = {
          id: generateDeliveryId(),
          type,
          createdAt: new Date().toISOString(),
          data: { reflection: snapshot },
        };
        const result = await deliver(
          {
            id: docSnap.id,
            destination: endpoint.destination,
            url: endpoint.url,
            signingSecret: endpoint.signingSecret,
          },
          event
        );
        await docSnap.ref.update({ lastDelivery: result });
        return result;
      })
    );

    const delivered = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "success"
    ).length;
    res.json({ success: true, delivered, matched: targets.length });
  }));

  return router;
}
