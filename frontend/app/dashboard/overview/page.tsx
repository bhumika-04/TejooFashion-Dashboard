'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardApi, conversationsApi } from '@/services/api';
import { MessageSquare, Phone, AlertTriangle, Users, Zap, Timer, ChevronRight } from 'lucide-react';
import { AreaChart, Area, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { KPICard } from '@/components/ui/kpi-card';
import { rangeToDates, DASHBOARD_RANGE_EVENT, DashboardRangeDetail } from '@/lib/dateRange';

const REFRESH_INTERVAL = 30_000; // 30 seconds

export default function DashboardPage() {
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const isCRR = (currentUser.role ?? currentUser.Role ?? '').toUpperCase() === 'CRR';
  const currentUserId: number | undefined = currentUser.id ?? currentUser.Id;

  const [stats, setStats] = useState<any>(null);
  const [sessionActivity, setSessionActivity] = useState<any[]>([]);
  const [slaBreaches, setSlaBreaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Page-wide date range — chosen from the filter in the shared header, delivered via window event.
  const rangeRef = useRef<{ from: string; to: string }>(rangeToDates('Today'));
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadStats = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { from, to } = rangeRef.current;
      const [statsRes, activityRes] = await Promise.all([
        dashboardApi.getStats(from, to),
        dashboardApi.getSessionActivity().catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setSessionActivity(Array.isArray(activityRes.data) ? activityRes.data : []);
      // CRR: their own open chats overdue for a reply past the session SLA.
      if (isCRR) {
        const r = await conversationsApi.getSlaBreaches(currentUserId).catch(() => ({ data: [] }));
        setSlaBreaches(Array.isArray(r.data) ? r.data : []);
      }
    } catch {
      // silently ignore
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    intervalRef.current = setInterval(() => loadStats(true), REFRESH_INTERVAL);
    // React to the header filter: update the range and reload the whole page's data.
    const onRange = (e: Event) => {
      const d = (e as CustomEvent<DashboardRangeDetail>).detail;
      if (!d) return;
      rangeRef.current = { from: d.from, to: d.to };
      loadStats(true);
    };
    window.addEventListener(DASHBOARD_RANGE_EVENT, onRange);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener(DASHBOARD_RANGE_EVENT, onRange);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div>
          <div className="text-lg font-medium text-gray-600">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  // Chart data
  const conversationData = [
    { name: 'Open', value: stats?.openConversations || 0, color: '#3b82f6' },
    { name: 'Escalated', value: stats?.escalatedConversations || 0, color: '#f59e0b' },
    { name: 'Closed', value: stats?.closedConversations || 0, color: '#10b981' },
  ];

  const messageData = [
    { name: 'Inbound', value: stats?.todayInbound || 0, color: '#8b5cf6' },
    { name: 'Outbound', value: stats?.todayOutbound || 0, color: '#06b6d4' },
    { name: 'AI Replies', value: stats?.todayAiReplies || 0, color: '#10b981' },
  ];

  const aiPerformanceData = [
    { name: 'AI Handled', value: stats?.todayAiReplies || 0 },
    { name: 'Human Handled', value: (stats?.todayMessages || 0) - (stats?.todayAiReplies || 0) },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-beige min-h-screen">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6 lg:mb-8 items-stretch">
        <KPICard index={0}
          title="Total Conversations"
          value={stats?.totalConversations || 0}
          icon={MessageSquare}
          theme="blue"
          subtitleText={`${stats?.openConversations || 0} open · ${stats?.closedConversations || 0} closed`}
        />
        <KPICard index={1}
          title="Active Sessions"
          value={stats?.activeSessions || 0}
          icon={Phone}
          theme="emerald"
          subtitleText="Connected & online"
        />
        <KPICard index={2}
          title="Pending Escalations"
          value={stats?.pendingEscalations || 0}
          icon={AlertTriangle}
          theme="amber"
          subtitleText="Needs human review"
        />
        <KPICard index={3}
          title="AI Handling Rate"
          value={`${stats?.aiHandlingRate?.toFixed(1) || 0}%`}
          icon={Zap}
          theme="green"
          subtitleText="AI-sent share of replies"
        />
        <KPICard index={4}
          title="Active Users"
          value={stats?.activeUsers || 0}
          icon={Users}
          theme="purple"
          subtitleText="Agents online"
          // Fill the trailing gap: full row on 2-col mobile, spans the last 2 of 3 on md, single on xl(5-col)
          className="col-span-2 xl:col-span-1"
        />
      </div>

      {/* CRR: my open chats overdue for a reply past the session SLA */}
      {isCRR && slaBreaches.length > 0 && (
        <Card className="border-rose-100 mb-6 lg:mb-8">
          <CardHeader className="border-b border-rose-100">
            <CardTitle className="flex items-center gap-2 text-gray-800 text-base font-semibold">
              <div className="h-8 w-8 rounded-full bg-rose-50 flex items-center justify-center">
                <Timer className="h-4 w-4 text-rose-600" />
              </div>
              Overdue Replies
              <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">{slaBreaches.length}</span>
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">Open chats you haven&apos;t replied to within the SLA — please respond.</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {slaBreaches.map((c: any) => {
                const m = c.minutesWaiting ?? 0;
                const wait = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
                return (
                  <Link key={c.id} href={`/dashboard/conversations?id=${c.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-rose-50/40 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="h-4 w-4 text-rose-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.customerName || c.customerPhone}</p>
                      <p className="text-xs text-gray-400 truncate">{c.customerName ? c.customerPhone : (c.sessionPhoneNumber ?? '')}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-rose-600">{wait}</p>
                      <p className="text-[11px] text-gray-400">SLA {c.slaMinutes}m</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
        {/* Conversation Distribution Area Chart */}
        <Card className="hover:shadow-md transition-shadow duration-200 border-gray-100">
          <CardHeader className="border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-gray-800 text-base font-semibold">
                <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-blue-600" />
                </div>
                Conversation Distribution
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={conversationData}>
                <defs>
                  <linearGradient id="colorOpen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorEscalated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorOpen)"
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-4">
              {conversationData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shadow-sm"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-sm font-medium text-gray-700">{item.name}</span>
                  <span className="text-sm font-bold text-gray-900">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Today's Messages Line Chart */}
        <Card className="hover:shadow-md transition-shadow duration-200 border-gray-100">
          <CardHeader className="border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-gray-800 text-base font-semibold">
                <div className="h-8 w-8 rounded-full bg-purple-50 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-purple-600" />
                </div>
                Message Activity
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={messageData} barSize={60}>
                <defs>
                  <linearGradient id="inboundGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.8}/>
                  </linearGradient>
                  <linearGradient id="outboundGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.8}/>
                  </linearGradient>
                  <linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#6b7280"
                  style={{ fontSize: '12px', fontWeight: 500 }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    padding: '12px'
                  }}
                  cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
                />
                <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                  {messageData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.name === 'Inbound' ? 'url(#inboundGradient)' :
                        entry.name === 'Outbound' ? 'url(#outboundGradient)' :
                        'url(#aiGradient)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-4">
              {messageData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shadow-sm"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-sm font-medium text-gray-700">{item.name}</span>
                  <span className="text-sm font-bold text-gray-900">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="border-gray-100 animate-fade-up delay-75">
          <CardHeader className="border-b border-gray-100">
            <CardTitle className="flex items-center gap-2 text-gray-800 text-base font-semibold">
              <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
                <Zap className="h-4 w-4 text-emerald-600" />
              </div>
              AI Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-5">
              {aiPerformanceData.map((item) => {
                const pct = Math.min(100, (item.value / (stats?.todayMessages || 1)) * 100);
                return (
                  <div key={item.name}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-gray-600">{item.name}</span>
                      <span className="font-bold text-gray-900 tabular-nums">{item.value}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-2 rounded-full transition-all duration-700 ease-out ${
                        item.name === 'AI Handled' ? 'bg-emerald-500' : 'bg-blue-500'
                      }`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100 animate-fade-up delay-150">
          <CardHeader className="border-b border-gray-100">
            <CardTitle className="flex items-center gap-2 text-gray-800 text-base font-semibold">
              <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-blue-600" />
              </div>
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-2">
              {[
                { label: 'Open Conversations', value: stats?.openConversations || 0,                         color: 'text-blue-600' },
                { label: 'Escalated',           value: stats?.escalatedConversations || 0,                   color: 'text-amber-600' },
                { label: 'Closed',               value: stats?.closedConversations || 0,                     color: 'text-green-600' },
                { label: 'Avg Response',         value: `${stats?.averageResponseTime?.toFixed(1) || 0} min`, color: 'text-gray-800' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center px-3.5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  <span className="text-sm font-medium text-gray-500">{label}</span>
                  <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100 animate-fade-up delay-225">
          <CardHeader className="border-b border-gray-100">
            <CardTitle className="flex items-center gap-2 text-gray-800 text-base font-semibold">
              <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
                <Phone className="h-4 w-4 text-emerald-600" />
              </div>
              Session Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {sessionActivity.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">No session data</div>
            ) : (
              <div className="space-y-2">
                {sessionActivity.slice(0, 5).map((s: any) => (
                  <div key={s.sessionId ?? s.phoneNumber} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="relative flex-shrink-0">
                      <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Phone className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${s.isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{s.phoneNumber ?? s.sessionName ?? '—'}</p>
                      <p className="text-[11px] text-gray-400">{s.assignedUserName ?? 'Unassigned'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-gray-700">{s.messagesToday ?? s.messageCount ?? 0}</p>
                      <p className="text-[11px] text-gray-400">msgs</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
