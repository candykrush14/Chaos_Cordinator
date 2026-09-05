import React from 'react';
import { Sparkles } from 'lucide-react';

interface PromptSuggestionsProps {
  onSelectPrompt: (text: string) => void;
  disabled?: boolean;
}

const PROMPTS = [
  {
    category: 'Emotions',
    text: "I've been feeling a bit overwhelmed with work lately, and I need help sorting out what's truly under my control.",
  },
  {
    category: 'Decisions',
    text: "I have an important crossroads in front of me and I want to weigh the intuitive pros and cons without overthinking.",
  },
  {
    category: 'Gratitude',
    text: "Today had a small moment that brought me unexpected joy, and I want to reflect on why it resonated so deeply.",
  },
  {
    category: 'Brainstorm',
    text: "I have an idea for a creative project or habit change, and I'd like to brainstorm simple first steps.",
  },
];

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  onSelectPrompt,
  disabled,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#8c8579]">
        <Sparkles className="h-3.5 w-3.5 text-[#5a5a40]" />
        <span>Thought starters &amp; prompts</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PROMPTS.map((item, idx) => (
          <button
            key={idx}
            type="button"
            disabled={disabled}
            onClick={() => onSelectPrompt(item.text)}
            className="group flex flex-col items-start rounded-xl border border-[#e5e0d8] bg-white p-3 text-left transition-all hover:border-[#5a5a40] hover:bg-[#f5f2ed] hover:shadow-xs active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <span className="text-[10px] font-bold tracking-widest uppercase text-[#8c8579] group-hover:text-[#5a5a40]">
              {item.category}
            </span>
            <span className="mt-1 text-xs text-[#3d3d3d] group-hover:text-[#5a5a40] line-clamp-2 leading-relaxed">
              "{item.text}"
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
