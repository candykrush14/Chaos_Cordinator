import React, { useState } from 'react';
import { ArrowLeft, User as UserIcon, Webhook } from 'lucide-react';
import type { UserProfile } from '../types';
import { AccountTab } from './profile/AccountTab';
import { IntegrationsTab } from './profile/IntegrationsTab';
import { ErrorBoundary } from './ErrorBoundary';

type ProfileTab = 'account' | 'integrations';

interface ProfileViewProps {
  user: UserProfile;
  onSignOut: () => void;
  onBackToJournal: () => void;
}

const TABS: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
  { id: 'account', label: 'Account', icon: <UserIcon className="h-3.5 w-3.5" /> },
  { id: 'integrations', label: 'Integrations', icon: <Webhook className="h-3.5 w-3.5" /> },
];

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  onSignOut,
  onBackToJournal,
}) => {
  const [tab, setTab] = useState<ProfileTab>('account');

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-[#fdfbf7]">
      <div className="shrink-0 border-b border-[#e5e0d8] px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToJournal}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#e5e0d8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#3d3d3d] transition-colors hover:bg-[#f5f2ed]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Journal</span>
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-semibold text-[#3d3d3d]">Profile</h1>
            <p className="truncate text-[11px] text-[#8c8579]">
              {user.email || user.displayName || 'Your account'}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-4xl items-center gap-1 rounded-xl border border-[#e5e0d8] bg-[#f5f2ed] p-1 sm:w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all sm:flex-none ${
                tab === t.id
                  ? 'bg-[#5a5a40] text-white shadow-xs'
                  : 'text-[#8c8579] hover:text-[#5a5a40]'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:py-6">
          <ErrorBoundary label={tab === 'integrations' ? 'your integrations' : 'your account'}>
            {tab === 'account' ? (
              <AccountTab user={user} onSignOut={onSignOut} />
            ) : (
              <IntegrationsTab />
            )}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};
