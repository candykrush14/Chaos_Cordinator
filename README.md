# Reflections & Journal: Authenticated Multi-Turn AI Journaling on Cloud Run

A secure, user-authenticated personal reflection and journaling web application powered by **Gemini 3.6 Flash**, **Google Cloud Run**, and **Cloud Firestore**. Every interaction, prompt, and AI response is isolated strictly to the authenticated user's private document space in Firestore, with server-side API proxying and Secret Manager integration.

---

## Architecture Overview

| Component | Implementation | Security & Purpose |
| :--- | :--- | :--- |
| **User Authentication** | Firebase Authentication | Federated Google Sign-In; no storage or handling of raw passwords. |
| **Backend Database** | Cloud Firestore | Isolated subcollection `/users/{userId}/interactions/{interactionId}` protected by owner-bound Firestore security rules. |
| **AI Processing Engine** | Gemini 3.6 Flash API | Server-side reflection, brainstorming, and summarization with a multi-model fallback ladder. |
| **Secret Management** | Google Cloud Secret Manager | Stores `GEMINI_API_KEY` securely without client exposure or hardcoded keys. |
| **Hosting & Container** | Google Cloud Run | Scalable, containerized deployment running Node.js + Express with embedded Vite middleware. |
| **Location & Maps Integration** | Google Maps Platform (`@vis.gl/react-google-maps`) | Location-aware journal pins, interactive map previews (`AdvancedMarker`, `Pin`), attribution channel `gmp_mcp_codeassist_v1_aistudio`, zero hardcoded keys. |

---

## Threat Model & Security Mitigations

| Threat Zone | Threat Scenario | Countermeasure & Defensive Control |
| :--- | :--- | :--- |
| **Input Surfaces** | Malicious injection payloads, oversized inputs, XSS attempts in reflections or location fields. | Server & client text validation, max length limits (20,000 chars), defensive sanitization, zero raw HTML execution, coordinate validation. |
| **Planning & Reasoning** | Indirect prompt injection via journal reflections attempting system bypass. | Plain data framing (`OWASP LLM01`), strict system instructions treating inputs purely as reflective text, resilient model ladder. |
| **Tool Execution** | Unauthorized API calls, SSRF, or key leakage in browser dev tools. | Server-side Gemini API proxy (`/api/reflect`), top-level request body parsing guarantee, zero client-side API secrets. |
| **Memory & State** | Cross-user data leaks or unauthorized Firestore reads/writes. | Owner-bound Firestore security rules (`request.auth.uid == userId`), strict undefined-stripping payload hygiene, location persistence isolation. |
| **Inter-System Communication** | Key exfiltration, token tampering in transit, or Google Maps Platform quota abuse. | HTTPS/TLS transport, dynamic Secret Manager secret ingestion, Bearer token integrity checks, solution channel attribution ID, HTTP referrer key restrictions. |

---

## 1. Prerequisites & Environment Setup

### 1.1 Install Prerequisites
Ensure you have the following installed on your workstation:
- [Google Cloud SDK (gcloud CLI)](https://cloud.google.com/sdk/docs/install)
- [Node.js (v20+ LTS)](https://nodejs.org/)
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)

### 1.2 Authenticate & Select Google Cloud Project
```bash
# Log in to Google Cloud
gcloud auth login

# Set your active project ID
export PROJECT_ID="YOUR_PROJECT_ID"
gcloud config set project $PROJECT_ID

# Authenticate Application Default Credentials (ADC) for local development
gcloud auth application-default login
```

### 1.3 Enable Required Google Cloud APIs
```bash
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  aiplatform.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

---

## 2. Cloud Firestore Configuration & Security Rules

### 2.1 Provision Cloud Firestore (Native Mode)
If you have not provisioned Firestore yet:
```bash
gcloud firestore databases create --location=nam5 --type=firestore-native
```

### 2.2 Deploy Firestore Security Rules
Ensure your `firestore.rules` file enforces owner-bound user isolation, RBAC checks, and shared access boundaries:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() {
      return request.auth != null;
    }
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    function getUserRole() {
      return isAuthenticated() && exists(/databases/$(database)/documents/roles/$(request.auth.uid))
        ? get(/databases/$(database)/documents/roles/$(request.auth.uid)).data.role
        : 'user';
    }
    function isAdmin() {
      return isAuthenticated() && (
        getUserRole() == 'admin' ||
        request.auth.token.email == 'shreyasrivastava0407@gmail.com'
      );
    }
    function isValidShare(shareData) {
      return shareData.targetUid == request.auth.uid ||
        shareData.targetEmail == request.auth.token.email;
    }

    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if isOwner(userId) || isAdmin();
      allow read: if isAuthenticated() && exists(/databases/$(database)/documents/shares/$(interactionId + '_' + request.auth.uid));
    }
    match /users/{userId}/{document=**} {
      allow read, write: if isOwner(userId) || isAdmin();
    }
    match /roles/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    match /shares/{shareId} {
      allow get: if isAuthenticated() && (
        resource.data.ownerId == request.auth.uid ||
        isValidShare(resource.data) ||
        isAdmin()
      );
      allow list: if isAuthenticated();
      allow create: if isAuthenticated() && isOwner(request.resource.data.ownerId);
      allow update, delete: if isAuthenticated() && (
        resource.data.ownerId == request.auth.uid ||
        isAdmin()
      );
    }
  }
}
```

Deploy the rules via Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

---

## 3. Secret Manager Configuration

Store your Gemini API key in Secret Manager to avoid hardcoded secrets in source control or client code:

```bash
# 1. Create the secret in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# 2. Add your Gemini API key version
echo -n "YOUR_ACTUAL_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 3. Retrieve your project number
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# 4. Grant the default Cloud Run Compute Service Account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 4. Google Cloud Run Deployment Flow

### 4.1 Build and Deploy to Cloud Run
Deploy directly from source to Cloud Run with Secret Manager environment variable binding:

```bash
gcloud run deploy reflections-journal \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars NODE_ENV=production
```

### 4.2 Mandatory Campaign Verification Labeling
Apply the mandatory resource label to register the service for challenge verification:

```bash
gcloud run services update reflections-journal \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

Verify that the label was successfully registered:
```bash
gcloud run services describe reflections-journal \
  --region=us-central1 \
  --format="value(metadata.labels)"
```

---

## 5. End-to-End Functional Walkthrough & Test Suite

The following manual test walkthrough exercises all visible components and user interactions for test automation:

### Test Case 1: Unauthenticated Landing Page
- **Step 1.1**: Open the app root URL in an incognito window.
- **Expected Outcome**: The user is greeted by the landing page with the title *"A sanctuary for your thoughts and self-reflection"*, security pillars (Isolated Storage, Multi-Turn Dialogue, Insights & Summaries), and a prominent **"Sign in with Google"** button. The private journal canvas is inaccessible.
- **Step 1.2**: Click **"Sign in with Google"**.
- **Expected Outcome**: The Google OAuth popup appears. If popup is blocked by the browser, a clean, dismissible alert banner appears with instructions.

### Test Case 2: Authentication & Private Dashboard Entry
- **Step 2.1**: Complete the Google Sign-In prompt.
- **Expected Outcome**: The header transitions to show the user's Google display name, email, avatar, and a **"Sign Out"** button. The main workspace initializes, and the history sidebar displays the user's past entries.

### Test Case 3: Initial Multi-Turn Reflection Creation
- **Step 3.1**: On an empty canvas, verify that the 4 prompt starter cards appear (*Emotions*, *Decisions*, *Gratitude*, *Brainstorm*).
- **Step 3.2**: Click the "Emotions" prompt starter card.
- **Expected Outcome**: The composer textarea is immediately populated with the starter text. The word count and character counter update in real-time.
- **Step 3.3**: Ensure the mode toggle is set to **"Reflect & Inquire"** and click **"Send"** (or press `Cmd+Enter`).
- **Expected Outcome**: The user's entry is displayed in the chat stream. A thinking spinner appears: *"Gemini is contemplating your reflection..."*. Within seconds, Gemini responds with empathetic inquiry and gentle guidance, marked with the active model tag (e.g., `gemini-3.6-flash`).
- **Step 3.4**: Verify the top status badge updates to **"Saved & Isolated"**.

### Test Case 4: Multi-Turn Continuity & Brainstorming Mode
- **Step 4.1**: In the same conversation, switch the mode selector to **"Brainstorm Ideas"**.
- **Step 4.2**: Enter a follow-up response: *"I want to break this down into 3 concrete actions I can take before noon tomorrow."*
- **Step 4.3**: Click **"Send"**.
- **Expected Outcome**: Gemini ingests the previous conversation turns and provides actionable brainstorming ideas tailored to the earlier context.

### Test Case 5: Summarization Mode
- **Step 5.1**: Switch the mode selector to **"Summarize"**.
- **Step 5.2**: Submit a message asking for an executive synthesis.
- **Expected Outcome**: Gemini responds with structured emotional milestones, core themes, and summary bullet points.

### Test Case 6: Firestore User-Isolation & Real-Time Sync
- **Step 6.1**: Check the left sidebar. The new reflection session appears at the top of the list with the turn count and date.
- **Step 6.2**: Type a query in the **"Search past reflections..."** input.
- **Expected Outcome**: The list filters instantly to matching entries.
- **Step 6.3**: Open Google Cloud Console > Firestore Studio.
- **Expected Outcome**: The document is located strictly under `/users/<CURRENT_USER_UID>/interactions/<SESSION_ID>`. Documents under another user's UID are strictly inaccessible and forbidden by Firestore rules.

### Test Case 7: Transaction Integrity & Offline Resilience
- **Step 7.1**: Disconnect network or simulate an error during submission.
- **Expected Outcome**: The application retains the user's entered text in the composer rather than clearing it. An amber warning banner appears with a **"Retry Save"** button. Clicking "Retry Save" after reconnecting completes the write without data loss.

### Test Case 8: Session Export & Deletion
- **Step 8.1**: Click the **"Export"** button in the workspace toolbar.
- **Expected Outcome**: A clean `.md` file containing the full conversation transcript with timestamps downloads to the local machine.
- **Step 8.2**: Hover over an entry in the sidebar and click the **Trash** icon. Confirm the deletion prompt.
- **Expected Outcome**: The entry is deleted from Cloud Firestore and disappears from the sidebar. If it was active, the canvas resets to a new session.

### Test Case 9: Sign Out
- **Step 9.1**: Click the **"Sign Out"** button in the header.
- **Expected Outcome**: User session is destroyed; user is redirected back to the landing page.

### Test Case 10: Location-Aware Entries (Google Maps Platform Integration)
- **Step 10.1**: In the workspace toolbar or composer, click the **"Pin Location"** button.
- **Expected Outcome**: The **"Pin Location to Reflection"** modal dialog opens. The modal shows preset contemplative sanctuaries (Kyoto Bamboo Grove, Big Sur Coastline, Walden Pond, Lake Como, etc.), custom coordinate input fields, and a live map or coordinate preview with the mandatory solution channel attribution `gmp_mcp_codeassist_v1_aistudio`.
- **Step 10.2**: Select one of the preset locations (e.g., "Kyoto Zen Bamboo Grove") or click "Use Current Location" to test browser GPS integration.
- **Expected Outcome**: The location selection updates with name, coordinates, and address.
- **Step 10.3**: Click **"Pin to Reflection"**.
- **Expected Outcome**:
  1. The modal closes.
  2. The toolbar updates to show the pinned location badge pill (e.g., `📍 Kyoto Zen Bamboo Grove`).
  3. The message area renders the interactive **Location Map Card** showcasing the pinned spot, coordinates, "Google Maps" external link, and the interactive map preview.
  4. The pinned location is persisted to Cloud Firestore under the user's isolated document.
  5. The sidebar history list displays the location pin next to the entry timestamp.
- **Step 10.4**: Click **"Export"** to download the Markdown file.
- **Expected Outcome**: The downloaded `.md` file contains the pinned location name, coordinates, and address at the top of the exported transcript.
- **Step 10.5**: Click the edit or remove button on the Location Map Card to test updating or clearing the location pin.
- **Expected Outcome**: Removing updates Firestore immediately and removes the badge from the toolbar and card from the message stream.

### Test Case 11: Role-Based Access Control (RBAC) & Admin Dashboard
- **Step 11.1**: Sign in as an administrator (e.g., `shreyasrivastava0407@gmail.com` or switch role to Admin using the role switcher simulation in development).
- **Expected Outcome**: The header displays an **"Admin"** navigation tab and a golden **"Admin"** role badge.
- **Step 11.2**: Click the **"Admin"** tab in the navigation bar.
- **Expected Outcome**: The Admin Dashboard opens, displaying 4 distinct management panes:
  1. **Directive & Architecture**: View live compliance audits against the Admin Roles Directive (Dual-Gate enforcement, owner-bound isolation, zero client-side role trust). Click **"Re-run Security Audit"** to see all checks pass green.
  2. **Role Management (RBAC)**: View all registered users, assign or revoke roles (`admin`, `moderator`, `user`), and test the Session Role Simulation switcher.
  3. **Global Share Governance**: View all reflection shares across the organization with target emails, permissions (`viewer` vs. `editor`), and revoke or change permissions directly.
  4. **System Health & Telemetry**: View real-time infrastructure indicators, model fallback latency, and active API boundaries.
- **Step 11.3**: Test the Role Simulation switcher by selecting "User".
- **Expected Outcome**: The UI updates dynamically, the Admin tab hides, and security checks revert to standard unprivileged user boundaries.

### Test Case 12: Peer-to-Peer Reflection Sharing & Permission Boundaries
- **Step 12.1**: Open an active reflection session in the Journal view.
- **Step 12.2**: Click the **"Share"** button in the workspace toolbar.
- **Expected Outcome**: The **"Share Reflection"** modal dialog opens, showing the reflection title, an email input field, and a permission selector (**"Viewer"** vs. **"Editor"**).
- **Step 12.3**: Enter a target colleague's email address (e.g., `colleague@example.com`), select **"Viewer"**, and click **"Grant Access"**.
- **Expected Outcome**: A new share grant is written to the `/shares` collection in Firestore with `ownerId`, `targetEmail`, and `permission: 'viewer'`. The active shares list displays the newly granted peer.
- **Step 12.4**: Switch permission of the granted user from **"Viewer"** to **"Editor"**.
- **Expected Outcome**: The permission updates dynamically in Firestore and reflects in the UI.
- **Step 12.5**: Navigate to the **"Shared"** tab in the top navigation bar.
- **Expected Outcome**: The Shared Reflections view opens with two sub-tabs:
  - **Shared with Me**: Displays reflections shared with the current user's email, indicating whether Viewer or Editor rights are held.
  - **Shared by Me**: Displays all active shares originated by the current user, with direct revoke buttons.
- **Step 12.6**: Click an entry in the "Shared with Me" list that has **Viewer** permissions.
- **Expected Outcome**: The reflection loads in read-only mode. The composer is replaced with a **"Viewer Mode: Read-Only Access"** banner, disabling turn submissions while allowing full conversational review.
