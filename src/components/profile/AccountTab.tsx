import React from 'react';
import { LogOut, ShieldCheck, Mail, Fingerprint, Clock, KeyRound } from 'lucide-react';
import type { UserProfile } from '../../types';
import { formatJournalDate } from '../../utils/sanitize';

interface AccountTabProps {
  user: UserProfile;
  onSignOut: () => void;
}

const Row: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({
  icon,
  label,
  value,
}) => (
  <div className="flex items-start gap-3 border-b border-[#e5e0d8] py-3 last:border-b-0">
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f5f2ed] text-[#5a5a40]">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[11px] font-bold uppercase tracking-widest text-[#8c8579]">{label}</div>
      <div className="mt-0.5 break-words text-sm text-[#3d3d3d]">{value}</div>
    </div>
  </div>
);

export const AccountTab: React.FC<AccountTabProps> = ({ user, onSignOut }) => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-[#3d3d3d]">Account</h2>
        <p className="mt-1 text-sm text-[#8c8579]">
          Your Google identity and where your journal lives.
        </p>
      </div>

      <div className="rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full border-2 border-[#5a5a40] p-1">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Account avatar'}
                referrerPolicy="no-referrer"
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[#d4cdc3] text-lg font-bold text-[#5a5a40]">
                {(user.displayName || user.email || 'ME').slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-serif text-2xl font-semibold text-[#3d3d3d]">
              {user.displayName || 'Journaler'}
            </h3>
            <p className="truncate text-sm text-[#8c8579]">{user.email || 'No email on file'}</p>
          </div>
        </div>

        <div className="mt-4 border-t border-[#e5e0d8] pt-1">
          <Row
            icon={<Mail className="h-3.5 w-3.5" />}
            label="Email"
            value={user.email || '—'}
          />
          <Row
            icon={<KeyRound className="h-3.5 w-3.5" />}
            label="Sign-in method"
            value={
              user.providerId === 'google.com'
                ? 'Google (federated — no password stored)'
                : user.providerId || 'Google'
            }
          />
          <Row
            icon={<Fingerprint className="h-3.5 w-3.5" />}
            label="User ID"
            value={<span className="font-mono text-xs break-all">{user.uid}</span>}
          />
          {user.createdAt && (
            <Row
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Member since"
              value={formatJournalDate(user.createdAt)}
            />
          )}
          {user.lastSignInAt && (
            <Row
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Last sign-in"
              value={formatJournalDate(user.lastSignInAt)}
            />
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-[#e5e0d8] bg-[#f5f2ed]/70 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#5a5a40]" />
        <div className="text-xs leading-relaxed text-[#3d3d3d]">
          <p className="font-semibold">Your entries are isolated to this account.</p>
          <p className="mt-1 text-[#8c8579]">
            Reflections live at <span className="font-mono">/users/{user.uid.slice(0, 6)}…/interactions</span>{' '}
            in Cloud Firestore, readable and writable only by your verified Google UID. Journal text
            is sent to Gemini through this app&apos;s server so the API key is never exposed to
            your browser.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e5e0d8] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#3d3d3d]">Sign out</h3>
            <p className="mt-0.5 text-xs text-[#8c8579]">
              Ends this session on this device. Your entries stay saved.
            </p>
          </div>
          <button
            type="button"
            id="account-sign-out-btn"
            onClick={onSignOut}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#e5e0d8] bg-white px-4 py-2 text-xs font-semibold text-[#3d3d3d] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
