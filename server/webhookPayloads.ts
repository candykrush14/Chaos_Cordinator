export type WebhookEvent =
  | "reflection.created"
  | "reflection.updated"
  | "reflection.located"
  | "reflection.deleted";

export interface ReflectionSnapshot {
  id: string;
  title: string;
  category?: string | null;
  mode?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  turnCount: number;
  excerpt: string;
  location?: {
    name: string;
    address?: string | null;
    lat: number;
    lng: number;
  } | null;
}

export interface CanonicalEvent {
  id: string;
  type: WebhookEvent;
  createdAt: string;
  data: { reflection: ReflectionSnapshot };
}

const EVENT_TITLES: Record<WebhookEvent, string> = {
  "reflection.created": "New reflection saved",
  "reflection.updated": "Reflection updated",
  "reflection.located": "Reflection pinned to a place",
  "reflection.deleted": "Reflection deleted",
};

/** Olive #5a5a40 as a Discord integer colour. */
const BRAND_COLOR = 0x5a5a40;

function clamp(value: string, max: number): string {
  const s = (value || "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Journal text is arbitrary user input being posted into a shared channel.
 * Strip anything a chat platform would treat as a broadcast mention so an
 * entry can never ping a whole server.
 */
function stripMentions(value: string): string {
  return (value || "")
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<!(everyone|here|channel)>/gi, "")
    .replace(/<@[!&]?\d+>/g, "");
}

function safeText(value: string, max: number): string {
  return clamp(stripMentions(value), max);
}

function titleCase(value?: string | null): string | null {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function buildDiscordPayload(event: CanonicalEvent): unknown {
  const r = event.data.reflection;
  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (r.category) fields.push({ name: "Category", value: titleCase(r.category)!, inline: true });
  if (r.mode) fields.push({ name: "Mode", value: titleCase(r.mode)!, inline: true });
  fields.push({ name: "Turns", value: String(r.turnCount), inline: true });

  if (r.location) {
    fields.push({
      name: "Location",
      value: safeText(
        `[${r.location.name}](${mapsLink(r.location.lat, r.location.lng)})` +
          (r.location.address ? `\n${r.location.address}` : ""),
        1024
      ),
      inline: false,
    });
  }

  return {
    username: "Reflections & Journal",
    // Never let journal content trigger a broadcast ping.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: safeText(EVENT_TITLES[event.type], 256),
        description: safeText(
          `**${r.title || "Untitled Reflection"}**` + (r.excerpt ? `\n\n${r.excerpt}` : ""),
          4096
        ),
        color: BRAND_COLOR,
        fields: fields.slice(0, 25),
        footer: { text: event.type },
        timestamp: event.createdAt,
      },
    ],
  };
}

export function buildSlackPayload(event: CanonicalEvent): unknown {
  const r = event.data.reflection;
  const meta = [
    r.category ? `*Category:* ${titleCase(r.category)}` : null,
    r.mode ? `*Mode:* ${titleCase(r.mode)}` : null,
    `*Turns:* ${r.turnCount}`,
    r.location ? `*Location:* <${mapsLink(r.location.lat, r.location.lng)}|${safeText(r.location.name, 120)}>` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: safeText(EVENT_TITLES[event.type], 150), emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: safeText(
          `*${r.title || "Untitled Reflection"}*` + (r.excerpt ? `\n${r.excerpt}` : ""),
          3000
        ),
      },
    },
  ];

  if (meta) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: safeText(meta, 3000) }] });
  }

  return {
    text: safeText(`${EVENT_TITLES[event.type]}: ${r.title || "Untitled Reflection"}`, 500),
    blocks,
  };
}

/** The canonical envelope, sent verbatim to generic ("other") endpoints. */
export function buildGenericPayload(event: CanonicalEvent): unknown {
  return event;
}

export function buildPayload(
  destination: "discord" | "slack" | "other",
  event: CanonicalEvent
): unknown {
  if (destination === "discord") return buildDiscordPayload(event);
  if (destination === "slack") return buildSlackPayload(event);
  return buildGenericPayload(event);
}

export function sampleEvent(): CanonicalEvent {
  return {
    id: "evt_test_000000",
    type: "reflection.created",
    createdAt: new Date().toISOString(),
    data: {
      reflection: {
        id: "int-sample",
        title: "A test reflection from your journal",
        category: "mindfulness",
        mode: "reflection",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turnCount: 2,
        excerpt:
          "This is a sample delivery so you can confirm the endpoint is wired up correctly. No real journal content was sent.",
        location: {
          name: "Kyoto Zen Bamboo Grove",
          address: "Arashiyama, Kyoto, Japan",
          lat: 35.0169,
          lng: 135.6713,
        },
      },
    },
  };
}
