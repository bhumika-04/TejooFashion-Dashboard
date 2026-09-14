'use client';

import { useEffect, useState, useCallback } from 'react';
import { systemApi } from '@/services/api';
import { KPICard } from '@/components/ui/kpi-card';
import { useToast } from '@/components/ui/toast';
import { formatChatTimestamp } from '@/lib/utils';
import {
  Inbox, Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  RotateCcw, Trash2, Wifi, WifiOff,
} from 'lucide-react';

interface DeadLetter {
  id: number;
  provider: string;
  customerPhone: string;
  customerName: string | null;
  messageType: string;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  createdAt: string;
}

interface QueueHealth {
  pending: number;
  processing: number;
  failed: number;
  deadLetter: number;
  doneToday: number;
  oldestUnprocessedSeconds: number;
  deadLetters: DeadLetter[];
}

interface PublicUrl {
  value: string;
  configured: boolean;
  looksLocal: boolean;
  healthy: boolean;
}

const fmtAge = (s: number) => {
  if (s <= 0) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export default function SystemHealthPage() {
  const [queue, setQueue] = useState<QueueHealth | null>(null);
  const [publicUrl, setPublicUrl] = useState<PublicUrl | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { showToast } = useToast();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await systemApi.getQueueHealth();
      setQueue(res.data.queue);
      setPublicUrl(res.data.publicUrl);
    } catch {
      if (!silent) showToast('Failed to load system health', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 15_000); // quiet auto-refresh
    return () => clearInterval(t);
  }, [load]);

  const handleRetry = async (id: number) => {
    setBusyId(id);
    try {
      await systemApi.retryJob(id);
      showToast('Re-queued for processing', 'success');
      await load(true);
    } catch {
      showToast('Failed to re-queue', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscard = async (id: number) => {
    if (!confirm('Discard this message permanently? It will not be processed.')) return;
    setBusyId(id);
    try {
      await systemApi.discardJob(id);
      showToast('Message discarded', 'success');
      await load(true);
    } catch {
      showToast('Failed to discard', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const backlogWarn = (queue?.oldestUnprocessedSeconds ?? 0) >= 120;

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-beige min-h-screen space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">System Health</h1>
          <p className="text-sm text-gray-400">Incoming-message queue and public-URL status · auto-refreshes every 15s</p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5 text-gray-400" /> Refresh
        </button>
      </div>

      {/* Public URL (ngrok) status banner */}
      {publicUrl && !publicUrl.healthy && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
          <WifiOff className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">
              {publicUrl.configured ? 'Public URL looks local' : 'Public URL not configured'}
            </p>
            <p className="text-amber-700 mt-0.5">
              {publicUrl.configured
                ? <>Outbound media may fail — Interakt/Meta can&apos;t fetch <code className="font-mono">{publicUrl.value}</code>. Point <code className="font-mono">ExternalApis:PublicBaseUrl</code> at the live ngrok tunnel.</>
                : <>Set <code className="font-mono">ExternalApis:PublicBaseUrl</code> to your ngrok URL so outbound media is reachable.</>}
            </p>
          </div>
        </div>
      )}
      {publicUrl?.healthy && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-green-200 bg-green-50 text-sm">
          <Wifi className="h-4 w-4 text-green-600 flex-shrink-0" />
          <span className="text-green-800">Public URL healthy — <code className="font-mono text-green-700">{publicUrl.value}</code></span>
        </div>
      )}

      {/* Backlog warning */}
      {backlogWarn && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-red-200 bg-red-50 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <span className="text-red-800">
            Queue backlog: oldest unprocessed message has been waiting <strong>{fmtAge(queue!.oldestUnprocessedSeconds)}</strong>.
            Check that the backend processor is running.
          </span>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard index={0} title="Pending" value={queue?.pending ?? 0} icon={Inbox} theme="amber"
          subtitleText="Waiting to process" />
        <KPICard index={1} title="Processing" value={queue?.processing ?? 0} icon={Loader2} theme="blue"
          subtitleText="In flight" />
        <KPICard index={2} title="Retrying" value={queue?.failed ?? 0} icon={RotateCcw} theme="purple"
          subtitleText="Failed, will retry" />
        <KPICard index={3} title="Dead Letters" value={queue?.deadLetter ?? 0} icon={AlertTriangle} theme="rose"
          subtitleText="Exhausted retries" />
        <KPICard index={4} title="Done Today" value={queue?.doneToday ?? 0} icon={CheckCircle2} theme="green"
          subtitleText="Processed (IST)" className="col-span-2 lg:col-span-1" />
      </div>

      {/* Oldest unprocessed */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Clock className="h-4 w-4 text-gray-400" />
        Oldest unprocessed message age:
        <span className={`font-semibold ${backlogWarn ? 'text-red-600' : 'text-gray-700'}`}>
          {fmtAge(queue?.oldestUnprocessedSeconds ?? 0)}
        </span>
      </div>

      {/* Dead letter table */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold text-gray-800">Dead-Letter Queue</h2>
          {queue && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">{queue.deadLetter}</span>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
        ) : !queue || queue.deadLetters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-300 mb-2" />
            <p className="text-sm font-semibold text-gray-700">No dead letters</p>
            <p className="text-xs text-gray-400 mt-0.5">Every incoming message has been processed or is in flight.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-50">
                  <th className="px-5 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Error</th>
                  <th className="px-3 py-2.5 font-medium whitespace-nowrap">Received</th>
                  <th className="px-5 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {queue.deadLetters.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{d.customerName || d.customerPhone}</p>
                      <p className="text-[11px] text-gray-400">{d.customerPhone} · {d.provider}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{d.messageType}</span>
                    </td>
                    <td className="px-3 py-3 max-w-xs">
                      <p className="text-xs text-red-600 line-clamp-2" title={d.lastError ?? ''}>{d.lastError || '—'}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{d.retryCount}/{d.maxRetries} retries</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{formatChatTimestamp(d.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRetry(d.id)}
                          disabled={busyId === d.id}
                          className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800 px-2 py-1 rounded-lg hover:bg-emerald-50 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" /> Retry
                        </button>
                        <button
                          onClick={() => handleDiscard(d.id)}
                          disabled={busyId === d.id}
                          className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" /> Discard
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
