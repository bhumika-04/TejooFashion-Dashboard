'use client';

import { useEffect, useState } from 'react';
import { auditLogsApi } from '@/services/api';
import { ClipboardList, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

const ACTION_OPTIONS = ['', 'Login', 'Logout', 'Create', 'Update', 'Delete', 'Assign', 'Close', 'Escalate', 'Resolve'];
const ENTITY_OPTIONS = ['', 'User', 'Conversation', 'Message', 'Team', 'Session', 'EscalationRule', 'QuickReply', 'Tag'];

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { showToast } = useToast();
  const PAGE_SIZE = 50;

  const fetchLogs = async (p = page) => {
    setLoading(true);
    try {
      const res = await auditLogsApi.getAll({
        page: p, pageSize: PAGE_SIZE,
        action: action || undefined,
        entityType: entityType || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setLogs(res.data.logs ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      showToast('Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(1); }, []);

  const applyFilters = () => { setPage(1); fetchLogs(1); };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handlePageChange = (p: number) => { setPage(p); fetchLogs(p); };

  return (
    <div className="flex flex-col h-full min-h-0 bg-beige">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-emerald-700" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Audit Logs</h1>
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
          <label className="text-xs text-gray-500 block mb-1">Action</label>
          <select value={action} onChange={e => setAction(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white">
            {ACTION_OPTIONS.map(o => <option key={o} value={o}>{o || 'All actions'}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Entity Type</label>
          <select value={entityType} onChange={e => setEntityType(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white">
            {ENTITY_OPTIONS.map(o => <option key={o} value={o}>{o || 'All entities'}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
        </div>
        <button onClick={applyFilters}
          className="text-sm px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">
          Apply
        </button>
        <button onClick={() => { setAction(''); setEntityType(''); setFrom(''); setTo(''); setPage(1); setTimeout(() => fetchLogs(1), 0); }}
          className="text-sm px-4 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Changes</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
                      <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                        <ClipboardList className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-semibold text-gray-700 mb-1">No audit logs yet</p>
                      <p className="text-xs text-gray-400">Actions like user creation, updates, and deletions will appear here</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-700">{log.userName ?? '—'}</p>
                      {log.userId && <p className="text-[11px] text-gray-400">ID: {log.userId}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        log.action?.toLowerCase().includes('delete') ? 'bg-red-100 text-red-700' :
                        log.action?.toLowerCase().includes('create') ? 'bg-green-100 text-green-700' :
                        log.action?.toLowerCase().includes('login') ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {log.entityType}{log.entityId ? ` #${log.entityId}` : ''}
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      {(log.oldValue || log.newValue) ? (
                        <div className="text-[11px] space-y-0.5">
                          {log.oldValue && <p className="text-red-500 truncate">− {log.oldValue}</p>}
                          {log.newValue && <p className="text-green-600 truncate">+ {log.newValue}</p>}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{log.ipAddress ?? '—'}</td>
                  </tr>
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
