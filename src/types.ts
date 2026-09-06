export type AIMode = 'reflection' | 'summary' | 'brainstorm';

export const AI_MODES: { id: AIMode; label: string }[] = [
  { id: 'reflection', label: 'Reflect' },
  { id: 'summary', label: 'Summarize' },
  { id: 'brainstorm', label: 'Brainstorm' },
];

export type ReflectionCategory =
  | 'personal'
  | 'work'
  | 'ideas'
  | 'gratitude'
  | 'mindfulness';

export const REFLECTION_CATEGORIES: { id: ReflectionCategory; label: string }[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'work', label: 'Work' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'gratitude', label: 'Gratitude' },
  { id: 'mindfulness', label: 'Mindfulness' },
];

export interface JournalMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string; // ISO string
  modelUsed?: string;
  mode?: AIMode;
}

export interface JournalLocation {
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

export interface JournalInteraction {
  id: string;
  userId: string;
  title: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  mode: AIMode;
  messages: JournalMessage[];
  category?: ReflectionCategory;
  summary?: string;
  tags?: string[];
  isPinned?: boolean;
  location?: JournalLocation;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId?: string | null;
  createdAt?: string | null;
  lastSignInAt?: string | null;
}

/* ---------------------------------------------------------------------------
 * Outbound notification webhooks
 * ------------------------------------------------------------------------- */

export type WebhookDestination = 'discord' | 'slack' | 'other';

export const WEBHOOK_DESTINATIONS: {
  id: WebhookDestination;
  label: string;
  hint: string;
  urlPlaceholder: string;
  namePlaceholder: string;
}[] = [
  {
    id: 'discord',
    label: 'Discord',
    hint: 'Server Settings → Integrations → Webhooks → Copy Webhook URL. Arrives as a rich embed.',
    urlPlaceholder: 'https://discord.com/api/webhooks/…',
    namePlaceholder: '#journal in my server',
  },
  {
    id: 'slack',
    label: 'Slack',
    hint: 'Slack app → Incoming Webhooks → Add New Webhook to Workspace. Arrives as a Block Kit message.',
    urlPlaceholder: 'https://hooks.slack.com/services/…',
    namePlaceholder: '#journal in my workspace',
  },
  {
    id: 'other',
    label: 'Other',
    hint: 'Any HTTPS endpoint. Receives signed JSON — verify the X-Reflections-Signature header with the secret shown after you save.',
    urlPlaceholder: 'https://example.com/hooks/reflections',
    namePlaceholder: 'My automation endpoint',
  },
];

export type WebhookEvent =
  | 'reflection.created'
  | 'reflection.updated'
  | 'reflection.located'
  | 'reflection.deleted';

export const WEBHOOK_EVENTS: { id: WebhookEvent; description: string }[] = [
  {
    id: 'reflection.created',
    description: 'A new reflection is saved for the first time.',
  },
  {
    id: 'reflection.updated',
    description: 'An existing reflection changes title, body or category.',
  },
  {
    id: 'reflection.located',
    description: 'A reflection is pinned to a place on the map.',
  },
  {
    id: 'reflection.deleted',
    description: 'A reflection is removed from the journal.',
  },
];

export type WebhookLocationFilter = 'any' | 'pinned' | 'unpinned';

export const WEBHOOK_LOCATION_FILTERS: { id: WebhookLocationFilter; label: string }[] = [
  { id: 'any', label: 'Anywhere' },
  { id: 'pinned', label: 'Pinned to a place' },
  { id: 'unpinned', label: 'Not pinned' },
];

export interface WebhookFilters {
  /** Empty array means "every category". */
  categories: ReflectionCategory[];
  /** Empty array means "every mode". */
  modes: AIMode[];
  location: WebhookLocationFilter;
}

export interface WebhookDeliveryResult {
  status: 'success' | 'failed';
  at: string; // ISO string
  event?: WebhookEvent;
  statusCode?: number;
  error?: string;
}

/**
 * What the client is allowed to see. The raw webhook URL and signing secret
 * never leave the server - only a masked preview does.
 */
export interface WebhookEndpointSummary {
  id: string;
  destination: WebhookDestination;
  name: string;
  urlPreview: string;
  events: WebhookEvent[];
  filters: WebhookFilters;
  enabled: boolean;
  hasSigningSecret: boolean;
  createdAt: string;
  updatedAt: string;
  lastDelivery?: WebhookDeliveryResult;
}

export interface WebhookEndpointInput {
  destination: WebhookDestination;
  name: string;
  url: string;
  events: WebhookEvent[];
  filters: WebhookFilters;
  enabled?: boolean;
}

export const DEFAULT_WEBHOOK_FILTERS: WebhookFilters = {
  categories: [],
  modes: [],
  location: 'any',
};
