'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent } from '@/components/ui/card';
import { sessionsApi, usersApi, dashboardApi } from '@/services/api';
import { Phone, Edit, Trash2, CheckCircle, MessageSquare, Clock, Search, SlidersHorizontal, Download, Send, X, UserCheck, Copy, AlertTriangle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { SessionModal, SessionFormData } from '@/components/modals/SessionModal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { KPICard } from '@/components/ui/kpi-card';
import { FAB } from '@/components/ui/fab';
import { parseUTCDate } from '@/lib/utils';

export default function SessionsPage() {
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const isCRR = (currentUser.role ?? currentUser.Role ?? '').toUpperCase() === 'CRR';
  const currentUserId: number | undefined = isCRR ? (currentUser.id ?? currentUser.Id) : undefined;

  const [sessions, setSessions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [respSla, setRespSla] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Online' | 'Offline'>('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [testSession, setTestSession] = useState<any>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('Hello! This is a test message from Tejoo Fashion dashboard.');
  const [testSending, setTestSending] = useState(false);
  const { showToast } = useToast();

  const normalizePhone = (phone: string): string => {
    const cleaned = phone.trim().replace(/[\s\-]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.length === 12 && cleaned.startsWith('91')) return '+' + cleaned;
    if (cleaned.length === 10) return '+91' + cleaned;
    return cleaned.startsWith('+') ? cleaned : '+' + cleaned;
  };

  const handleTestMessage = async () => {
    if (!testPhone.trim() || !testMsg.trim()) { showToast('Enter phone number and message', 'error'); return; }
    setTestSending(true);
    try {
      const phone = normalizePhone(testPhone);
      const res = await sessionsApi.sendTestMessage(testSession.id, phone, testMsg);
      if (res.data.success) {
        showToast(`Message sent to ${phone} via ${testSession?.phoneNumber}`, 'success');
        setTestSession(null);
      } else {
        showToast(res.data.message || 'Failed to send message', 'error');
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to send message', 'error');
    } finally {
      setTestSending(false);
    }
  };

  useEffect(() => {
    loadSessions();
    loadUsers();
    // Real first-response metric (last 7 days, 30-min SLA) — replaces the old hardcoded value.
    dashboardApi.getResponseSla(7, 30).then(r => setRespSla(r.data)).catch(() => {});
  }, []);

  const loadSessions = async () => {
    try {
      const response = await sessionsApi.getAll(undefined, currentUserId);
      setSessions(response.data);
    } catch {
      showToast('Failed to load sessions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await usersApi.getAll();
      setUsers(response.data);
    } catch {
      // silently ignore
    }
  };

  const handleAddSession = () => {
    setSelectedSession(null);
    setModalOpen(true);
  };

  const handleEditSession = (session: any) => {
    setSelectedSession(session);
    setModalOpen(true);
  };

  const handleSubmitSession = async (data: SessionFormData) => {
    try {
      // Map frontend data to backend format
      const payload = {
        provider: data.provider,
        phoneNumber: data.phoneNumber,
        assignedUserId: data.assignedUserId,
        interaktApiKey: data.provider === 'Interakt' ? data.apiKey : undefined,
        metaPhoneNumberId: data.provider === 'Meta' ? data.apiKey : undefined,
        metaAccessToken: data.provider === 'Meta' ? data.apiKey : undefined,
        autoReplyEnabled: data.autoReplyEnabled,
        aiMode: data.aiMode,
        slaMinutes: data.slaMinutes,
        isConnected: data.connectionVerified,
      };

      if (selectedSession) {
        await sessionsApi.update(selectedSession.id, payload);
        showToast('Session updated successfully', 'success');
      } else {
        await sessionsApi.create(payload);
        showToast('Session created successfully', 'success');
      }
      loadSessions();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to save session';
      showToast(errorMessage, 'error');
      throw err;
    }
  };

  const handleDeleteClick = (session: any) => {
    setSessionToDelete(session);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    try {
      await sessionsApi.delete(sessionToDelete.id);
      showToast('Session deleted successfully', 'success');
      loadSessions();
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
    } catch {
      showToast('Failed to delete session', 'error');
    }
  };

  // Calculate KPI stats
  const totalSessions = sessions.length;
  // "Active" = sessions that actually received a customer (inbound) message today — not the IsActive
  // config flag (on for all numbers). Idle numbers with no inbound today are not counted as active.
  const activeSessions = sessions.filter(s => (s.messagesToday || 0) > 0).length;
  const totalInboundToday = sessions.reduce((sum, s) => sum + (s.messagesToday || 0), 0);
  const totalOutboundToday = sessions.reduce((sum, s) => sum + (s.outboundToday || 0), 0);

  // Real avg first-response time (customer inbound → first recorded reply), last 7 days.
  const slaOverall = respSla?.overall;
  const avgFrtMin: number | null = slaOverall?.avgFirstResponseMinutes ?? null;
  const slaPct: number | null = slaOverall && slaOverall.responded > 0
    ? Math.round((slaOverall.metSla / slaOverall.responded) * 100) : null;
  const fmtDuration = (min: number | null): string => {
    if (min == null) return '—';
    if (min < 1) return `${Math.max(1, Math.round(min * 60))}s`;
    if (min < 60) return `${Math.round(min)}m`;
    const h = Math.floor(min / 60); const m = Math.round(min % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  // Online = actively receiving — got a customer (inbound) message within the last 24h. This reflects
  // real activity, not the stored IsConnected flag (which stays on for nearly every number). A number
  // with no inbound in 24h reads "Offline" (and its Last-inbound shows "Stale"), matching that threshold.
  const ONLINE_WINDOW_MS = 24 * 60 * 60 * 1000;
  const isOnline = (s: any): boolean => {
    const d = parseUTCDate(s.lastInboundAt);
    return d ? (Date.now() - d.getTime()) < ONLINE_WINDOW_MS : false;
  };

  // Filtered sessions for list
  const filteredSessions = sessions.filter(s => {
    const matchesSearch = !search || s.phoneNumber?.toLowerCase().includes(search.toLowerCase()) || s.assignedUserName?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || (statusFilter === 'Online' ? isOnline(s) : !isOnline(s));
    return matchesSearch && matchesStatus;
  });

  // Webhook base = backend origin. Prefer NEXT_PUBLIC_NGROK_URL (local-dev tunnel override),
  // else derive from NEXT_PUBLIC_API_URL by stripping the trailing /api. Never a bare relative path.
  const ngrokBase = (
    process.env.NEXT_PUBLIC_NGROK_URL
    || (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')
  ).replace(/\/$/, '');
  const getWebhookUrl = (session: any) =>
    `${ngrokBase}/api/webhook/${session.provider === 'Meta' ? 'meta' : 'interakt'}?sid=${session.id}`;

  const handleCopyWebhook = (session: any) => {
    navigator.clipboard.writeText(getWebhookUrl(session));
    showToast(`Webhook URL copied for ${session.phoneNumber}`, 'success');
  };

  const handleExport = () => {
    const rows = [
      ['Phone Number', 'Provider', 'Status', 'Assigned To', 'Inbound Today', 'Outbound Today', 'First-Response SLA (min)', 'AI Mode', 'Webhook URL'],
      ...filteredSessions.map(s => [
        s.phoneNumber, s.provider, isOnline(s) ? 'Online' : 'Offline',
        s.assignedUserName || '—', s.messagesToday || 0, s.outboundToday || 0,
        s.slaMinutes ?? 30,
        s.aiMode ?? 'suggest',
        getWebhookUrl(s),
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'sessions-webhook-urls.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 bg-beige min-h-screen">
      {/* KPI + toolbar block — sticks to the top on desktop so the search/filter stays reachable
          while scrolling the session list (mobile scrolls normally to avoid pinning tall KPI rows) */}
      <div className="lg:sticky lg:top-0 z-20 bg-beige pt-4 sm:pt-6 lg:pt-8 pb-2">
      {/* KPI Cards — 5 cards; last one fills the trailing gap so there's no blank at any width */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6 items-stretch">
        <KPICard index={0}
          title="Total Sessions"
          value={totalSessions}
          icon={Phone}
          theme="blue"
          subtitleText="All time"
        />
        <KPICard index={1}
          title="Active Sessions"
          value={activeSessions}
          icon={CheckCircle}
          theme="green"
          subtitleText="Received inbound today"
        />
        <KPICard index={2}
          title="Inbound Today"
          value={totalInboundToday}
          icon={MessageSquare}
          theme="amber"
          subtitleText="Customer messages"
        />
        <KPICard index={3}
          title="Outbound Today"
          value={totalOutboundToday}
          icon={Send}
          theme="cyan"
          subtitleText="Sent messages"
        />
        <KPICard index={4}
          title="Avg First Response"
          value={fmtDuration(avgFrtMin)}
          icon={Clock}
          theme="purple"
          subtitleText={slaPct != null ? `${slaPct}% within 30m SLA · 7d` : 'Last 7 days'}
          // Fill the trailing gap: full row on 2-col mobile, spans last 2 of 3 on md, single on xl(5-col)
          className="col-span-2 xl:col-span-1"
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        {/* Search — takes all remaining space */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by phone number or agent name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        {/* Filter */}
        <div className="relative">
          <button
            onClick={() => setFilterOpen(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border rounded-lg transition-all whitespace-nowrap ${
              statusFilter !== 'All'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-700'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filter
            {statusFilter !== 'All' && (
              <span className="ml-1 text-xs bg-white text-gray-900 rounded-full px-1.5 font-bold">{statusFilter}</span>
            )}
          </button>
          {filterOpen && (
            <div className="absolute left-0 mt-1.5 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
              {(['All', 'Online', 'Offline'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => { setStatusFilter(opt); setFilterOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    statusFilter === opt ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Export */}
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all whitespace-nowrap"
        >
          <Download className="h-4 w-4 text-gray-400" />
          Export
        </button>

        {/* CRR badge */}
        {isCRR && (
          <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg whitespace-nowrap">
            <UserCheck className="h-3.5 w-3.5" />
            My Session
          </span>
        )}
      </div>
      </div>{/* end sticky KPI + toolbar block */}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-32 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
              <div className="skeleton h-9 w-full rounded-xl mt-1" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSessions.map((session, i) => {
            const delays = ['delay-75','delay-150','delay-225','delay-300','delay-375'];
            const delay = delays[i % delays.length];
            return (
            <div key={session.id} className={`group bg-white rounded-2xl border border-gray-200 shadow-sm
              hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-out
              flex flex-col p-5 gap-4 animate-fade-up ${delay}`}>

              {/* Phone + Status */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0
                    group-hover:bg-gray-200 group-hover:scale-105 transition-all duration-300">
                    <Phone className="h-5 w-5 text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{session.phoneNumber}</p>
                    <p className="text-xs text-gray-400">{session.provider}</p>
                  </div>
                </div>
                {(() => { const online = isOnline(session); return (
                <span title={online ? 'Received a customer message in the last 24h' : 'No inbound in the last 24h'}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                  online
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-gray-100 text-gray-500 border-gray-200'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-green-500 pulse-dot' : 'bg-gray-400'}`} />
                  {online ? 'Online' : 'Offline'}
                </span> ); })()}
              </div>

              {/* Details */}
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">Assigned to</span>
                  <span className="font-semibold text-gray-900">{session.assignedUserName || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">Messages today</span>
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="inline-flex items-center gap-1 text-amber-600" title="Inbound (customer)">
                      <ArrowDownLeft className="h-3.5 w-3.5" />{session.messagesToday || 0}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="inline-flex items-center gap-1 text-cyan-600" title="Outbound (sent)">
                      <ArrowUpRight className="h-3.5 w-3.5" />{session.outboundToday || 0}
                    </span>
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">Last inbound</span>
                  {(() => {
                    const d = parseUTCDate(session.lastInboundAt);  // stored UTC — parse as UTC, not local
                    const t = d ? d.getTime() : 0;
                    if (!t) return <span className="text-xs font-semibold text-gray-400">No inbound yet</span>;
                    const mins = Math.floor((Date.now() - t) / 60000);
                    const rel = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
                    const stale = mins >= 1440; // no inbound in 24h+ → likely webhook/connection issue
                    return (
                      <span
                        title={`Last inbound message: ${new Date(t).toLocaleString()}`}
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          stale ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                        }`}
                      >
                        {stale && <AlertTriangle className="h-3 w-3" />}
                        {stale ? `Stale · ${rel}` : rel}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">AI Mode</span>
                  {(() => {
                    const mode = (session.aiMode ?? 'suggest').toLowerCase();
                    const cfg = mode === 'auto'
                      ? { label: 'Auto', cls: 'bg-emerald-100 text-emerald-700', title: 'AI replies to customers directly' }
                      : mode === 'off'
                      ? { label: 'Off', cls: 'bg-gray-100 text-gray-500', title: 'AI is off — fully manual' }
                      : { label: 'Suggest', cls: 'bg-violet-100 text-violet-700', title: 'AI drafts replies for the agent to review' };
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`} title={cfg.title}>
                        <span className={`h-1.5 w-1.5 rounded-full ${mode === 'off' ? 'bg-gray-400' : mode === 'auto' ? 'bg-emerald-500' : 'bg-violet-500'}`} />
                        {cfg.label}
                      </span>
                    );
                  })()}
                </div>
                {/* First-Response SLA (per number) — edit it on the Escalations page */}
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400 font-medium">First-Response SLA</span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
                    title="Target time to first reply. Edit it via this session's Edit dialog, or on the Escalations page → First-Response SLA per Number.">
                    <Clock className="h-3 w-3" />
                    {session.slaMinutes ?? 30} min
                  </span>
                </div>
                {/* Webhook URL */}
                <div className="flex justify-between items-center py-1">
                  <span className="text-gray-400 font-medium text-xs">Webhook</span>
                  <button
                    onClick={() => handleCopyWebhook(session)}
                    className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 font-medium transition-colors"
                    title={getWebhookUrl(session)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy URL (sid={session.id})
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                {!isCRR && (
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 text-sm font-medium text-gray-600
                      border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 active:scale-95
                      transition-all duration-150"
                    onClick={() => handleEditSession(session)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                <button
                  className="h-9 w-9 flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600
                    hover:bg-emerald-100 active:scale-95 transition-all duration-150"
                  title="Send test message"
                  onClick={() => { setTestSession(session); setTestPhone(''); setTestMsg('Hello! This is a test message from Tejoo Fashion dashboard.'); }}
                >
                  <Send className="h-4 w-4" />
                </button>
                {!isCRR && (
                  <button
                    className="h-9 w-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500
                      hover:bg-red-100 active:scale-95 transition-all duration-150"
                    onClick={() => handleDeleteClick(session)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions found</h3>
            <p className="text-gray-600">Get started by tapping the <strong>+</strong> button below</p>
          </CardContent>
        </Card>
      )}

      {/* Test Message Modal */}
      {testSession && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[150] flex items-center justify-center p-4" onClick={() => setTestSession(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Send Test Message</h2>
                <p className="text-xs text-gray-400 mt-0.5">via {testSession.phoneNumber}</p>
              </div>
              <button onClick={() => setTestSession(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Recipient Phone *</label>
                <input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Message</label>
                <textarea value={testMsg} onChange={e => setTestMsg(e.target.value)} rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={handleTestMessage} disabled={testSending}
                className="flex-1 flex items-center justify-center gap-2 text-sm py-2 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 transition-colors disabled:opacity-60">
                <Send className="h-4 w-4" />
                {testSending ? 'Sending…' : 'Send Test'}
              </button>
              <button onClick={() => setTestSession(null)}
                className="px-4 text-sm py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Session Modal */}
      <SessionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleSubmitSession}
        session={selectedSession}
        users={users}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Session"
        message={`Are you sure you want to delete the session "${sessionToDelete?.phoneNumber}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Floating Action Button — hidden for CRR (view-only) */}
      {!isCRR && <FAB onClick={handleAddSession} label="Add Session" />}
    </div>
  );
}
