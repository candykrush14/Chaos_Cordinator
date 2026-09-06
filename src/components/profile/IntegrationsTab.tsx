import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Webhook,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Copy,
  X,
} from 'lucide-react';
import type { WebhookEndpointSummary, WebhookEndpointInput } from '../../types';
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  setWebhookEnabled,
  deleteWebhook,
  testWebhook,
} from '../../utils/webhooks';
import { EndpointCard } from './EndpointCard';
import { EndpointForm } from './EndpointForm';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';

type BusyState = { id: string; kind: 'test' | 'toggle' | 'delete' } | null;

export const IntegrationsTab: React.FC = () => {
  const [endpoints, setEndpoints] = useState<WebhookEndpointSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpointSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busy, setBusy] = useState<BusyState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpointSummary | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoadError(null);
      const list = await listWebhooks();
      setEndpoints(list);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load your endpoints.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 4000);
  };

  const handleSubmit = async (input: WebhookEndpointInput) => {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateWebhook(editing.id, input);
        flash('Endpoint updated.');
      } else {
        const result = await createWebhook(input);
        if (result.signingSecret) setRevealedSecret(result.signingSecret);
        flash('Endpoint added.');
      }
      setShowForm(false);
      setEditing(null);
      await refresh();
    } catch (err: any) {
      setFormError(err?.message || 'Could not save this endpoint.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (endpoint: WebhookEndpointSummary) => {
    setBusy({ id: endpoint.id, kind: 'test' });
    try {
      const delivery = await testWebhook(endpoint.id);
      flash(
        delivery?.status === 'success'
          ? `Test delivered to "${endpoint.name}".`
          : `Test failed: ${delivery?.error || 'endpoint rejected the delivery.'}`
      );
      await refresh();
    } catch (err: any) {
      flash(err?.message || 'Test delivery failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleToggle = async (endpoint: WebhookEndpointSummary, enabled: boolean) => {
    setBusy({ id: endpoint.id, kind: 'toggle' });
    // Optimistic - the switch should feel instant.
    setEndpoints((prev) =>
      prev.map((e) => (e.id === endpoint.id ? { ...e, enabled } : e))
    );
    try {
      await setWebhookEnabled(endpoint.id, enabled);
    } catch (err: any) {
      setEndpoints((prev) =>
        prev.map((e) => (e.id === endpoint.id ? { ...e, enabled: !enabled } : e))
      );
      flash(err?.message || 'Could not change that endpoint.');
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy({ id: deleteTarget.id, kind: 'delete' });
    try {
      await deleteWebhook(deleteTarget.id);
      setEndpoints((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      flash(`"${deleteTarget.name}" was deleted.`);
      setDeleteTarget(null);
    } catch (err: any) {
      flash(err?.message || 'Could not delete that endpoint.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-[#3d3d3d]">Integrations</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#8c8579]">
            Send a notification to Discord, Slack or any HTTPS endpoint when reflections are
            created, updated, pinned or deleted. Deliveries happen server-side — your webhook URLs
            never reach the browser again after you save them.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormError(null);
              setShowForm(true);
            }}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#5a5a40] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#4a4a35]"
          >
            <Plus className="h-4 w-4" />
            <span>New endpoint</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e0d8] bg-[#f5f2ed] px-3 py-2 text-xs text-[#3d3d3d]">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#5a5a40]" />
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="cursor-pointer text-[#8c8579] hover:text-[#3d3d3d]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {revealedSecret && (
        <div className="rounded-xl border border-[#5a5a40]/30 bg-[#5a5a40]/5 p-3.5">
          <div className="flex items-start gap-2.5">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#5a5a40]" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#3d3d3d]">
                Signing secret — copy it now, it won&apos;t be shown again
              </p>
              <p className="mt-0.5 text-[11px] text-[#8c8579]">
                Verify deliveries by recomputing{' '}
                <span className="font-mono">HMAC-SHA256(&quot;&#123;timestamp&#125;.&#123;body&#125;&quot;)</span> and
                comparing to the <span className="font-mono">X-Reflections-Signature</span> header.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[#e5e0d8] bg-white px-2.5 py-1.5 font-mono text-[11px] text-[#3d3d3d]">
                  {revealedSecret}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(revealedSecret).catch(() => {});
                    flash('Signing secret copied.');
                  }}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-[#e5e0d8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#3d3d3d] hover:bg-[#f5f2ed]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRevealedSecret(null)}
              className="cursor-pointer rounded-lg p-1 text-[#8c8579] hover:text-[#3d3d3d]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <EndpointForm
          initial={editing ?? undefined}
          submitting={submitting}
          error={formError}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
            setFormError(null);
          }}
        />
      )}

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-[#8c8579]">
          <Loader2 className="h-4 w-4 animate-spin text-[#5a5a40]" />
          Loading endpoints…
        </div>
      ) : endpoints.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#e5e0d8] bg-white/60 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e5e0d8] bg-[#f5f2ed] text-[#5a5a40]">
            <Webhook className="h-6 w-6" />
          </div>
          <h3 className="font-serif text-lg font-semibold text-[#5a5a40]">No endpoints yet</h3>
          <p className="max-w-sm text-sm text-[#3d3d3d]">
            Add a Discord or Slack webhook to get a message whenever you write, pin or remove a
            reflection.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#5a5a40] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4a4a35]"
          >
            <Plus className="h-4 w-4" />
            <span>New endpoint</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {endpoints.map((endpoint) => (
            <EndpointCard
              key={endpoint.id}
              endpoint={endpoint}
              busy={busy?.id === endpoint.id ? busy.kind : null}
              onTest={() => handleTest(endpoint)}
              onEdit={() => {
                setEditing(endpoint);
                setFormError(null);
                setShowForm(true);
              }}
              onDelete={() => setDeleteTarget(endpoint)}
              onToggle={(enabled) => handleToggle(endpoint, enabled)}
            />
          ))}
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={Boolean(deleteTarget)}
        title="Delete endpoint"
        itemTitle={deleteTarget?.name}
        itemSubtitle={deleteTarget?.urlPreview}
        warningText="This endpoint will stop receiving notifications immediately. You'll need the webhook URL again to recreate it."
        isDeleting={busy?.kind === 'delete'}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (busy?.kind !== 'delete') setDeleteTarget(null);
        }}
      />
    </div>
  );
};
