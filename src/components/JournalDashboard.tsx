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
  ChevronRight,
  Download,
} from 'lucide-react';
import type { JournalInteraction, JournalMessage, AIMode, UserProfile } from '../types';
import {
  getInteractionsCollectionRef,
  saveInteractionToFirestore,
  deleteInteractionFromFirestore,
  onSnapshot,
  query,
  orderBy,
} from '../firebase/config';
import { ReflectionEntry } from './ReflectionEntry';
import { PromptSuggestions } from './PromptSuggestions';
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedTurn, setFailedTurn] = useState<{
    userInput: string;
    aiResponse?: string;
    modelUsed?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Subscribe to user's isolated Firestore collection: /users/{userId}/interactions
  useEffect(() => {
    if (!user.uid) return;
    setLoadingHistory(true);

    const collectionRef = getInteractionsCollectionRef(user.uid);
    const q = query(collectionRef, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: JournalInteraction[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as JournalInteraction);
        });
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

  // Filter past entries based on search query
  const filteredInteractions = interactions.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const matchTitle = item.title?.toLowerCase().includes(q);
    const matchMessages = item.messages?.some((m) =>
      m.content?.toLowerCase().includes(q)
    );
    return matchTitle || matchMessages;
  });

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

    try {
      // 1. Call full-stack server endpoint with resilient model fallback
      const response = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          reflectionId: interactionId,
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
      };

      // 2. Guaranteed Transaction Verification: Persist both user input and AI response to Firestore
      try {
        await saveInteractionToFirestore(user.uid, interactionToSave);
        setSaveStatus('saved');
        onSelectInteraction(interactionToSave);
        // Only clear input buffer after confirmed successful write
        setInputText('');
        setFailedTurn(null);
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

  // Handle deleting an interaction from Firestore
  const handleDeleteEntry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this journal entry?')) {
      return;
    }

    try {
      await deleteInteractionFromFirestore(user.uid, id);
      if (activeInteraction?.id === id) {
        onNewReflection();
      }
    } catch (err: any) {
      console.error('Failed to delete interaction:', err);
      setErrorMessage('Could not delete entry: ' + err.message);
    }
  };

  // Export current session as clean Markdown
  const handleExportMarkdown = () => {
    if (!activeInteraction || !activeInteraction.messages?.length) return;
    let md = `# ${activeInteraction.title}\n`;
    md += `Date: ${formatJournalDate(activeInteraction.createdAt)}\n\n---\n\n`;

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
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl flex-col lg:flex-row overflow-hidden bg-[#fdfbf7]">
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
                      onClick={(e) => handleDeleteEntry(item.id, e)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-600 p-0.5 text-[#8c8579] transition-opacity cursor-pointer shrink-0"
                      title="Delete entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-[#8c8579]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {formatJournalDate(item.updatedAt || item.createdAt)}
                    </span>
                    <span>•</span>
                    <span className="capitalize">{item.messages?.length || 0} turns</span>
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

        {/* Error Alert / Retry Save Banner */}
        {errorMessage && (
          <div
            id="workspace-error-banner"
            className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-900 shrink-0"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
            {failedTurn && (
              <button
                onClick={handleRetrySave}
                className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 cursor-pointer shrink-0"
              >
                Retry Save
              </button>
            )}
          </div>
        )}

        {/* Message Stream */}
        <div
          id="messages-scroll-area"
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#fdfbf7]"
        >
          {(!activeInteraction || !activeInteraction.messages?.length) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto space-y-4">
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
              {activeInteraction.messages.map((message) => (
                <ReflectionEntry key={message.id} message={message} />
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

              <div className="flex items-center gap-3 text-[11px] text-[#8c8579]">
                <span>{wordCount} words</span>
                <span>•</span>
                <span>{inputText.length}/20,000 chars</span>
              </div>
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
    </div>
  );
};
