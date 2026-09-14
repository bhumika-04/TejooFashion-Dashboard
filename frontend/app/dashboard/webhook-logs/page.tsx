'use client';

import { useEffect, useState } from 'react';
import { webhookLogsApi } from '@/services/api';
import { Webhook, ChevronLeft, ChevronRight, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

export default function WebhookLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState('');
  const [successFilter, setSuccessFilter] = useState<'' | 'true' | 'false'>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { showToast } = useToast();
  const PAGE_SIZE = 50;

  const fetchLogs = async (p = page) => {
    setLoading(true);
    try {
      const res = await webhookLogsApi.getAll({
        page: p, pageSize: PAGE_SIZE,
        provider: provider || undefined,
        success: successFilter === '' ? undefined : successFilter === 'true',
      });
      setLogs(res.data.logs ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      showToast('Failed to load webhook logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(1); }, []);

  const applyFilters = () => { setPage(1); fetchLogs(1); };
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const handlePageChange = (p: number) => { setPage(p); fetchLogs(p); };

  const formatPayload = (raw: string) => {
    try { return JSON.stringify(JSON.parse(raw), null, 2); }
    catch { return raw; }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-beige">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Webhook className="h-5 w-5 text-emerald-700" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Webhook Logs</h1>
            <p className="text-xs text-gray-400 mt-0.5">{total} entries</p>
          </div>
        </div>
        <button onClick={() => fetchLogs(page)} className="p-2 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Provider</label>
          <input
            value={provider}
            onChange={e => setProvider(e.target.value)}
            placeholder="e.g. meta, twilio…"
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Status</label>
          <select value={successFilter} onChange={e => setSuccessFilter(e.target.value as any)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white">
            <option value="">All</option>
            <option value="true">Success</option>
            <option value="false">Failed</option>
          </select>
        </div>
        <button onClick={applyFilters}
          className="text-sm px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">
          Apply
        </button>
        <button onClick={() => { setProvider(''); setSuccessFilter(''); setPage(1); setTimeout(() => fetchLogs(1), 0); }}
          className="text-sm px-4 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8"></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Provider</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Error</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
                      <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                        <Webhook className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-semibold text-gray-700 mb-1">No webhook logs yet</p>
                      <p className="text-xs text-gray-400">Incoming WhatsApp webhook payloads will be recorded here</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <>
                    <tr
                      key={log.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {expandedId === log.id
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {log.receivedAt
                          ? formatDate(log.receivedAt)
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                          {log.provider || 'unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {log.processedSuccessfully ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                            <XCircle className="h-3 w-3" /> Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-500 max-w-[240px] truncate">
                        {log.errorMessage ?? <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr key={`${log.id}-expanded`} className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={5} className="px-6 py-4">
                          <p className="text-xs font-semibold text-gray-500 mb-2">Raw Payload</p>
                          <pre className="text-[11px] text-gray-700 bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto max-h-72 whitespace-pre-wrap break-all">
                            {log.payload ? formatPayload(log.payload) : '(empty)'}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
            <span>Page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => handlePageChange(page - 1)}
                className="p-1.5 rounded-lg hover:bg-white disabled:opacity-40 border border-gray-200">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button disabled={page === totalPages} onClick={() => handlePageChange(page + 1)}
                className="p-1.5 rounded-lg hover:bg-white disabled:opacity-40 border border-gray-200">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
