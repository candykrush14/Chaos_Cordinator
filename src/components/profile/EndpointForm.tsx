import React, { useState } from 'react';
import { X, Check, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import {
  WEBHOOK_DESTINATIONS,
  WEBHOOK_EVENTS,
  WEBHOOK_LOCATION_FILTERS,
  REFLECTION_CATEGORIES,
  AI_MODES,
  DEFAULT_WEBHOOK_FILTERS,
} from '../../types';
import type {
  WebhookDestination,
  WebhookEvent,
  WebhookEndpointInput,
  WebhookEndpointSummary,
  WebhookLocationFilter,
  ReflectionCategory,
  AIMode,
} from '../../types';

interface EndpointFormProps {
  initial?: WebhookEndpointSummary;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: WebhookEndpointInput) => void;
  onCancel: () => void;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const chipBase =
  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer';
const chipOn = 'border-[#5a5a40] bg-[#5a5a40] text-white';
const chipOff = 'border-[#e5e0d8] bg-white text-[#3d3d3d] hover:border-[#5a5a40]/50 hover:bg-[#f5f2ed]';

export const EndpointForm: React.FC<EndpointFormProps> = ({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}) => {
  const isEdit = Boolean(initial);

  const [destination, setDestination] = useState<WebhookDestination>(
    initial?.destination ?? 'discord'
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(
    initial?.events ?? ['reflection.created']
  );
  const [categories, setCategories] = useState<ReflectionCategory[]>(
    initial?.filters?.categories ?? DEFAULT_WEBHOOK_FILTERS.categories
  );
  const [modes, setModes] = useState<AIMode[]>(
    initial?.filters?.modes ?? DEFAULT_WEBHOOK_FILTERS.modes
  );
  const [location, setLocation] = useState<WebhookLocationFilter>(
    initial?.filters?.location ?? DEFAULT_WEBHOOK_FILTERS.location
  );

  const activeDestination = WEBHOOK_DESTINATIONS.find((d) => d.id === destination)!;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    onSubmit({
      destination,
      name: name.trim(),
      url: url.trim(),
      events,
      filters: { categories, modes, location },
      enabled: initial?.enabled ?? true,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[#e5e0d8] bg-white p-4 sm:p-5 shadow-xs"
    >
      <div className="flex items-center justify-between border-b border-[#e5e0d8] pb-3">
        <h3 className="font-serif text-lg font-semibold text-[#3d3d3d]">
          {isEdit ? 'Edit endpoint' : 'New endpoint'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-lg p-1 text-[#8c8579] transition-colors hover:bg-[#f5f2ed] hover:text-[#3d3d3d]"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Destination */}
      <div className="mt-4">
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#5a5a40]">
          Destination
        </label>
        <div className="grid grid-cols-3 gap-2">
          {WEBHOOK_DESTINATIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDestination(d.id)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                destination === d.id
                  ? 'border-[#5a5a40] bg-[#5a5a40]/10 text-[#5a5a40]'
                  : 'border-[#e5e0d8] bg-white text-[#8c8579] hover:bg-[#f5f2ed] hover:text-[#3d3d3d]'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[#8c8579]">{activeDestination.hint}</p>
      </div>

      {/* Name + URL */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#3d3d3d]">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={activeDestination.namePlaceholder}
            className="w-full rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] px-3 py-2.5 text-sm text-[#3d3d3d] placeholder:text-[#8c8579]/70 focus:border-[#5a5a40] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#5a5a40]/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#3d3d3d]">Webhook URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={activeDestination.urlPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-[#e5e0d8] bg-[#fdfbf7] px-3 py-2.5 font-mono text-xs text-[#3d3d3d] placeholder:text-[#8c8579]/70 focus:border-[#5a5a40] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#5a5a40]/30"
          />
          {isEdit && (
            <p className="mt-1.5 text-[11px] text-[#8c8579]">
              The saved URL is never sent back to the browser. Re-enter it to save changes
              (currently <span className="font-mono">{initial?.urlPreview}</span>).
            </p>
          )}
        </div>
      </div>

      {/* Events */}
      <div className="mt-5">
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#5a5a40]">
          Send on
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {WEBHOOK_EVENTS.map((evt) => {
            const checked = events.includes(evt.id);
            return (
              <button
                key={evt.id}
                type="button"
                onClick={() => setEvents(toggle(events, evt.id))}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                  checked
                    ? 'border-[#5a5a40] bg-[#5a5a40]/5'
                    : 'border-[#e5e0d8] bg-white hover:bg-[#f5f2ed]'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked ? 'border-[#5a5a40] bg-[#5a5a40] text-white' : 'border-[#d4cdc3] bg-white'
                  }`}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-semibold text-[#3d3d3d]">
                    {evt.id}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-[#8c8579]">
                    {evt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-5 rounded-2xl border border-[#e5e0d8] bg-[#f5f2ed]/60 p-4">
        <h4 className="text-sm font-semibold text-[#3d3d3d]">Only for these entries</h4>
        <p className="mt-0.5 text-[11px] text-[#8c8579]">
          Leave a row untouched to include everything in it.
        </p>

        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-semibold text-[#3d3d3d]">Category</span>
          <div className="flex flex-wrap gap-2">
            {REFLECTION_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategories(toggle(categories, c.id))}
                className={`${chipBase} ${categories.includes(c.id) ? chipOn : chipOff}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-semibold text-[#3d3d3d]">Reflection mode</span>
          <div className="flex flex-wrap gap-2">
            {AI_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModes(toggle(modes, m.id))}
                className={`${chipBase} ${modes.includes(m.id) ? chipOn : chipOff}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-semibold text-[#3d3d3d]">Location</span>
          <div className="flex flex-wrap gap-2">
            {WEBHOOK_LOCATION_FILTERS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLocation(l.id)}
                className={`${chipBase} ${location === l.id ? chipOn : chipOff}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#e5e0d8] bg-white p-3 text-[11px] leading-relaxed text-[#8c8579]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#5a5a40]" />
        <span>
          Deliveries include the entry title, category, mode, turn count, pinned location and a
          short excerpt — not the full conversation. The URL is stored server-side and never
          returned to your browser.
        </span>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#e5e0d8] pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="cursor-pointer rounded-xl border border-[#e5e0d8] bg-white px-4 py-2 text-xs font-semibold text-[#3d3d3d] transition-colors hover:bg-[#f5f2ed] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#5a5a40] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#4a4a35] disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span>{isEdit ? 'Save changes' : 'Add endpoint'}</span>
        </button>
      </div>
    </form>
  );
};
