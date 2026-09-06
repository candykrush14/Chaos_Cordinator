import React from 'react';
import { BookOpen, LogOut, MapPin, Plus, ShieldCheck, Sparkles, User } from 'lucide-react';
import type { UserProfile } from '../types';

type AppView = 'journal' | 'locations' | 'profile';

interface NavbarProps {
  user: UserProfile | null;
  onSignOut: () => void;
  onNewReflection: () => void;
  hasActiveEntry: boolean;
  view: AppView;
  onChangeView: (view: AppView) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onSignOut,
  onNewReflection,
  view,
  onChangeView,
}) => {
  return (
    <header
      id="app-header"
      className="sticky top-0 z-30 w-full border-b border-[#e5e0d8] bg-[#fdfbf7]/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#5a5a40] text-white shadow-xs">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif text-xl font-semibold tracking-tight text-[#3d3d3d]">
                Reflections
              </span>
              <span className="hidden sm:flex items-center gap-1 rounded-full bg-[#f5f2ed] border border-[#e5e0d8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#5a5a40]">
                <Sparkles className="h-2.5 w-2.5" />
                Gemini 3.6
              </span>
            </div>
            <p className="text-[11px] text-[#8c8579] font-medium hidden sm:block">
              Private journal &amp; conversational reflections
            </p>
          </div>
        </div>

        {/* Primary view switch */}
        {user && (
          <div className="flex items-center gap-1 rounded-xl border border-[#e5e0d8] bg-[#f5f2ed] p-1">
            <button
              type="button"
              id="nav-view-journal-btn"
              onClick={() => onChangeView('journal')}
              aria-pressed={view === 'journal'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                view === 'journal'
                  ? 'bg-[#5a5a40] text-white shadow-xs'
                  : 'text-[#8c8579] hover:text-[#5a5a40]'
              }`}
              title="Journal"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Journal</span>
            </button>
            <button
              type="button"
              id="nav-view-locations-btn"
              onClick={() => onChangeView('locations')}
              aria-pressed={view === 'locations'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                view === 'locations'
                  ? 'bg-[#5a5a40] text-white shadow-xs'
                  : 'text-[#8c8579] hover:text-[#5a5a40]'
              }`}
              title="Location-Aware Entries"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Locations</span>
            </button>
            <button
              type="button"
              id="nav-view-profile-btn"
              onClick={() => onChangeView('profile')}
              aria-pressed={view === 'profile'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                view === 'profile'
                  ? 'bg-[#5a5a40] text-white shadow-xs'
                  : 'text-[#8c8579] hover:text-[#5a5a40]'
              }`}
              title="Profile & integrations"
            >
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Profile</span>
            </button>
          </div>
        )}

        {/* User profile & actions */}
        {user ? (
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              id="new-reflection-header-btn"
              onClick={onNewReflection}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5a5a40] px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:bg-[#4a4a35] active:scale-[0.99] shadow-xs cursor-pointer"
              title="Start a new reflection session"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Entry</span>
            </button>

            <div className="h-6 w-px bg-[#e5e0d8] hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="hidden lg:block text-right leading-tight">
                <p className="text-[10px] font-bold text-[#8c8579] uppercase tracking-widest">
                  Authenticated
                </p>
                <p className="text-xs sm:text-sm font-medium text-[#3d3d3d] truncate max-w-[160px]">
                  {user.email || user.displayName || 'Journaler'}
                </p>
              </div>

              <button
                type="button"
                id="nav-avatar-profile-btn"
                onClick={() => onChangeView('profile')}
                title="Profile & integrations"
                className={`w-9 h-9 rounded-full border-2 p-0.5 shrink-0 cursor-pointer transition-colors ${
                  view === 'profile' ? 'border-[#3d3d3d]' : 'border-[#5a5a40] hover:border-[#3d3d3d]'
                }`}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User Avatar'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-[#d4cdc3] flex items-center justify-center text-[#5a5a40] font-bold text-xs">
                    {user.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'ME'}
                  </div>
                )}
              </button>
            </div>

            <button
              id="sign-out-btn"
              onClick={onSignOut}
              className="ml-1 text-xs sm:text-sm text-[#8c8579] hover:text-[#5a5a40] font-medium transition-colors cursor-pointer"
              title="Sign Out"
            >
              <span className="hidden sm:inline">Sign Out</span>
              <LogOut className="h-3.5 w-3.5 sm:hidden" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#8c8579] font-medium uppercase tracking-widest">
            <ShieldCheck className="h-4 w-4 text-[#5a5a40]" />
            <span>Encrypted Storage</span>
          </div>
        )}
      </div>
    </header>
  );
};
