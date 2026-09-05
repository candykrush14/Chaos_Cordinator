import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { User, Sparkles, Copy, Check, Clock, Trash2 } from 'lucide-react';
import type { JournalMessage } from '../types';
import { formatJournalDate } from '../utils/sanitize';

interface ReflectionEntryProps {
  message: JournalMessage;
  onDelete?: () => void;
}

export const ReflectionEntry: React.FC<ReflectionEntryProps> = ({ message, onDelete }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  return (
    <div
      className={`group relative flex gap-3 transition-opacity ${
        isUser ? 'items-start justify-end' : 'items-start justify-start'
      }`}
    >
      {/* Bubble Container */}
      <div
        className={`relative transition-all ${
          isUser
            ? 'bg-[#f5f2ed] p-4 rounded-2xl rounded-tr-none max-w-[85%] sm:max-w-[80%] border border-[#e5e0d8] shadow-sm text-[#3d3d3d]'
            : 'bg-white p-5 rounded-2xl rounded-tl-none max-w-[92%] sm:max-w-[88%] border border-[#e5e0d8] shadow-md relative overflow-hidden text-[#3d3d3d]'
        }`}
      >
        {/* Left vertical accent bar for Gemini response */}
        {!isUser && (
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#5a5a40]" />
        )}

        {/* Header Metadata */}
        <div className="flex items-center justify-between gap-3 mb-2 text-xs">
          <div className="flex items-center gap-2">
            {isUser ? (
              <div className="w-5 h-5 rounded-full bg-[#d4cdc3] flex items-center justify-center text-[#5a5a40]">
                <User className="h-3 w-3" />
              </div>
            ) : (
              <div className="w-5 h-5 bg-[#5a5a40] rounded-full flex items-center justify-center text-white">
                <Sparkles className="h-3 w-3" />
              </div>
            )}
            <span
              className={`text-[11px] font-bold uppercase tracking-widest ${
                isUser ? 'text-[#8c8579]' : 'text-[#5a5a40]'
              }`}
            >
              {isUser ? 'Your Journal Reflection' : 'Gemini Reflection'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-[#8c8579]">
            {!isUser && message.modelUsed && (
              <span className="rounded bg-[#f5f2ed] border border-[#e5e0d8] px-1.5 py-0.5 font-mono font-medium text-[#5a5a40]">
                {message.modelUsed}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatJournalDate(message.timestamp)}
            </span>
          </div>
        </div>

        {/* Message Content */}
        {isUser ? (
          <p className="whitespace-pre-wrap text-base leading-relaxed text-[#3d3d3d]">
            {message.content}
          </p>
        ) : (
          <div className="prose prose-stone max-w-none text-base text-[#3d3d3d] leading-relaxed font-serif prose-p:leading-relaxed prose-headings:font-serif prose-headings:text-[#5a5a40] prose-strong:text-[#3d3d3d]">
            <div className="markdown-body">
              <Markdown>{message.content}</Markdown>
            </div>
          </div>
        )}

        {/* Action Toolbar */}
        <div
          className={`mt-3 flex items-center justify-between pt-1.5 border-t ${
            isUser ? 'border-[#e5e0d8]' : 'border-[#f5f2ed]'
          }`}
        >
          {onDelete ? (
            <button
              type="button"
              id={`delete-message-btn-${message.id}`}
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-[#8c8579] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="Delete this message turn"
            >
              <Trash2 className="h-3 w-3" />
              <span>Delete Turn</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            id={`copy-message-btn-${message.id}`}
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-[#8c8579] hover:text-[#5a5a40] hover:bg-[#f5f2ed] transition-colors cursor-pointer"
            title="Copy entry text"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                <span className="text-emerald-700">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
