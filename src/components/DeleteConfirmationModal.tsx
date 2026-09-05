import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  title: string;
  itemTitle?: string;
  itemSubtitle?: string;
  warningText?: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  title,
  itemTitle,
  itemSubtitle,
  warningText = 'This action cannot be undone and will permanently remove this data from your personal Firestore storage.',
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      id="delete-confirmation-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onCancel();
        }
      }}
    >
      <div
        id="delete-confirmation-dialog-card"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#e5e0d8] bg-[#fdfbf7] p-6 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 border border-red-200">
            <Trash2 className="h-5 w-5" />
          </div>

          <div className="space-y-1.5 flex-1">
            <h3
              id="delete-modal-title"
              className="font-serif text-lg font-semibold text-[#3d3d3d]"
            >
              {title}
            </h3>

            {itemTitle && (
              <p className="text-sm font-semibold text-[#5a5a40] line-clamp-2">
                "{itemTitle}"
              </p>
            )}

            {itemSubtitle && (
              <p className="text-xs text-[#8c8579]">
                {itemSubtitle}
              </p>
            )}

            <div className="pt-2">
              <div className="flex items-start gap-2 rounded-xl bg-red-50/70 border border-red-100 p-2.5 text-xs text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                <span>{warningText}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#e5e0d8] pt-4">
          <button
            type="button"
            id="cancel-delete-btn"
            disabled={isDeleting}
            onClick={onCancel}
            className="rounded-xl border border-[#e5e0d8] bg-white px-4 py-2 text-xs font-semibold text-[#3d3d3d] hover:bg-[#f5f2ed] transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            id="confirm-delete-action-btn"
            disabled={isDeleting}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Permanently</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
