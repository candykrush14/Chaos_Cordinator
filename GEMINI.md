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

### Terms of Service & Data Hygiene
* **AI Training Prohibition**: In accordance with Google Maps Platform Terms of Service, Google Maps Content (including place details, addresses, ratings, and coordinates) must **never** be used to train, fine-tune, or improve machine learning or AI models.
* **Prohibited Territories**: Verify the application does not deploy or operate in prohibited territories (e.g. Cuba, Iran, North Korea, Syria, Crimea).
* **EEA Compliance**: Comply with EEA Maps Service Terms for customers located in the European Economic Area.

---

## 2. Agentic Threat Modeling
* Prior to implementing new capabilities, map risks across the 5 Threat Zones: Input Surfaces, Planning & Reasoning, Tool Execution, Memory & State, and Inter-System Communication.

## 3. Secure Coding Standards
* Strictly validate and sanitize input payloads (OWASP A03 / LLM02).
* Ensure owner-bound Firestore security rules (`request.auth.uid == userId`).
* Strip `undefined` values before Firestore writes.
* Provide user walkthroughs for testing all interactive capabilities.
