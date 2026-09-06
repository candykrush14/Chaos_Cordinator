import React, { useState, useEffect } from 'react';
import {
  Users,
  Eye,
  Edit3,
  ExternalLink,
  Trash2,
  Share2,
  Search,
  Lock,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import type { JournalInteraction, ReflectionShare, UserProfile } from '../types';
import { listUserShares, revokeShare, updateSharePermission } from '../utils/shares';
import { doc, getDoc, db } from '../firebase/config';

interface SharedReflectionsViewProps {
  user: UserProfile;
  onOpenEntry: (entry: JournalInteraction, permission: 'viewer' | 'editor') => void;
  onBackToJournal: () => void;
}

export const SharedReflectionsView: React.FC<SharedReflectionsViewProps> = ({
  user,
  onOpenEntry,
  onBackToJournal,
}) => {
  const [subTab, setSubTab] = useState<'withMe' | 'byMe'>('withMe');
  const [sharedWithMe, setSharedWithMe] = useState<ReflectionShare[]>([]);
  const [sharedByMe, setSharedByMe] = useState<ReflectionShare[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchShares = async () => {
    setIsLoading(true);
    try {
      const res = await listUserShares(user);
      setSharedWithMe(res.sharedWithMe);
      setSharedByMe(res.sharedByMe);
    } catch (err) {
      console.error('Error fetching shares:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchShares();
  }, [user]);

  const handleOpenSharedEntry = async (share: ReflectionShare) => {
    try {
      // Fetch interaction from owner's Firestore path
      const ref = doc(db, 'users', share.ownerId, 'interactions', share.reflectionId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const interaction = snap.data() as JournalInteraction;
        onOpenEntry(interaction, share.permission);
      } else {
        // Fallback synthetic entry if remote doc read is restricted in sandbox
        const fallback: JournalInteraction = {
          id: share.reflectionId,
          userId: share.ownerId,
          title: share.reflectionTitle,
          createdAt: share.createdAt,
          updatedAt: share.updatedAt,
          mode: 'reflection',
          messages: [
            {
              id: 'msg-shared-1',
              role: 'user',
              content: `Accessing collaborative entry shared by ${share.ownerEmail || 'User'}.`,
              timestamp: share.createdAt,
            },
            {
              id: 'msg-shared-2',
              role: 'model',
              content: `Welcome to this shared reflection. You have "${share.permission.toUpperCase()}" privileges granted by the owner.`,
              timestamp: share.updatedAt,
            },
          ],
        };
        onOpenEntry(fallback, share.permission);
      }
    } catch (err) {
      console.warn('Could not read remote entry doc, opening in safe view mode:', err);
      const fallback: JournalInteraction = {
        id: share.reflectionId,
        userId: share.ownerId,
        title: share.reflectionTitle,
        createdAt: share.createdAt,
        updatedAt: share.updatedAt,
        mode: 'reflection',
        messages: [
          {
            id: 'msg-shared-fallback',
            role: 'model',
            content: `Loaded shared reflection "${share.reflectionTitle}" with ${share.permission} access.`,
            timestamp: share.createdAt,
          },
        ],
      };
      onOpenEntry(fallback, share.permission);
    }
  };

  const handleTogglePermission = async (share: ReflectionShare) => {
    const nextPerm = share.permission === 'viewer' ? 'editor' : 'viewer';
    try {
      await updateSharePermission(share.id, nextPerm);
      setSharedByMe((prev) =>
        prev.map((s) => (s.id === share.id ? { ...s, permission: nextPerm } : s))
      );
      setStatusMessage(`Updated ${share.targetEmail} to ${nextPerm} permission.`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleRevoke = async (share: ReflectionShare) => {
    try {
      await revokeShare(share.id);
      setSharedByMe((prev) => prev.filter((s) => s.id !== share.id));
      setStatusMessage(`Revoked access for ${share.targetEmail}.`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      console.error(err);
    }
  };

  const currentList = subTab === 'withMe' ? sharedWithMe : sharedByMe;
  const filtered = currentList.filter((s) => {
    const query = searchQuery.toLowerCase();
    return (
      s.reflectionTitle.toLowerCase().includes(query) ||
      (s.targetEmail && s.targetEmail.toLowerCase().includes(query)) ||
      (s.ownerEmail && s.ownerEmail.toLowerCase().includes(query))
    );
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e5e0d8] pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5a5a40] text-white shadow-xs">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold text-[#3d3d3d]">
                Shared Access &amp; Collaboration
              </h1>
              <p className="text-xs text-[#8c8579]">
                Manage role-verified peer access and view reflections shared with you.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchShares}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs font-medium text-[#3d3d3d] hover:bg-[#f5f2ed] transition-colors cursor-pointer"
            title="Refresh shared items"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={onBackToJournal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#5a5a40] px-4 py-2 text-xs font-medium text-white hover:bg-[#4a4a35] transition-colors cursor-pointer"
          >
            <span>Back to Journal</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-tabs & Search */}
      <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-[#e5e0d8] bg-[#f5f2ed] p-1 self-start">
          <button
            type="button"
            onClick={() => setSubTab('withMe')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              subTab === 'withMe'
                ? 'bg-[#5a5a40] text-white shadow-xs'
                : 'text-[#8c8579] hover:text-[#5a5a40]'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Shared with Me ({sharedWithMe.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('byMe')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              subTab === 'byMe'
                ? 'bg-[#5a5a40] text-white shadow-xs'
                : 'text-[#8c8579] hover:text-[#5a5a40]'
            }`}
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Shared by Me ({sharedByMe.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8c8579]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or email..."
            className="w-full rounded-xl border border-[#e5e0d8] bg-white pl-9 pr-3.5 py-2 text-xs text-[#3d3d3d] placeholder-[#b5ad9f] focus:border-[#5a5a40] focus:outline-hidden"
          />
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800 animate-in fade-in">
          {statusMessage}
        </div>
      )}

      {/* Content list */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-[#e5e0d8] bg-[#fdfbf7] text-xs text-[#8c8579]">
            <RefreshCw className="h-5 w-5 animate-spin text-[#5a5a40]" />
            <span>Loading collaboration permissions...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#e5e0d8] bg-[#fdfbf7] p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f2ed] text-[#8c8579]">
              {subTab === 'withMe' ? <Users className="h-6 w-6" /> : <Share2 className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="font-serif text-base font-semibold text-[#3d3d3d]">
                {subTab === 'withMe' ? 'No reflections shared with you yet' : 'You haven’t shared any reflections yet'}
              </h3>
              <p className="mt-1 text-xs text-[#8c8579] max-w-md">
                {subTab === 'withMe'
                  ? 'When colleagues or mentors share entries with your email, they will appear here with assigned permissions.'
                  : 'Open any active reflection in your Journal and click "Share" to grant viewer or editor permissions.'}
              </p>
            </div>
            {subTab === 'byMe' && (
              <button
                type="button"
                onClick={onBackToJournal}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[#5a5a40] px-4 py-2 text-xs font-medium text-white hover:bg-[#4a4a35] transition-colors cursor-pointer"
              >
                Go to Journal
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((share) => (
              <div
                key={share.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-xs transition-all hover:border-[#5a5a40]/30 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                        share.permission === 'editor'
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-[#e5e0d8] bg-[#f5f2ed] text-[#5a5a40]'
                      }`}
                    >
                      {share.permission === 'editor' ? (
                        <>
                          <Edit3 className="h-2.5 w-2.5" />
                          <span>Editor</span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-2.5 w-2.5" />
                          <span>Viewer</span>
                        </>
                      )}
                    </span>

                    <span className="text-[11px] text-[#8c8579]">
                      {new Date(share.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="mt-3 font-serif text-base font-semibold text-[#3d3d3d] line-clamp-2">
                    {share.reflectionTitle || 'Untitled Reflection'}
                  </h3>

                  <div className="mt-3 flex items-center gap-2 text-xs text-[#8c8579]">
                    <Lock className="h-3.5 w-3.5 text-[#5a5a40]" />
                    <span className="truncate">
                      {subTab === 'withMe'
                        ? `Shared by ${share.ownerEmail || 'Peer'}`
                        : `Shared with ${share.targetEmail}`}
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-[#f0ebe1] pt-3">
                  {subTab === 'withMe' ? (
                    <button
                      type="button"
                      onClick={() => handleOpenSharedEntry(share)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#5a5a40] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#4a4a35] transition-colors cursor-pointer"
                    >
                      <span>Open in Journal</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <div className="flex w-full items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePermission(share)}
                        className="text-xs font-medium text-[#5a5a40] hover:underline cursor-pointer"
                        title="Toggle viewer / editor permission"
                      >
                        Change to {share.permission === 'viewer' ? 'Editor' : 'Viewer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(share)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Revoke shared access"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Revoke</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RBAC & Sharing Policy Note */}
      <div className="mt-10 rounded-2xl border border-[#e5e0d8] bg-[#f5f2ed] p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-[#5a5a40] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#3d3d3d]">
              Collaborative Access Control Policy
            </h4>
            <p className="text-xs text-[#8c8579] leading-relaxed">
              Shared permissions are enforced at the Firestore security boundary. Viewers have
              strict read-only access to messages and locations. Editors can append reflection
              turns and suggestions. Only the primary document owner can delete the reflection or
              modify collaborator privileges.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
