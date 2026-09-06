import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Trash2,
  Clock,
  Search,
  BookOpen,
  RefreshCw,
  AlertTriangle,
  Lightbulb,
  FileText,
  MessageSquare,
  CheckCircle2,
  Download,
  MapPin,
} from 'lucide-react';
import type {
  JournalInteraction,
  JournalMessage,
  AIMode,
  UserProfile,
  JournalLocation,
  ReflectionCategory,
} from '../types';
import { REFLECTION_CATEGORIES } from '../types';
import { emitReflectionEvent, emitReflectionEventAndWait } from '../utils/webhooks';
import {
  getInteractionsCollectionRef,
  saveInteractionToFirestore,
  deleteInteractionFromFirestore,
  authedFetch,
  onSnapshot,
  query,
  orderBy,
} from '../firebase/config';
import { ReflectionEntry } from './ReflectionEntry';
import { PromptSuggestions } from './PromptSuggestions';
import { LocationPickerModal } from './LocationPickerModal';
import { LocationMapCard } from './LocationMapCard';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { sanitizeInputText, formatJournalDate } from '../utils/sanitize';

interface JournalDashboardProps {
  user: UserProfile;
  activeInteraction: JournalInteraction | null;
  onSelectInteraction: (interaction: JournalInteraction) => void;
  onNewReflection: () => void;
}

export const JournalDashboard: React.FC<JournalDashboardProps> = ({
  user,
  activeInteraction,
  onSelectInteraction,
  onNewReflection,
}) => {
  const [interactions, setInteractions] = useState<JournalInteraction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [selectedMode, setSelectedMode] = useState<AIMode>('reflection');
  const [selectedCategory, setSelectedCategory] = useState<ReflectionCategory | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [failedTurn, setFailedTurn] = useState<{
    userInput: string;
    aiResponse?: string;
    modelUsed?: string;
  } | null>(null);

  // Deletion modal state & notifications
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'entry' | 'message';
    entryId?: string;
    entryTitle?: string;
    entrySubtitle?: string;
    messageId?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [failedDeleteTarget, setFailedDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [successNotification, setSuccessNotification] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Subscribe to user's isolated Firestore collection: /users/{userId}/interactions
  useEffect(() => {
    if (!user.uid) return;
    setLoadingHistory(true);

    const collectionRef = getInteractionsCollectionRef(user.uid);
    const unsubscribe = onSnapshot(
      collectionRef,
      (snapshot) => {
        const list: JournalInteraction[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as JournalInteraction;
          list.push({ ...data, id: doc.id || data.id });
        });
        list.sort((a, b) =>
          (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
        );
        setInteractions(list);
        setLoadingHistory(false);
      },
      (error) => {
        console.error('Firestore subscription error:', error);
        setErrorMessage('Failed to load past entries from Firestore: ' + error.message);
        setLoadingHistory(false);
      }
    );

    return () => unsubscribe();
  }, [user.uid]);

  // Scroll to bottom of message list on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeInteraction?.messages, isGenerating]);

  // Keep the composer's category in sync with whichever entry is open
  useEffect(() => {
    setSelectedCategory(activeInteraction?.category ?? null);
  }, [activeInteraction?.id, activeInteraction?.category]);

  // Filter past entries based on search query
  const filteredInteractions = interactions.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const matchTitle = item.title?.toLowerCase().includes(q);
    const matchLocation =
      item.location?.name?.toLowerCase().includes(q) ||
      item.location?.address?.toLowerCase().includes(q);
    const matchMessages = item.messages?.some((m) =>
      m.content?.toLowerCase().includes(q)
    );
    return matchTitle || matchLocation || matchMessages;
  });

  // Handle pinning or updating location on active session
  const handleSaveLocation = async (newLocation: JournalLocation) => {
    setErrorMessage(null);
    const timestamp = new Date().toISOString();

    if (!activeInteraction) {
      const interactionId = 'int-' + Date.now();
      const newSession: JournalInteraction = {
        id: interactionId,
        userId: user.uid,
        title: `Reflection at ${newLocation.name}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        mode: selectedMode,
        messages: [],
        location: newLocation,
        ...(selectedCategory ? { category: selectedCategory } : {}),
      };
      onSelectInteraction(newSession);
      try {
        await saveInteractionToFirestore(user.uid, newSession);
        setSaveStatus('saved');
        emitReflectionEvent('reflection.located', interactionId, newSession);
      } catch (err: any) {
        console.error('Failed to save location to Firestore:', err);
        setSaveStatus('error');
        setErrorMessage('Failed to save pinned location: ' + err.message);
      }
    } else {
      const updated: JournalInteraction = {
        ...activeInteraction,
        location: newLocation,
        updatedAt: timestamp,
      };
      onSelectInteraction(updated);
      try {
        await saveInteractionToFirestore(user.uid, updated);
        setSaveStatus('saved');
        emitReflectionEvent('reflection.located', updated.id, updated);
      } catch (err: any) {
        console.error('Failed to update pinned location:', err);
        setSaveStatus('error');
        setErrorMessage('Failed to save pinned location: ' + err.message);
      }
    }
  };

  // Handle removing pinned location from active session
  const handleRemoveLocation = async () => {
    if (!activeInteraction) return;
    setErrorMessage(null);
    const timestamp = new Date().toISOString();

    const { location: _loc, ...rest } = activeInteraction;
    const updated: JournalInteraction = {
      ...rest,
      updatedAt: timestamp,
    };
    onSelectInteraction(updated);
    try {
      await saveInteractionToFirestore(user.uid, updated);
      setSaveStatus('saved');
      emitReflectionEvent('reflection.updated', updated.id, updated);
    } catch (err: any) {
      console.error('Failed to remove pinned location:', err);
      setSaveStatus('error');
      setErrorMessage('Failed to remove location: ' + err.message);
    }
  };

  // Handle submitting a reflection turn
  const handleSubmitEntry = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const sanitized = sanitizeInputText(inputText);
    if (!sanitized || isGenerating) return;

    setErrorMessage(null);
    setIsGenerating(true);
    setSaveStatus('saving');

    const timestamp = new Date().toISOString();
    const userMsgId = 'msg-' + Date.now();
    const newUserMessage: JournalMessage = {
      id: userMsgId,
      role: 'user',
      content: sanitized,
      timestamp,
      mode: selectedMode,
    };

    // Prepare current conversation context
    const currentMessages = activeInteraction?.messages || [];
    const updatedMessages = [...currentMessages, newUserMessage];

    // Determine entry title (derived from first prompt if new session)
    const sessionTitle =
      activeInteraction?.title && activeInteraction.title !== 'Untitled Reflection'
        ? activeInteraction.title
        : sanitized.length > 40
        ? sanitized.slice(0, 40) + '...'
        : sanitized;

    const interactionId = activeInteraction?.id || 'int-' + Date.now();
    const isNewSession = !interactions.some((item) => item.id === interactionId);

    try {
      // 1. Call full-stack server endpoint with resilient model fallback.
      // The server derives the user from the verified ID token - never trust a
      // client-supplied uid.
      const response = await authedFetch('/api/reflect', {
        method: 'POST',
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          mode: selectedMode,
          currentEntry: sanitized,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate reflection response.');
      }

      const aiMsgId = 'msg-ai-' + Date.now();
      const aiMessage: JournalMessage = {
        id: aiMsgId,
        role: 'model',
        content: data.reflection || 'Reflection processed.',
        timestamp: new Date().toISOString(),
        modelUsed: data.modelUsed,
        mode: selectedMode,
      };

      const finalMessages = [...updatedMessages, aiMessage];

      const interactionToSave: JournalInteraction = {
        id: interactionId,
        userId: user.uid,
        title: sessionTitle,
        createdAt: activeInteraction?.createdAt || timestamp,
        updatedAt: new Date().toISOString(),
        mode: selectedMode,
        messages: finalMessages,
        location: activeInteraction?.location,
        ...(selectedCategory ? { category: selectedCategory } : {}),
      };

      // 2. Guaranteed Transaction Verification: Persist both user input and AI response to Firestore
      try {
        await saveInteractionToFirestore(user.uid, interactionToSave);
        setSaveStatus('saved');
        onSelectInteraction(interactionToSave);
        // Only clear input buffer after confirmed successful write
        setInputText('');
        setFailedTurn(null);
        emitReflectionEvent(
          isNewSession ? 'reflection.created' : 'reflection.updated',
          interactionId,
          interactionToSave
        );
      } catch (dbError: any) {
        console.error('Firestore save failed:', dbError);
        setSaveStatus('error');
        setFailedTurn({
          userInput: sanitized,
          aiResponse: data.reflection,
          modelUsed: data.modelUsed,
        });
        setErrorMessage(
          'Reflection generated, but saving to Firestore failed. Your text has been preserved. Please click "Retry Save".'
        );
      }
    } catch (apiError: any) {
      console.error('AI reflection request failed:', apiError);
      setSaveStatus('error');
      setErrorMessage(apiError.message || 'Unable to connect to Gemini reflection service.');
      // Do not clear user's input buffer
    } finally {
      setIsGenerating(false);
    }
  };

  // Retry saving when Firestore write fails
  const handleRetrySave = async () => {
    if (!failedTurn || !activeInteraction) return;
    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      const userMsgId = 'msg-' + Date.now();
      const aiMsgId = 'msg-ai-' + Date.now();
      const timestamp = new Date().toISOString();

      const newMessages: JournalMessage[] = [
        ...(activeInteraction.messages || []),
        {
          id: userMsgId,
          role: 'user',
          content: failedTurn.userInput,
          timestamp,
          mode: selectedMode,
        },
      ];

      if (failedTurn.aiResponse) {
        newMessages.push({
          id: aiMsgId,
          role: 'model',
          content: failedTurn.aiResponse,
          timestamp,
          modelUsed: failedTurn.modelUsed,
          mode: selectedMode,
        });
      }

      const interactionToSave: JournalInteraction = {
        ...activeInteraction,
        updatedAt: timestamp,
        messages: newMessages,
      };

      await saveInteractionToFirestore(user.uid, interactionToSave);
      setSaveStatus('saved');
      onSelectInteraction(interactionToSave);
      setInputText('');
      setFailedTurn(null);
    } catch (err: any) {
      console.error('Retry save failed:', err);
      setSaveStatus('error');
      setErrorMessage('Retry save failed: ' + err.message);
    }
  };

  // Prompt user for confirmation before deleting a journal entry
  const promptDeleteEntry = (
    id: string,
    title?: string,
    subtitle?: string,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setDeleteTarget({
      type: 'entry',
      entryId: id,
      entryTitle: title || 'Untitled Reflection',
      entrySubtitle: subtitle,
    });
  };

  // Prompt user for confirmation before deleting an individual message turn
  const promptDeleteMessage = (messageId: string, content: string) => {
    const preview = content.length > 90 ? content.slice(0, 90) + '...' : content;
    setDeleteTarget({
      type: 'message',
      messageId,
      entryTitle: preview,
      entrySubtitle: 'Single reflection message turn in this session',
    });
  };

  // Execute confirmed deletion from Firestore
  const handleConfirmDelete = async () => {
    if (!deleteTarget || !user.uid) return;
    setIsDeleting(true);
    setErrorMessage(null);
    setFailedDeleteTarget(null);

    try {
      if (deleteTarget.type === 'entry' && deleteTarget.entryId) {
        const idToDelete = deleteTarget.entryId;
        const titleDeleted = deleteTarget.entryTitle || 'Reflection entry';
        const entryBeingDeleted = interactions.find((item) => item.id === idToDelete);

        // Optimistic UI update
        setInteractions((prev) => prev.filter((item) => item.id !== idToDelete));

        // Notify integrations while the document still exists, then delete.
        await emitReflectionEventAndWait('reflection.deleted', idToDelete, 5000, entryBeingDeleted);

        // Persistent Firestore deletion
        await deleteInteractionFromFirestore(user.uid, idToDelete);

        if (activeInteraction?.id === idToDelete) {
          onNewReflection();
        }

        setSuccessNotification(`"${titleDeleted}" was successfully deleted.`);
        setTimeout(() => setSuccessNotification(null), 3500);
      } else if (deleteTarget.type === 'message' && deleteTarget.messageId && activeInteraction) {
        const msgIdToDelete = deleteTarget.messageId;
        const updatedMessages = (activeInteraction.messages || []).filter(
          (m) => m.id !== msgIdToDelete
        );
        const updatedInteraction: JournalInteraction = {
          ...activeInteraction,
          messages: updatedMessages,
          updatedAt: new Date().toISOString(),
        };

        setSaveStatus('saving');
        await saveInteractionToFirestore(user.uid, updatedInteraction);
        onSelectInteraction(updatedInteraction);
        setSaveStatus('saved');

        setSuccessNotification('Reflection turn was successfully removed.');
        setTimeout(() => setSuccessNotification(null), 3000);
      }

      setDeleteTarget(null);
    } catch (err: any) {
      console.error('Failed to delete from Firestore:', err);
      const msg = err?.message || 'Permission denied or network error';
      setErrorMessage(`Failed to delete: ${msg}`);
      if (deleteTarget.type === 'entry' && deleteTarget.entryId) {
        setFailedDeleteTarget({
          id: deleteTarget.entryId,
          title: deleteTarget.entryTitle || 'Reflection entry',
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Retry failed deletion
  const handleRetryDelete = async () => {
    if (!failedDeleteTarget || !user.uid) return;
    setErrorMessage(null);
    try {
      await deleteInteractionFromFirestore(user.uid, failedDeleteTarget.id);
      setInteractions((prev) => prev.filter((item) => item.id !== failedDeleteTarget.id));
      if (activeInteraction?.id === failedDeleteTarget.id) {
        onNewReflection();
      }
      setSuccessNotification(`"${failedDeleteTarget.title}" was successfully deleted.`);
      setFailedDeleteTarget(null);
      setTimeout(() => setSuccessNotification(null), 3500);
    } catch (err: any) {
      setErrorMessage(`Retry delete failed: ${err?.message || 'Unknown error'}`);
    }
  };

  // Export current session as clean Markdown
  const handleExportMarkdown = () => {
    if (!activeInteraction || !activeInteraction.messages?.length) return;
    let md = `# ${activeInteraction.title}\n`;
    md += `Date: ${formatJournalDate(activeInteraction.createdAt)}\n`;
    if (activeInteraction.location) {
      md += `Location: ${activeInteraction.location.name} (${activeInteraction.location.lat.toFixed(4)}°, ${activeInteraction.location.lng.toFixed(4)}°)\n`;
      if (activeInteraction.location.address) {
        md += `Address: ${activeInteraction.location.address}\n`;
      }
    }
    md += `\n---\n\n`;

    activeInteraction.messages.forEach((m) => {
      const author = m.role === 'user' ? 'You' : `Gemini (${m.modelUsed || 'Reflection'})`;
      md += `### ${author} [${formatJournalDate(m.timestamp)}]\n\n${m.content}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeInteraction.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl flex-col lg:flex-row overflow-hidden bg-[#fdfbf7]">
      {/* SIDEBAR: History of past entries */}
      <aside
        id="history-sidebar"
        className="w-full lg:w-80 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-[#e5e0d8] bg-[#f5f2ed] flex flex-col h-72 lg:h-full overflow-hidden"
      >
        {/* Sidebar Header & Search */}
        <div className="p-4 border-b border-[#e5e0d8] space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[#5a5a40]" />
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-[#5a5a40]">
                Your Past Entries
              </h2>
            </div>
            <span className="rounded-full bg-[#e5e0d8] px-2 py-0.5 text-[10px] font-bold text-[#5a5a40]">
              {interactions.length}
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#8c8579]" />
            <input
              id="search-entries-input"
              type="text"
              placeholder="Search past reflections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#e5e0d8] bg-white py-1.5 pl-8 pr-3 text-xs text-[#3d3d3d] placeholder:text-[#8c8579] focus:border-[#5a5a40] focus:outline-none focus:ring-1 focus:ring-[#5a5a40]"
            />
          </div>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-[#8c8579]">
              <RefreshCw className="h-4 w-4 animate-spin text-[#5a5a40] mb-2" />
              <span>Loading private entries...</span>
            </div>
          ) : filteredInteractions.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#8c8579]">
              {searchQuery ? (
                'No entries match your search.'
              ) : (
                <>
                  <p className="font-semibold text-[#5a5a40]">No past entries yet.</p>
                  <p className="mt-1 text-xs text-[#8c8579]">
                    Write your first reflection to start your journal history.
                  </p>
                </>
              )}
            </div>
          ) : (
            filteredInteractions.map((item) => {
              const isSelected = activeInteraction?.id === item.id;
              return (
                <div
                  key={item.id}
                  id={`entry-item-${item.id}`}
                  onClick={() => onSelectInteraction(item)}
                  className={`group relative flex flex-col gap-1 rounded-xl p-3 text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white border border-[#5a5a40]/30 shadow-xs ring-1 ring-[#5a5a40]/10'
                      : 'hover:bg-[#e5e0d8]/40 border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={`text-xs font-semibold line-clamp-1 ${
                        isSelected ? 'text-[#5a5a40]' : 'text-[#3d3d3d] group-hover:text-[#5a5a40]'
                      }`}
                    >
                      {item.title || 'Untitled Reflection'}
                    </h3>

                    <button
                      type="button"
                      id={`delete-entry-btn-${item.id}`}
                      onClick={(e) =>
                        promptDeleteEntry(
                          item.id,
                          item.title,
                          `${formatJournalDate(item.updatedAt || item.createdAt)} • ${item.messages?.length || 0} turns`,
                          e
                        )
                      }
                      className="opacity-75 sm:opacity-0 group-hover:opacity-100 hover:opacity-100 hover:text-red-600 hover:bg-red-50 p-1 text-[#8c8579] transition-all rounded-md cursor-pointer shrink-0"
                      title="Delete reflection entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-[#8c8579] flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {formatJournalDate(item.updatedAt || item.createdAt)}
                    </span>
                    <span>•</span>
                    <span className="capitalize">{item.messages?.length || 0} turns</span>
                    {item.location && (
                      <>
                        <span>•</span>
                        <span className="inline-flex items-center gap-0.5 font-medium text-[#5a5a40] max-w-[90px] truncate">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{item.location.name}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* MAIN WORKSPACE: Active multi-turn conversation & reflection composer */}
      <main className="flex-1 flex flex-col h-full bg-[#fdfbf7] overflow-hidden">
        {/* Workspace Top Toolbar */}
        <div className="flex items-center justify-between border-b border-[#e5e0d8] px-4 py-3 shrink-0 bg-[#fdfbf7]/90 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-lg font-semibold text-[#3d3d3d] truncate max-w-xs sm:max-w-md">
              {activeInteraction?.title || 'New Reflection Session'}
            </h1>
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-[11px] text-[#8c8579]">
                <RefreshCw className="h-3 w-3 animate-spin text-[#5a5a40]" />
                <span>Saving to Firestore...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-[11px] text-[#5a5a40]">
                <CheckCircle2 className="h-3 w-3" />
                <span>Saved &amp; Isolated</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Pinned Location Button / Pill */}
            {activeInteraction?.location ? (
              <button
                type="button"
                id="pinned-location-badge-btn"
                onClick={() => setShowLocationModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#5a5a40]/30 bg-[#5a5a40]/10 px-2.5 py-1.5 text-xs font-semibold text-[#5a5a40] transition-colors hover:bg-[#5a5a40]/20 cursor-pointer shadow-2xs"
                title={`Pinned Location: ${activeInteraction.location.name}`}
              >
                <MapPin className="h-3.5 w-3.5" />
                <span className="max-w-[110px] truncate">{activeInteraction.location.name}</span>
              </button>
            ) : (
              <button
                type="button"
                id="pin-location-btn"
                onClick={() => setShowLocationModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#e5e0d8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#3d3d3d] transition-colors hover:bg-[#f5f2ed] hover:border-[#5a5a40]/40 cursor-pointer shadow-2xs"
                title="Pin a location to this reflection"
              >
                <MapPin className="h-3.5 w-3.5 text-[#5a5a40]" />
                <span className="hidden sm:inline">Pin Location</span>
              </button>
            )}

            {activeInteraction && activeInteraction.messages?.length > 0 && (
              <button
                type="button"
                id="export-markdown-btn"
                onClick={handleExportMarkdown}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#e5e0d8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#3d3d3d] transition-colors hover:bg-[#f5f2ed] cursor-pointer shadow-2xs"
                title="Export this reflection as Markdown"
              >
                <Download className="h-3.5 w-3.5 text-[#5a5a40]" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}

            {/* If viewing a saved entry or one with content, allow deleting from header */}
            {activeInteraction &&
              (activeInteraction.messages?.length > 0 ||
                interactions.some((i) => i.id === activeInteraction.id)) && (
                <button
                  type="button"
                  id="delete-active-entry-btn"
                  onClick={() =>
                    promptDeleteEntry(
                      activeInteraction.id,
                      activeInteraction.title,
                      activeInteraction.messages?.length
                        ? `${activeInteraction.messages.length} reflection turns`
                        : undefined
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:border-red-300 cursor-pointer shadow-2xs"
                  title="Delete this reflection entry"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Delete Entry</span>
                </button>
              )}

            <button
              type="button"
              id="new-session-main-btn"
              onClick={onNewReflection}
              className="inline-flex items-center gap-1 rounded-xl border border-[#e5e0d8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#3d3d3d] transition-colors hover:bg-[#f5f2ed] cursor-pointer shadow-2xs"
            >
              <span>Reset Canvas</span>
            </button>
          </div>
        </div>

        {/* Success Notification Banner */}
        {successNotification && (
          <div
            id="workspace-success-banner"
            className="flex items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-900 shrink-0 animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{successNotification}</span>
            </div>
            <button
              type="button"
              id="dismiss-success-banner-btn"
              onClick={() => setSuccessNotification(null)}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Alert / Retry Save or Delete Banner */}
        {errorMessage && (
          <div
            id="workspace-error-banner"
            className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-900 shrink-0"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              {failedTurn && (
                <button
                  id="retry-save-banner-btn"
                  onClick={handleRetrySave}
                  className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 cursor-pointer shrink-0"
                >
                  Retry Save
                </button>
              )}
              {failedDeleteTarget && (
                <button
                  id="retry-delete-banner-btn"
                  onClick={handleRetryDelete}
                  className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 cursor-pointer shrink-0"
                >
                  Retry Delete
                </button>
              )}
            </div>
          </div>
        )}

        {/* Message Stream */}
        <div
          id="messages-scroll-area"
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#fdfbf7]"
        >
          {(!activeInteraction || !activeInteraction.messages?.length) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto space-y-4">
              {activeInteraction?.location && (
                <div className="w-full text-left mb-2">
                  <LocationMapCard
                    location={activeInteraction.location}
                    onEdit={() => setShowLocationModal(true)}
                    onRemove={handleRemoveLocation}
                  />
                </div>
              )}

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f2ed] border border-[#e5e0d8] text-[#5a5a40]">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-2xl font-semibold text-[#5a5a40]">
                  Welcome to your journal workspace
                </h3>
                <p className="text-sm text-[#3d3d3d] leading-relaxed">
                  Start writing your thoughts below, choose a prompt starter, or pick whether
                  you'd like Gemini to reflect, brainstorm ideas, or summarize.
                </p>
              </div>

              <div className="w-full pt-4 text-left">
                <PromptSuggestions
                  disabled={isGenerating}
                  onSelectPrompt={(text) => {
                    setInputText(text);
                    textareaRef.current?.focus();
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5 max-w-3xl mx-auto">
              {activeInteraction?.location && (
                <LocationMapCard
                  location={activeInteraction.location}
                  onEdit={() => setShowLocationModal(true)}
                  onRemove={handleRemoveLocation}
                />
              )}

              {activeInteraction.messages.map((message) => (
                <ReflectionEntry
                  key={message.id}
                  message={message}
                  onDelete={() => promptDeleteMessage(message.id, message.content)}
                />
              ))}

              {isGenerating && (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5a5a40] text-white animate-pulse">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl rounded-tl-xs border border-[#e5e0d8] bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#5a5a40]">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Gemini is contemplating your reflection...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Reflection Composer & Mode Controls */}
        <div className="border-t border-[#e5e0d8] bg-white p-3 sm:p-4 shrink-0 shadow-xs">
          <div className="max-w-3xl mx-auto space-y-3">
            {/* Mode Selectors */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-[#e5e0d8] bg-[#f5f2ed] p-1">
                <button
                  type="button"
                  id="mode-reflection-btn"
                  onClick={() => setSelectedMode('reflection')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    selectedMode === 'reflection'
                      ? 'bg-[#5a5a40] text-white shadow-xs'
                      : 'text-[#8c8579] hover:text-[#5a5a40]'
                  }`}
                >
                  <MessageSquare className="h-3 w-3" />
                  <span>Reflect &amp; Inquire</span>
                </button>

                <button
                  type="button"
                  id="mode-brainstorm-btn"
                  onClick={() => setSelectedMode('brainstorm')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    selectedMode === 'brainstorm'
                      ? 'bg-[#5a5a40] text-white shadow-xs'
                      : 'text-[#8c8579] hover:text-[#5a5a40]'
                  }`}
                >
                  <Lightbulb className="h-3 w-3" />
                  <span>Brainstorm Ideas</span>
                </button>

                <button
                  type="button"
                  id="mode-summary-btn"
                  onClick={() => setSelectedMode('summary')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    selectedMode === 'summary'
                      ? 'bg-[#5a5a40] text-white shadow-xs'
                      : 'text-[#8c8579] hover:text-[#5a5a40]'
                  }`}
                >
                  <FileText className="h-3 w-3" />
                  <span>Summarize</span>
                </button>
              </div>

              <div className="flex items-center gap-2.5 text-[11px] text-[#8c8579]">
                <button
                  type="button"
                  id="composer-pin-location-btn"
                  onClick={() => setShowLocationModal(true)}
                  className="inline-flex items-center gap-1 text-[#5a5a40] hover:text-[#3d3d3d] hover:underline cursor-pointer"
                  title="Pin or change location"
                >
                  <MapPin className="h-3 w-3" />
                  <span className="max-w-[120px] truncate">
                    {activeInteraction?.location ? activeInteraction.location.name : 'Pin location'}
                  </span>
                </button>
                <span>•</span>
                <span>{wordCount} words</span>
                <span>•</span>
                <span>{inputText.length}/20,000 chars</span>
              </div>
            </div>

            {/* Category */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[11px] font-semibold text-[#8c8579]">Category</span>
              {REFLECTION_CATEGORIES.map((c) => {
                const active = selectedCategory === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    id={`category-${c.id}-btn`}
                    onClick={() => setSelectedCategory(active ? null : c.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-[#5a5a40] bg-[#5a5a40] text-white'
                        : 'border-[#e5e0d8] bg-white text-[#8c8579] hover:border-[#5a5a40]/50 hover:text-[#3d3d3d]'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmitEntry} className="relative">
              <textarea
                ref={textareaRef}
                id="journal-input-textarea"
                rows={3}
                placeholder={
                  selectedMode === 'brainstorm'
                    ? 'What problem or creative idea would you like to brainstorm today?'
                    : selectedMode === 'summary'
                    ? 'Paste or write a longer journal entry to receive a thoughtful synthesis...'
                    : 'Pour your thoughts, feelings, or day reflections here...'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmitEntry();
                  }
                }}
                disabled={isGenerating}
                className="w-full resize-none rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] p-3.5 pr-24 text-sm text-[#3d3d3d] placeholder:text-[#8c8579] focus:border-[#5a5a40] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#5a5a40] disabled:opacity-60"
              />

              <div className="absolute right-3 bottom-3.5 flex items-center gap-2">
                <button
                  type="submit"
                  id="submit-journal-entry-btn"
                  disabled={!inputText.trim() || isGenerating}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#5a5a40] px-3.5 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-[#4a4a35] active:scale-95 disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
                >
                  {isGenerating ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>Send</span>
                      <Send className="h-3 w-3" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="flex items-center justify-between text-[11px] text-[#8c8579] px-1">
              <span className="hidden sm:inline">
                Press <kbd className="rounded border border-[#e5e0d8] bg-[#f5f2ed] px-1 font-mono">⌘</kbd>+
                <kbd className="rounded border border-[#e5e0d8] bg-[#f5f2ed] px-1 font-mono">Enter</kbd> to submit
              </span>
              <span className="flex items-center gap-1 text-[#5a5a40] ml-auto">
                <CheckCircle2 className="h-3 w-3" />
                <span>Isolated strictly to {user.displayName || user.email || 'your account'}</span>
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Location Picker & Google Maps Integration Modal */}
      <LocationPickerModal
        isOpen={showLocationModal}
        currentLocation={activeInteraction?.location}
        onSave={handleSaveLocation}
        onRemove={activeInteraction?.location ? handleRemoveLocation : undefined}
        onClose={() => setShowLocationModal(false)}
      />

      {/* Custom Resilient Delete Confirmation Modal (Bypasses iframe window.confirm restriction) */}
      <DeleteConfirmationModal
        isOpen={Boolean(deleteTarget)}
        title={deleteTarget?.type === 'entry' ? 'Delete Reflection Entry' : 'Delete Reflection Turn'}
        itemTitle={deleteTarget?.entryTitle}
        itemSubtitle={deleteTarget?.entrySubtitle}
        warningText={
          deleteTarget?.type === 'entry'
            ? 'This will permanently delete this reflection session and all its messages from your personal Firestore storage. This action cannot be undone.'
            : 'This will permanently remove this reflection turn and sync your saved entry in Firestore.'
        }
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
};
