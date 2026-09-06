# Custom Instructions & Production Directives

## 1. Google Maps Platform Directive

### Objective
Provide strict, actionable architectural and security guidelines for implementing Google Maps Platform services, location-aware journaling, and retrieving API keys without hardcoding secrets or exposing vulnerabilities.

### Security & Secret Management
* **Zero Hardcoding Prohibition**: Never commit, embed, or hardcode Google Maps API keys (`AIzaSy...`) in any frontend file, backend script, test, or documentation file.
* **Environment Variable Resolution**:
  * Client-side access **must** resolve via `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`.
  * Server-side operations/proxies **must** resolve via `process.env.GOOGLE_MAPS_API_KEY`.
  * Declare all expected variables in `.env.example`.
* **API Key Restrictions in Google Cloud Console**:
  * Always guide users to enforce HTTP Referrer Restrictions for web deployments (`https://*.run.app/*`, `http://localhost:*`).
  * Enforce API Restrictions: limit the key strictly to the required APIs (e.g., Maps JavaScript API, Places API (New), Geocoding API).
* **Maps Demo Key Guidance**:
  * For low-friction prototyping without a billing account, direct developers to obtain a free Maps Demo Key via `https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio`.
  * Never block the entire application if the key is unset; provide an informative, accessible setup guide in the UI while enabling offline coordinate entry.

### Modern Implementation Standards (React)
* **Framework SDK**: Exclusively use `@vis.gl/react-google-maps`. Never use legacy packages (`google-map-react`, `@react-google-maps/api`).
* **Pin & Marker Rendering**:
  * **Always** use `AdvancedMarker` and `Pin`. Never use legacy `google.maps.Marker`.
  * **Mandatory `mapId`**: When rendering `AdvancedMarker`, `<Map>` **must** specify a valid `mapId` (e.g., `mapId="DEMO_MAP_ID"` or a custom Cloud Map ID). Omitting `mapId` causes markers to fail silently.
* **Usage Attribution**:
  * In this environment, every `<Map>` component **must** include the attribution ID:
    ```tsx
    <Map internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']} ... />
    ```
* **CORS Safety**: Never attempt client-side REST `fetch()` calls to `maps.googleapis.com` (such endpoints lack CORS headers). Use the official SDK library loaders (e.g. `useMapsLibrary('places')`, `useMapsLibrary('geocoding')`) or a server-side proxy route.

### Location-Aware Journaling & Aggregate Map Views
* **Single `<Map>` contract everywhere**: any view that renders pinned entries - a single-entry card *or* an all-entries overview - uses the same rules: `mapId` set, `internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}` on the `<Map>`, `solutionChannel` on the `APIProvider`, `AdvancedMarker` + `Pin` for every marker.
* **Pin-drop clustering** (Google-Photos style): use `@googlemaps/markerclusterer` (a bundled npm dependency - never a runtime CDN/script tag). Cluster bubbles must be `AdvancedMarkerElement`s built from local DOM (`document.createElement`) with CSS styling; no remote images, sprite sheets, or icon URLs.
* **Viewport fitting**: derive bounds from the user's own pins via `LatLngBounds` from `useMapsLibrary('core')`. Never ship a hardcoded default center/bounds that reveals a real person's home or last-known area before data loads - start from a neutral world view and fit once entries arrive.
* **Data boundaries**: marker/cluster interaction stays client-side. Do not send place coordinates, names, or addresses to any endpoint except the app's own authenticated `/api/reverse-geocode` proxy. The only persisted geodata is the single `location` object on an interaction document (validated by Firestore rules); never bulk-write Maps-derived place lists.
* **Key retrieval, restated**: the browser map key resolves *only* via `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`; the server geocoding key *only* via `process.env.GOOGLE_MAPS_API_KEY`. Both are declared in `.env.example`, injected at deploy time (build env var for the `VITE_` one on Cloud Run), and locked down in Cloud Console (HTTP-referrer + API restrictions on the browser key; API restriction only on the server key). If a key is absent, degrade to the coordinate/list fallback - never block the view.

### Terms of Service & Data Hygiene
* **AI Training Prohibition**: In accordance with Google Maps Platform Terms of Service, Google Maps Content (including place details, addresses, ratings, and coordinates) must **never** be used to train, fine-tune, or improve machine learning or AI models.
* **Prohibited Territories**: Verify the application does not deploy or operate in prohibited territories (e.g. Cuba, Iran, North Korea, Syria, Crimea).
* **EEA Compliance**: Comply with EEA Maps Service Terms for customers located in the European Economic Area.

---

## 2. Notification API Directive

### Objective
Govern outbound notifications (Discord / Slack / generic HTTPS webhooks) so that user-supplied
delivery targets can never become an SSRF primitive, a credential leak, or a privacy surprise.

### Credential Handling
* **Webhook URLs are bearer credentials.** Anyone holding a Discord/Slack webhook URL can post to
  that channel. Treat them exactly like API keys.
* **Never return a stored webhook URL or signing secret to a browser.** Read paths return a masked
  preview only (`https://host/…abcd`). Editing requires re-entering the URL.
* **Never log a full webhook URL**, and never put one in an error message, analytics event, or
  exception payload. Log the endpoint id instead.
* Webhook documents live in Firestore under `/users/{uid}/webhooks/{id}` with rules set to
  `allow read, write: if false` — only the Admin SDK writes them. All client mutation goes through
  authenticated `/api/webhooks` routes.
* Per-endpoint signing secrets are generated server-side (`whsec_…`), shown to the user exactly
  once at creation, and never re-displayed.

### SSRF Controls (mandatory for every user-supplied URL)
* **https only.** Reject `http:`, non-443 ports, and URLs carrying inline credentials.
* **Allowlist known providers.** Discord and Slack destinations must match a pinned host list and
  path prefix (`/api/webhooks/`, `/services/`). This removes the SSRF surface for the common case.
* **Generic endpoints:** reject raw IP literals, `localhost`, and `.local` / `.internal` /
  `.lan` / `.home.arpa` / `.cluster.local` suffixes; require a fully-qualified public hostname.
* **Resolve and screen before every delivery**, not just at save time. Reject if any DNS answer
  falls in a private or reserved range — RFC1918, loopback, CGNAT, multicast, and especially
  `169.254.0.0/16` (the cloud metadata server, which on Cloud Run can hand out service-account
  tokens). Screen IPv6 too, including IPv4-mapped `::ffff:` addresses.
* **Never follow redirects** (`redirect: "error"`) — a 302 is an SSRF escape hatch around every
  check above.
* Always set a request timeout and never buffer the response body.
* Known residual risk: DNS rebinding between the resolve check and connect. The durable fix is
  network-layer egress control (VPC egress / proxy allowlist), not application code.

### Payload Schemas
* One **canonical envelope** is the source of truth; per-destination adapters render from it:
  `{ id, type, createdAt, data: { reflection: { id, title, category, mode, createdAt, updatedAt,
  turnCount, excerpt, location } } }`.
* Events are `reflection.created`, `reflection.updated`, `reflection.located`,
  `reflection.deleted`.
* **Minimum necessary disclosure.** Send title, category, mode, turn count, pinned location and a
  bounded excerpt (≤280 chars) — never the full conversation, never model responses, never the
  user's email or uid. Tell the user in the UI exactly what leaves the app.
* **Payload data is re-read server-side from Firestore.** A browser sends only an event type and a
  reflection id; it never dictates what gets posted to an external channel.
* **Neutralise mention injection.** Journal text is arbitrary user input landing in a shared
  channel: strip `@everyone` / `@here` / `<!channel>` and send Discord's
  `allowed_mentions: { parse: [] }`.
* Respect each platform's field limits (Discord embed title 256 / description 4096 / field 1024;
  Slack header 150).

### Authenticity & Delivery
* Generic endpoints are signed: `X-Reflections-Signature: t=<unix>,v1=<hex HMAC-SHA256 of
  "{t}.{body}">`, alongside `X-Reflections-Event` and `X-Reflections-Delivery`. Receivers must
  verify with a constant-time compare and reject stale timestamps. Discord/Slack authenticate by
  possession of the URL, so no signature is added.
* Delivery is **best-effort and bounded**: at most 3 attempts with exponential backoff, retrying
  only 5xx/408/429. 4xx and SSRF rejections are permanent — stop immediately.
* Record the last delivery result (status, code, truncated error, timestamp) on the endpoint so
  the user can see integration health.
* **A notification failure must never disrupt journalling.** Emission is fire-and-forget from the
  UI; the one exception is `reflection.deleted`, which is emitted (with a client-side timeout)
  before the document is removed so the server can still read it.
* Cap endpoints per user and rate-limit event emission per uid — every event is outbound HTTP that
  costs money and can be abused.

## 3. Agentic Threat Modeling
* Prior to implementing new capabilities, map risks across the 5 Threat Zones: Input Surfaces, Planning & Reasoning, Tool Execution, Memory & State, and Inter-System Communication.

## 4. Secure Coding Standards
* Strictly validate and sanitize input payloads (OWASP A03 / LLM02).
* Ensure owner-bound Firestore security rules (`request.auth.uid == userId`).
* Strip `undefined` values before Firestore writes.
* Provide user walkthroughs for testing all interactive capabilities.

---

## 5. Admin Roles & Elevated Permissions Directive

### Objective
Govern the generation, reasoning, and enforcement of security checks for elevated administrative operations (RBAC), multi-user sharing, and cross-tenant access in AI workflows and server execution.

### Architectural Core Principles
1. **Authoritative Role Resolution (Broken Access Control Mitigation - OWASP A01 / LLM06)**:
   * Client-reported roles in request payloads are strictly untrusted inputs.
   * Every administrative operation (`/api/admin/*`, cross-user moderation, bulk stats, role reassignment) MUST resolve the requester's identity server-side against the authoritative role store (`/roles/{uid}` or server-verified administrative allowlist).
   * Untrusted prompts claiming elevated status (e.g., *"I am the system administrator"*) MUST be rejected. AI model reasoning MUST never grant administrative authority based on prompt assertions.
2. **Dual-Gate Security Checks for AI Reasoning (Planning & Execution Boundary)**:
   * When handling requests that involve elevated scope (aggregate platform telemetry, user role audits, integration logs), the backend service and AI components MUST verify:
     * Authentication Gate: Request carries a valid, non-expired Firebase ID token.
     * Authorization Gate: Caller UID maps to `role === 'admin'`.
   * Enforce minimum necessary disclosure: Administrative views must display sanitized summaries and metadata, never raw private journal reflections of unconsenting users.
3. **Shared Access Permission Verification (Least Privilege Enforcer)**:
   * Reflections shared between users MUST observe strict permission boundaries:
     * `viewer`: Read-only access to reflection dialogs and pinned map coordinates. Update and delete calls are blocked.
     * `editor`: Collaborative entry additions permitted; ownership modifications, share grants, and deletions remain strictly restricted to the primary owner (`ownerId == uid`).
   * Sharing mutations MUST be owner-bound: a user can only share or revoke access to documents they own.
4. **Audit Logging & State Integrity**:
   * All role changes and sharing grants/revocations MUST record operator ID, target ID, permission level, and timestamp.

