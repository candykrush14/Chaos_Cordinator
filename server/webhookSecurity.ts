import dnsPromises from "node:dns/promises";
import net from "node:net";

export type WebhookDestination = "discord" | "slack" | "other";

/**
 * Known-provider allowlists. When the destination is a first-party provider we
 * pin the exact hosts and path shape, which removes the SSRF surface entirely
 * for the common case.
 */
const PROVIDER_ALLOWLIST: Record<
  Exclude<WebhookDestination, "other">,
  { hosts: string[]; pathPrefix: string; label: string }
> = {
  discord: {
    hosts: [
      "discord.com",
      "www.discord.com",
      "ptb.discord.com",
      "canary.discord.com",
      "discordapp.com",
    ],
    pathPrefix: "/api/webhooks/",
    label: "Discord",
  },
  slack: {
    hosts: ["hooks.slack.com"],
    pathPrefix: "/services/",
    label: "Slack",
  },
};

const MAX_URL_LENGTH = 2048;

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inCidrV4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/** RFC1918 + loopback + link-local (incl. the GCP metadata server) + reserved. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // cloud metadata - 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);

  if (version === 4) {
    return BLOCKED_V4.some(([base, bits]) => inCidrV4(ip, base, bits));
  }

  if (version === 6) {
    const lower = ip.toLowerCase();

    // IPv4-mapped / IPv4-compatible: unwrap and evaluate as v4.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    if (lower.startsWith("64:ff9b::")) return true; // NAT64

    if (lower === "::" || lower === "::1") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique-local
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link-local
    if (/^ff[0-9a-f]{2}:/.test(lower)) return true; // ff00::/8 multicast
    if (lower.startsWith("2001:db8:")) return true; // documentation
    return false;
  }

  // Not a parseable IP - caller decides.
  return false;
}

const BLOCKED_HOSTNAME_SUFFIXES = [
  "localhost",
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".cluster.local",
];

export interface UrlValidationResult {
  ok: boolean;
  /** Normalised absolute URL, present when ok. */
  url?: string;
  error?: string;
}

/**
 * Structural validation. Runs at create/update time so the user gets an
 * immediate, specific error - and again (with DNS) before every delivery.
 */
export function validateWebhookUrl(
  destination: WebhookDestination,
  rawUrl: unknown
): UrlValidationResult {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { ok: false, error: "A webhook URL is required." };
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: "That URL is too long." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Webhook URLs must use https." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Credentials embedded in the URL are not allowed." };
  }
  if (parsed.port && parsed.port !== "443") {
    return { ok: false, error: "Only the standard https port (443) is allowed." };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

  if (destination !== "other") {
    const rule = PROVIDER_ALLOWLIST[destination];
    if (!rule.hosts.includes(hostname)) {
      return {
        ok: false,
        error: `That isn't a ${rule.label} webhook URL. Expected one of: ${rule.hosts.join(", ")}.`,
      };
    }
    if (!parsed.pathname.startsWith(rule.pathPrefix)) {
      return {
        ok: false,
        error: `A ${rule.label} webhook URL path should start with ${rule.pathPrefix}`,
      };
    }
    return { ok: true, url: parsed.toString() };
  }

  // Generic destination: no allowlist, so screen aggressively.
  if (net.isIP(hostname)) {
    return { ok: false, error: "Use a hostname, not a raw IP address." };
  }
  if (BLOCKED_HOSTNAME_SUFFIXES.some((s) => hostname === s || hostname.endsWith(s))) {
    return { ok: false, error: "Internal hostnames are not allowed." };
  }
  if (!hostname.includes(".")) {
    return { ok: false, error: "Use a fully-qualified public hostname." };
  }

  return { ok: true, url: parsed.toString() };
}

/**
 * Resolves the hostname and rejects if ANY answer is a private/reserved
 * address. Called immediately before each delivery.
 *
 * Residual risk: a DNS rebind between this check and connect() is still
 * theoretically possible. The durable fix is egress control at the network
 * layer (VPC egress / proxy allowlist) - see the Notification API Directive.
 */
export async function assertPublicHostname(hostname: string): Promise<void> {
  let answers: { address: string }[];
  try {
    answers = await dnsPromises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`Could not resolve ${hostname}.`);
  }
  if (!answers.length) {
    throw new Error(`Could not resolve ${hostname}.`);
  }
  for (const { address } of answers) {
    if (isBlockedIp(address)) {
      throw new Error("Refusing to call a private or reserved network address.");
    }
  }
}

/**
 * Webhook URLs are bearer credentials - anyone holding one can post to that
 * channel. Only this masked form is ever sent back to a browser.
 */
export function maskWebhookUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const tail = parsed.pathname.replace(/\/+$/, "").slice(-4);
    return `${parsed.origin}/…${tail}`;
  } catch {
    return "https://…";
  }
}
