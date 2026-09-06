/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  auth,
  signInWithGoogle,
  logOut,
  onAuthStateChanged,
} from './firebase/config';
import { Navbar } from './components/Navbar';
import { AuthLanding } from './components/AuthLanding';
import { JournalDashboard } from './components/JournalDashboard';
import { LocationsMapView } from './components/LocationsMapView';
import { ProfileView } from './components/ProfileView';
import { AdminDashboard } from './components/AdminDashboard';
import { SharedReflectionsView } from './components/SharedReflectionsView';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { UserProfile, JournalInteraction, UserRole, AppView } from './types';
import { getEffectiveUserRole } from './utils/rbac';
import { BookOpen } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<JournalInteraction | null>(null);
  const [activePermission, setActivePermission] = useState<'viewer' | 'editor' | undefined>(undefined);
  const [view, setView] = useState<AppView>('journal');

  // 1. Subscribe to Firebase Auth State and resolve Authoritative User Role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          providerId: firebaseUser.providerData?.[0]?.providerId ?? null,
          createdAt: firebaseUser.metadata?.creationTime ?? null,
          lastSignInAt: firebaseUser.metadata?.lastSignInTime ?? null,
        };
        setUser(userProfile);

        // Authoritative server-side role resolution with security simulation support
        try {
          const resolvedRole = await getEffectiveUserRole(userProfile);
          setRole(resolvedRole);
        } catch (e) {
          console.error('Failed to resolve user role:', e);
          setRole('user');
        }
      } else {
        setUser(null);
        setRole('user');
        setActiveInteraction(null);
        setActivePermission(undefined);
        setView('journal');
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Google Sign-In Handler
  const handleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Sign in failed:', err);
      setAuthError(
        err?.message ||
          'Failed to sign in with Google. If using an iframe preview, please allow popups or open the app in a new tab.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  // 3. Sign-Out Handler
  const handleSignOut = async () => {
    try {
      await logOut();
      setUser(null);
      setRole('user');
      setActiveInteraction(null);
      setActivePermission(undefined);
      setView('journal');
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  // 4. Start a clean new reflection canvas
  const handleNewReflection = () => {
    setView('journal');
    setActivePermission(undefined);
    setActiveInteraction({
      id: 'int-' + Date.now(),
      userId: user?.uid || '',
      title: 'New Reflection Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mode: 'reflection',
      messages: [],
    });
  };

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#fdfbf7] text-[#3d3d3d]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5a5a40] text-white shadow-md">
            <BookOpen className="h-6 w-6 animate-pulse" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-[#8c8579]">
            Initializing secure session...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#fdfbf7] font-sans text-[#3d3d3d] antialiased selection:bg-[#e5e0d8]">
      <Navbar
        user={user}
        role={role}
        onSignOut={handleSignOut}
        onNewReflection={handleNewReflection}
        hasActiveEntry={Boolean(activeInteraction && activeInteraction.messages?.length > 0)}
        view={view}
        onChangeView={setView}
      />

      {/* Keyed by view so switching tabs clears a previously caught error. */}
      <ErrorBoundary
        key={view}
        label={
          view === 'locations'
            ? 'the map view'
            : view === 'profile'
            ? 'your profile'
            : view === 'admin'
            ? 'the admin dashboard'
            : view === 'shared'
            ? 'the shared reflections'
            : 'your journal'
        }
      >
        {!user ? (
          <AuthLanding
            onSignIn={handleSignIn}
            isLoading={isSigningIn}
            errorMessage={authError}
            onClearError={() => setAuthError(null)}
          />
        ) : view === 'profile' ? (
          <ProfileView
            user={user}
            onSignOut={handleSignOut}
            onBackToJournal={() => setView('journal')}
          />
        ) : view === 'locations' ? (
          <LocationsMapView
            user={user}
            onOpenEntry={(entry) => {
              setActiveInteraction(entry);
              setActivePermission(undefined);
              setView('journal');
            }}
            onBackToJournal={() => setView('journal')}
          />
        ) : view === 'admin' ? (
          <AdminDashboard
            currentUser={user}
            currentRole={role}
            onRoleChanged={(newRole) => setRole(newRole)}
            onBackToJournal={() => setView('journal')}
          />
        ) : view === 'shared' ? (
          <SharedReflectionsView
            user={user}
            onOpenEntry={(entry, perm) => {
              setActiveInteraction(entry);
              setActivePermission(perm);
              setView('journal');
            }}
            onBackToJournal={() => setView('journal')}
          />
        ) : (
          <JournalDashboard
            user={user}
            activeInteraction={activeInteraction}
            activePermission={activePermission}
            onSelectInteraction={(interaction) => {
              setActiveInteraction(interaction);
              setActivePermission(undefined);
            }}
            onNewReflection={handleNewReflection}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}
