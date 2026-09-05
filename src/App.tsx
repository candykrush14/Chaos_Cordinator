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
import type { UserProfile, JournalInteraction } from './types';
import { BookOpen } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<JournalInteraction | null>(null);

  // 1. Subscribe to Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
        setActiveInteraction(null);
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
      setActiveInteraction(null);
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  // 4. Start a clean new reflection canvas
  const handleNewReflection = () => {
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
      <div className="flex min-h-screen items-center justify-center bg-[#fdfbf7] text-[#3d3d3d]">
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
    <div className="min-h-screen bg-[#fdfbf7] font-sans text-[#3d3d3d] antialiased selection:bg-[#e5e0d8]">
      <Navbar
        user={user}
        onSignOut={handleSignOut}
        onNewReflection={handleNewReflection}
        hasActiveEntry={Boolean(activeInteraction && activeInteraction.messages?.length > 0)}
      />

      {!user ? (
        <AuthLanding
          onSignIn={handleSignIn}
          isLoading={isSigningIn}
          errorMessage={authError}
          onClearError={() => setAuthError(null)}
        />
      ) : (
        <JournalDashboard
          user={user}
          activeInteraction={activeInteraction}
          onSelectInteraction={(interaction) => setActiveInteraction(interaction)}
          onNewReflection={handleNewReflection}
        />
      )}
    </div>
  );
}
