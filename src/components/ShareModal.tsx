import React, { useState, useEffect } from 'react';
import { X, UserPlus, Shield, Trash2, Check, AlertCircle, Users, Lock, Eye, Edit3 } from 'lucide-react';
import type { JournalInteraction, ReflectionShare, SharePermission, UserProfile } from '../types';
import { createShare, listUserShares, revokeShare, updateSharePermission } from '../utils/shares';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  interaction: JournalInteraction | null;
  currentUser: UserProfile;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  interaction,
  currentUser,
}) => {
  const [targetEmail, setTargetEmail] = useState('');
  const [permission, setPermission] = useState<SharePermission>('viewer');
  const [shares, setShares] = useState<ReflectionShare[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load existing shares for this interaction
  useEffect(() => {
    if (!isOpen || !interaction) return;

    async function load() {
      setIsLoading(true);
      try {
        const { sharedByMe } = await listUserShares(currentUser);
        setShares(sharedByMe.filter((s) => s.reflectionId === interaction?.id));
      } catch (err) {
        console.error('Error loading shares:', err);
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [isOpen, interaction, currentUser]);

  if (!isOpen || !interaction) return null;

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const email = targetEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setFeedback({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    if (email === (currentUser.email || '').toLowerCase()) {
      setFeedback({ type: 'error', message: 'You cannot share an entry with yourself.' });
      return;
    }

    // Check if already shared with this email
    if (shares.some((s) => s.targetEmail.toLowerCase() === email)) {
      setFeedback({ type: 'error', message: 'This entry is already shared with this user.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const newShare = await createShare(
        currentUser,
        interaction.id,
        interaction.title || 'Untitled Reflection',
        email,
        permission
      );
      setShares((prev) => [newShare, ...prev]);
      setTargetEmail('');
      setFeedback({
        type: 'success',
        message: `Successfully granted ${permission} access to ${email}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to grant shared access.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePermission = async (shareId: string, newPerm: SharePermission) => {
    try {
      await updateSharePermission(shareId, newPerm);
      setShares((prev) =>
        prev.map((s) => (s.id === shareId ? { ...s, permission: newPerm } : s))
      );
      setFeedback({
        type: 'success',
        message: `Updated permissions to ${newPerm}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to update permissions.',
      });
    }
  };

  const handleRevokeShare = async (shareId: string, email: string) => {
    try {
      await revokeShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      setFeedback({
        type: 'success',
        message: `Revoked access for ${email}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to revoke access.',
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[#e5e0d8] bg-[#fdfbf7] p-6 shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e5e0d8] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5a5a40]/10 text-[#5a5a40]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 id="share-modal-title" className="font-serif text-lg font-semibold text-[#3d3d3d]">
                Share Reflection
              </h2>
              <p className="text-xs text-[#8c8579] truncate max-w-[280px]">
                {interaction.title || 'Untitled Reflection'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1 text-[#8c8579] hover:bg-[#f5f2ed] hover:text-[#3d3d3d] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-xs font-medium border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Form: Add collaborator */}
        <form onSubmit={handleCreateShare} className="mt-4 space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-[#8c8579]">
            Invite Collaborator
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="flex-1 rounded-xl border border-[#e5e0d8] bg-white px-3.5 py-2 text-sm text-[#3d3d3d] placeholder-[#b5ad9f] focus:border-[#5a5a40] focus:outline-hidden focus:ring-1 focus:ring-[#5a5a40]"
              disabled={isSubmitting}
              required
            />
            <div className="flex items-center gap-2">
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as SharePermission)}
                className="rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs font-medium text-[#3d3d3d] focus:border-[#5a5a40] focus:outline-hidden"
              >
                <option value="viewer">Viewer (Read only)</option>
                <option value="editor">Editor (Can add turns)</option>
              </select>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#5a5a40] px-4 py-2 text-xs font-medium text-white hover:bg-[#4a4a35] transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Invite</span>
              </button>
            </div>
          </div>
          <p className="text-[11px] text-[#8c8579]">
            <Lock className="inline h-3 w-3 mr-1 text-[#5a5a40]" />
            Permissions are enforced at the database level via owner-bound security rules.
          </p>
        </form>

        {/* Active Collaborators List */}
        <div className="mt-6 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[#e5e0d8] pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8c8579]">
              Active Collaborators ({shares.length})
            </span>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-xs text-[#8c8579]">
              Loading permissions...
            </div>
          ) : shares.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-[#8c8579]">
                Only you currently have access to this reflection.
              </p>
            </div>
          ) : (
            <div className="mt-3 divide-y divide-[#f0ebe1] space-y-2">
              {shares.map((share) => (
                <div key={share.id} className="flex items-center justify-between pt-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#3d3d3d] truncate">
                      {share.targetEmail}
                    </p>
                    <p className="text-[11px] text-[#8c8579]">
                      Granted {new Date(share.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdatePermission(
                          share.id,
                          share.permission === 'viewer' ? 'editor' : 'viewer'
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium border cursor-pointer transition-colors ${
                        share.permission === 'editor'
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                          : 'border-[#e5e0d8] bg-[#f5f2ed] text-[#5a5a40] hover:bg-[#e5e0d8]'
                      }`}
                      title="Click to toggle permission"
                    >
                      {share.permission === 'editor' ? (
                        <>
                          <Edit3 className="h-3 w-3" />
                          <span>Editor</span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" />
                          <span>Viewer</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevokeShare(share.id, share.targetEmail)}
                      className="rounded-lg p-1 text-[#8c8579] hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                      title="Revoke access"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 border-t border-[#e5e0d8] pt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#e5e0d8] bg-white px-4 py-2 text-xs font-medium text-[#3d3d3d] hover:bg-[#f5f2ed] transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
