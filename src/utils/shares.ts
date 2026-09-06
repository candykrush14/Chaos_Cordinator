import {
  db,
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  where,
} from '../firebase/config';
import type { ReflectionShare, SharePermission, UserProfile } from '../types';
import { stripUndefined } from './sanitize';

const LOCAL_SHARES_KEY = 'reflections_local_shares';

function getLocalShares(): ReflectionShare[] {
  try {
    const raw = localStorage.getItem(LOCAL_SHARES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalShares(shares: ReflectionShare[]): void {
  try {
    localStorage.setItem(LOCAL_SHARES_KEY, JSON.stringify(shares));
  } catch {
    // Ignore storage quota
  }
}

/**
 * Create a new share grant for a reflection
 */
export async function createShare(
  owner: UserProfile,
  reflectionId: string,
  reflectionTitle: string,
  targetEmail: string,
  permission: SharePermission
): Promise<ReflectionShare> {
  const cleanEmail = targetEmail.trim().toLowerCase();
  const shareId = `share_${owner.uid}_${reflectionId}_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
  const now = new Date().toISOString();

  const share: ReflectionShare = {
    id: shareId,
    reflectionId,
    reflectionTitle,
    ownerId: owner.uid,
    ownerEmail: owner.email || null,
    ownerName: owner.displayName || null,
    targetEmail: cleanEmail,
    permission,
    createdAt: now,
    updatedAt: now,
  };

  // 1. Save to local fallback cache
  const localList = getLocalShares().filter((s) => s.id !== shareId);
  localList.unshift(share);
  saveLocalShares(localList);

  // 2. Persist to Firestore
  try {
    const docRef = doc(db, 'shares', shareId);
    await setDoc(docRef, stripUndefined(share), { merge: true });
  } catch (err) {
    console.warn('[Shares] Firestore save share warning:', err);
  }

  return share;
}

/**
 * List shares for the current user:
 * - "sharedWithMe": shares where targetEmail === user.email or targetUserId === user.uid
 * - "sharedByMe": shares where ownerId === user.uid
 */
export async function listUserShares(
  user: UserProfile
): Promise<{ sharedWithMe: ReflectionShare[]; sharedByMe: ReflectionShare[] }> {
  const localShares = getLocalShares();
  const email = (user.email || '').toLowerCase();

  let allShares: ReflectionShare[] = [...localShares];

  try {
    // Attempt Firestore fetch
    const snap = await getDocs(collection(db, 'shares'));
    if (!snap.empty) {
      const fsShares = snap.docs.map((d) => d.data() as ReflectionShare);
      // Merge unique by id
      const map = new Map<string, ReflectionShare>();
      allShares.forEach((s) => map.set(s.id, s));
      fsShares.forEach((s) => map.set(s.id, s));
      allShares = Array.from(map.values());
    }
  } catch (err) {
    console.warn('[Shares] Could not fetch remote shares, using local store:', err);
  }

  const sharedByMe = allShares.filter((s) => s.ownerId === user.uid);
  const sharedWithMe = allShares.filter(
    (s) =>
      s.ownerId !== user.uid &&
      ((s.targetEmail && s.targetEmail.toLowerCase() === email) ||
        (s.targetUserId && s.targetUserId === user.uid))
  );

  return { sharedWithMe, sharedByMe };
}

/**
 * List all shares across the platform (for administrators)
 */
export async function listAllSharesForAdmin(): Promise<ReflectionShare[]> {
  const localShares = getLocalShares();
  let allShares: ReflectionShare[] = [...localShares];

  try {
    const snap = await getDocs(collection(db, 'shares'));
    if (!snap.empty) {
      const fsShares = snap.docs.map((d) => d.data() as ReflectionShare);
      const map = new Map<string, ReflectionShare>();
      allShares.forEach((s) => map.set(s.id, s));
      fsShares.forEach((s) => map.set(s.id, s));
      allShares = Array.from(map.values());
    }
  } catch (err) {
    console.warn('[Shares] Admin shares read fallback:', err);
  }

  return allShares.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * Update permission level for an existing share
 */
export async function updateSharePermission(
  shareId: string,
  newPermission: SharePermission
): Promise<void> {
  const localShares = getLocalShares();
  const match = localShares.find((s) => s.id === shareId);
  if (match) {
    match.permission = newPermission;
    match.updatedAt = new Date().toISOString();
    saveLocalShares(localShares);
  }

  try {
    const docRef = doc(db, 'shares', shareId);
    await setDoc(docRef, { permission: newPermission, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn('[Shares] Firestore update share failed:', err);
  }
}

/**
 * Revoke/delete a share
 */
export async function revokeShare(shareId: string): Promise<void> {
  const localShares = getLocalShares().filter((s) => s.id !== shareId);
  saveLocalShares(localShares);

  try {
    const docRef = doc(db, 'shares', shareId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('[Shares] Firestore delete share failed:', err);
  }
}
