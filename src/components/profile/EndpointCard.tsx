import React from 'react';
import {
  Send,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import type { WebhookEndpointSummary } from '../../types';
import { REFLECTION_CATEGORIES, AI_MODES, WEBHOOK_LOCATION_FILTERS } from '../../types';
import { formatRelativeTime } from '../../utils/sanitize';

interface EndpointCardProps {
  endpoint: WebhookEndpointSummary;
  busy: 'test' | 'toggle' | 'delete' | null;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

const DESTINATION_LABEL: Record<string, string> = {
  discord: 'Discord',
  slack: 'Slack',
  other: 'Webhook',
};

function filterSummary(endpoint: WebhookEndpointSummary): string | null {
  const parts: string[] = [];
  const { categories, modes, location } = endpoint.filters || {
    categories: [],
    modes: [],
    location: 'any',
  };

  if (categories?.length) {
    parts.push(
      categories
        .map((c) => REFLECTION_CATEGORIES.find((x) => x.id === c)?.label ?? c)
        .join(', ')
    );
  }
  if (modes?.length) {
    parts.push(modes.map((m) => AI_MODES.find((x) => x.id === m)?.label ?? m).join(', '));
  }
  if (location && location !== 'any') {
    parts.push(WEBHOOK_LOCATION_FILTERS.find((x) => x.id === location)?.label ?? location);
  }
  return parts.length ? parts.join(' · ') : null;
}

export const EndpointCard: React.FC<EndpointCardProps> = ({
  endpoint,
  busy,
  onTest,
  onEdit,
  onDelete,
  onToggle,
}) => {
  const delivery = endpoint.lastDelivery;
  const filters = filterSummary(endpoint);

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-2xs transition-opacity ${
        endpoint.enabled ? 'border-[#e5e0d8]' : 'border-[#e5e0d8] opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[#5a5a40]/30 bg-[#5a5a40]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#5a5a40]">
              {DESTINATION_LABEL[endpoint.destination] ?? endpoint.destination}
            </span>
            <h3 className="truncate font-serif text-base font-semibold text-[#3d3d3d]">
              {endpoint.name}
            </h3>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-[#8c8579]">
            {endpoint.urlPreview}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onTest}
            disabled={busy !== null}
            className="cursor-pointer rounded-lg p-1.5 text-[#8c8579] transition-colors hover:bg-[#f5f2ed] hover:text-[#5a5a40] disabled:opacity-40"
            title="Send a test delivery"
          >
            {busy === 'test' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy !== null}
            className="cursor-pointer rounded-lg p-1.5 text-[#8c8579] transition-colors hover:bg-[#f5f2ed] hover:text-[#5a5a40] disabled:opacity-40"
            title="Edit endpoint"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy !== null}
            className="cursor-pointer rounded-lg p-1.5 text-[#8c8579] transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            title="Delete endpoint"
          >
            {busy === 'delete' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={endpoint.enabled}
            onClick={() => onToggle(!endpoint.enabled)}
            disabled={busy !== null}
            className={`ml-1 relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-40 ${
              endpoint.enabled ? 'bg-[#5a5a40]' : 'bg-[#d4cdc3]'
            }`}
            title={endpoint.enabled ? 'Enabled — click to pause' : 'Paused — click to enable'}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                endpoint.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {endpoint.events.map((evt) => (
          <span
            key={evt}
            className="rounded-md border border-[#e5e0d8] bg-[#f5f2ed] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#5a5a40]"
          >
            {evt}
          </span>
        ))}
      </div>

      {filters && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#8c8579]">
          <Filter className="h-3 w-3 shrink-0 text-[#5a5a40]" />
          <span className="truncate">{filters}</span>
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-1.5 text-[11px]">
        {!delivery ? (
          <span className="text-[#8c8579]">No deliveries yet</span>
        ) : delivery.status === 'success' ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="text-[#5a5a40]">Delivered {formatRelativeTime(delivery.at)}</span>
          </>
        ) : (
          <>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
            <span className="truncate text-red-700">
              Failed {formatRelativeTime(delivery.at)}
              {delivery.statusCode ? ` — ${delivery.statusCode}` : ''}
              {delivery.error ? ` — ${delivery.error}` : ''}
            </span>
          </>
        )}
      </div>

      {endpoint.destination === 'other' && endpoint.hasSigningSecret && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#8c8579]">
          <ShieldCheck className="h-3 w-3 shrink-0 text-[#5a5a40]" />
          Payloads are signed with <span className="font-mono">X-Reflections-Signature</span>
        </p>
      )}
    </div>
  );
};
