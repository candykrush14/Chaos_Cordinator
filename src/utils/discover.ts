import { db, doc, getDoc, setDoc, authedFetch } from '../firebase/config';
import type {
  DiscoverMeAnalysis,
  DailyNudge,
  JournalInteraction,
  WellnessPointsRecord,
} from '../types';
import { stripUndefined } from './sanitize';

const LOCAL_WELLNESS_KEY = 'reflections_wellness_state';

/**
 * Persisted wellness progress. Extends the shared WellnessPointsRecord with the
 * bookkeeping the view needs so points can't be farmed by reloading.
 */
export interface WellnessState extends WellnessPointsRecord {
  /** YYYY-MM-DD of the last analysis that awarded points. */
  lastAnalysisDate?: string;
  /** Cached report, so revisiting doesn't re-bill Gemini or re-award points. */
  lastAnalysis?: DiscoverMeAnalysis | null;
  /** Claimed nudges as "YYYY-MM-DD:nudge-id" so each counts once per day. */
  claimedNudges?: string[];
  lastActiveDate?: string;
}

export const EMPTY_WELLNESS: WellnessState = {
  totalPoints: 0,
  level: 'Seedling',
  streakDays: 0,
  recentBadges: [],
  pointsHistory: [],
  claimedNudges: [],
  lastAnalysis: null,
};

const LEVELS: { min: number; name: string }[] = [
  { min: 0, name: 'Seedling' },
  { min: 100, name: 'Sprout' },
  { min: 250, name: 'Grounded' },
  { min: 500, name: 'Flourishing' },
  { min: 1000, name: 'Radiant' },
  { min: 2000, name: 'Luminary' },
];

export function levelFor(points: number): string {
  let name = LEVELS[0].name;
  for (const level of LEVELS) if (points >= level.min) name = level.name;
  return name;
}

export function nextLevelFor(points: number): { name: string; remaining: number } | null {
  const upcoming = LEVELS.find((l) => points < l.min);
  return upcoming ? { name: upcoming.name, remaining: upcoming.min - points } : null;
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ---------------------------------------------------------------------------
 * Persistence - Firestore with a localStorage mirror.
 * Rules already allow /users/{uid}/wellness/{doc}; if they haven't been
 * deployed yet the feature still works, just per-device.
 * ------------------------------------------------------------------------- */

function localKey(uid: string): string {
  return `${LOCAL_WELLNESS_KEY}_${uid || 'anon'}`;
}

function readLocal(uid: string): WellnessState {
  try {
    const raw = localStorage.getItem(localKey(uid));
    return raw ? { ...EMPTY_WELLNESS, ...JSON.parse(raw) } : { ...EMPTY_WELLNESS };
  } catch {
    return { ...EMPTY_WELLNESS };
  }
}

function writeLocal(uid: string, state: WellnessState): void {
  try {
    localStorage.setItem(localKey(uid), JSON.stringify(state));
  } catch {
    // Quota or private mode - Firestore remains the source of truth.
  }
}

function wellnessDocRef(uid: string) {
  return doc(db, 'users', uid, 'wellness', 'summary');
}

export async function loadWellness(uid: string): Promise<WellnessState> {
  const local = readLocal(uid);
  if (!uid) return local;
  try {
    const snap = await getDoc(wellnessDocRef(uid));
    if (snap.exists()) {
      const merged = { ...EMPTY_WELLNESS, ...(snap.data() as WellnessState) };
      writeLocal(uid, merged);
      return merged;
    }
  } catch (err) {
    console.warn('[discover] Wellness read failed, using local copy:', err);
  }
  return local;
}

export async function saveWellness(uid: string, state: WellnessState): Promise<void> {
  writeLocal(uid, state);
  if (!uid) return;
  try {
    await setDoc(wellnessDocRef(uid), stripUndefined(state), { merge: true });
  } catch (err) {
    console.warn('[discover] Wellness write failed (kept locally):', err);
  }
}

/* ---------------------------------------------------------------------------
 * Analysis
 * ------------------------------------------------------------------------- */

export interface DiscoverEntryPayload {
  title: string;
  category: string;
  createdAt: string;
  excerpt: string;
  messagesCount: number;
}

/** Shapes journal entries into what POST /api/discover-me expects. */
export function buildEntryPayload(
  interactions: JournalInteraction[],
  limit = 25
): DiscoverEntryPayload[] {
  return interactions.slice(0, limit).map((entry) => {
    // Everything the user themselves wrote in this session - not just the
    // opening line - so the analysis has real material to read. Model replies
    // are excluded so the report reflects the user's voice, not Gemini's.
    const ownWords = (entry.messages || [])
      .filter((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim())
      .map((m) => m.content.trim())
      .join(' ');

    return {
      title: entry.title || 'Untitled Reflection',
      category: entry.category || 'personal',
      createdAt: entry.createdAt || entry.updatedAt || '',
      excerpt: ownWords.replace(/\s+/g, ' ').trim().slice(0, 1000),
      messagesCount: entry.messages?.length || 0,
    };
  });
}

export async function runDiscoverAnalysis(params: {
  entries: DiscoverEntryPayload[];
  previousHappinessIndex: number | null;
  totalPoints: number;
}): Promise<{ analysis: DiscoverMeAnalysis; entriesAnalyzed: number }> {
  const res = await authedFetch('/api/discover-me', {
    method: 'POST',
    body: JSON.stringify(params),
  });

  const raw = await res.text().catch(() => '');
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* handled below */
  }

  if (!res.ok || !data?.success || !data?.data) {
    if (data?.error) throw new Error(data.error);
    if (raw && data === null && /^\s*<(?:!doctype|html)/i.test(raw)) {
      throw new Error(
        "The API returned the app's HTML page instead of JSON. Restart the dev server so " +
          'Express picks up /api/discover-me.'
      );
    }
    throw new Error(`Discover Me analysis failed (HTTP ${res.status}).`);
  }

  return {
    analysis: data.data as DiscoverMeAnalysis,
    entriesAnalyzed: Number(data.entriesAnalyzed) || 0,
  };
}

/* ---------------------------------------------------------------------------
 * Rewards
 * ------------------------------------------------------------------------- */

function nextStreak(state: WellnessState, today: string): number {
  if (!state.lastActiveDate) return 1;
  if (state.lastActiveDate === today) return state.streakDays || 1;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return state.lastActiveDate === todayKey(yesterday) ? (state.streakDays || 0) + 1 : 1;
}

function withBadges(existing: string[], earned: string[]): string[] {
  return Array.from(new Set([...earned, ...(existing || [])])).slice(0, 6);
}

/**
 * Applies an analysis to the saved record. Points are granted at most once per
 * calendar day so re-running the report can't inflate the score.
 */
export function applyAnalysisRewards(
  state: WellnessState,
  analysis: DiscoverMeAnalysis
): { next: WellnessState; awarded: number; alreadyClaimedToday: boolean } {
  const today = todayKey();
  const alreadyClaimedToday = state.lastAnalysisDate === today;

  if (alreadyClaimedToday) {
    return {
      next: {
        ...state,
        lastAnalysis: analysis,
        lastHappinessIndex: analysis.happinessIndex,
      },
      awarded: 0,
      alreadyClaimedToday: true,
    };
  }

  const delta = Number(analysis.happinessDelta) || 0;
  const awarded = Math.max(0, Math.round(Number(analysis.pointsAwarded) || 0));
  const totalPoints = (state.totalPoints || 0) + awarded;
  const streakDays = nextStreak(state, today);

  const earned: string[] = [];
  if (delta > 0) earned.push('Mood Riser');
  if (streakDays >= 7) earned.push('7-Day Streak');
  if (streakDays >= 30) earned.push('30-Day Devotion');
  if (totalPoints >= 500) earned.push('Flourishing Mind');

  const next: WellnessState = {
    ...state,
    totalPoints,
    level: levelFor(totalPoints),
    streakDays,
    lastActiveDate: today,
    lastAnalysisDate: today,
    lastAnalysis: analysis,
    lastHappinessIndex: analysis.happinessIndex,
    recentBadges: withBadges(state.recentBadges || [], earned),
    pointsHistory: [
      {
        id: `pts-${Date.now()}`,
        reason:
          delta > 0
            ? `Happiness index rose ${delta > 0 ? '+' : ''}${delta} points`
            : 'Daily reflection check-in',
        points: awarded,
        timestamp: new Date().toISOString(),
      },
      ...(state.pointsHistory || []),
    ].slice(0, 30),
  };

  return { next, awarded, alreadyClaimedToday: false };
}

export function nudgeClaimKey(nudge: DailyNudge, day = todayKey()): string {
  return `${day}:${nudge.id}`;
}

export function isNudgeClaimed(state: WellnessState, nudge: DailyNudge): boolean {
  return (state.claimedNudges || []).includes(nudgeClaimKey(nudge));
}

/** Completing a healthy-living nudge banks its points, once per day. */
export function claimNudge(
  state: WellnessState,
  nudge: DailyNudge
): { next: WellnessState; awarded: number } {
  if (isNudgeClaimed(state, nudge)) return { next: state, awarded: 0 };

  const awarded = Math.max(0, Math.round(Number(nudge.points) || 0));
  const totalPoints = (state.totalPoints || 0) + awarded;

  return {
    awarded,
    next: {
      ...state,
      totalPoints,
      level: levelFor(totalPoints),
      claimedNudges: [...(state.claimedNudges || []), nudgeClaimKey(nudge)].slice(-60),
      pointsHistory: [
        {
          id: `pts-${Date.now()}`,
          reason: `Completed: ${nudge.text}`,
          points: awarded,
          timestamp: new Date().toISOString(),
        },
        ...(state.pointsHistory || []),
      ].slice(0, 30),
    },
  };
}
