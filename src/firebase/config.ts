import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { stripUndefined } from '../utils/sanitize';
import type { JournalInteraction } from '../types';

// Initialize Firebase App singleton
export const app = getApps().length > 0 ? getApp() : initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Initialize Firestore pointing to the provisioned database
export const db: Firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Authentication helper with user-friendly popup handling
export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    // If popup was blocked or closed by user
    if (error.code === 'auth/popup-blocked') {
      throw new Error('Sign-in popup was blocked by your browser. Please allow popups or open the app in a new tab.');
    } else if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in popup was closed before completing authentication.');
    }
    throw error;
  }
}

export async function logOut(): Promise<void> {
  await firebaseSignOut(auth);
}

// Fresh Firebase ID token for authenticating calls to our own /api/* endpoints.
// The SDK caches and auto-refreshes; returns null when signed out.
export async function getIdToken(): Promise<string | null> {
  const current = auth.currentUser;
  if (!current) return null;
  try {
    return await current.getIdToken();
  } catch (err) {
    console.error('Failed to acquire ID token:', err);
    return null;
  }
}

// Fetch wrapper that attaches the caller's Firebase ID token.
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

// Firestore operations isolated strictly to /users/{userId}/interactions/{interactionId}
export function getInteractionsCollectionRef(userId: string) {
  if (!userId) throw new Error('Cannot access interactions without a valid userId.');
  return collection(db, 'users', userId, 'interactions');
}

export function getInteractionDocRef(userId: string, interactionId: string) {
  if (!userId || !interactionId) throw new Error('Missing userId or interactionId.');
  return doc(db, 'users', userId, 'interactions', interactionId);
}

export async function saveInteractionToFirestore(
  userId: string,
  interaction: JournalInteraction
): Promise<void> {
  if (!userId) throw new Error('User is not authenticated.');
  const docRef = getInteractionDocRef(userId, interaction.id);
  const cleanPayload = stripUndefined({
    ...interaction,
    userId,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(docRef, cleanPayload, { merge: true });
}

export async function deleteInteractionFromFirestore(
  userId: string,
  interactionId: string
): Promise<void> {
  if (!userId || !interactionId) return;
  const docRef = getInteractionDocRef(userId, interactionId);
  await deleteDoc(docRef);
}

export { onAuthStateChanged, collection, doc, query, orderBy, onSnapshot, getDocs, getDoc };
