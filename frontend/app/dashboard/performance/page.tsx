'use client';

import { useEffect, useRef, useState } from 'react';
import { dashboardApi } from '@/services/api';
import {
  Activity,
  Users,
  MessageSquare,
  Clock,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Award,
  Target,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  CalendarDays,
  Search,
  Download,
} from 'lucide-react';
import { KPICard } from '@/components/ui/kpi-card';

interface AgentPerformance {
  id: number;
  name: string;
  role: string;
  conversationsHandled: number;
  escalationsReceived: number;
  escalationsResolved: number;
  avgResponseTime: number;
  resolutionRate: number;
  activeConversations: number;
  closedInPeriod: number;
  hasActivity: boolean;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[48, 32, 24, 24, 28, 40, 36, 56, 40].map((w, i) => (
        <td key={i} className="py-3.5 px-4">
          <div className="skeleton h-4 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="p-4 rounded-2xl border border-gray-100 space-y-3">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <div className="skeleton h-4 rounded w-3/4" />
              <div className="skeleton h-3 rounded w-1/2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

export default function PerformancePage() {
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [search, setSearch] = useState('');
  const periodRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadPerformanceData(); }, [selectedPeriod]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setShowPeriodMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadPerformanceData = async () => {
    setLoading(true);
    try {
      const period = selectedPeriod as 'today' | 'week' | 'month';
      const [res, sumRes] = await Promise.all([
        dashboardApi.getPerformance(period),
        dashboardApi.getPerformanceSummary(period).catch(() => ({ data: null })),
      ]);
      setSummary(sumRes.data);
      const raw: any[] = res.data ?? [];
      setAgents(raw.map((a) => ({
        id:                   a.userId,
        name:                 a.userName,
        role:                 a.role,
        conversationsHandled: a.conversationsHandled,
        escalationsReceived:  a.escalationsReceived,
        escalationsResolved:  a.escalationsResolved,
        avgResponseTime:      a.avgResponseTimeMinutes != null ? Math.round(a.avgResponseTimeMinutes * 10) / 10 : 0,
        resolutionRate:       a.escalationsReceived > 0 ? (a.escalationsResolved / a.escalationsReceived) * 100 : 100,
        activeConversations:  a.activeConversations,
        closedInPeriod:       a.closedInPeriod,
        // An agent with no handled conversations and no escalations has no basis for a rate —
        // don't flatter them with a fake 100%/"Excellent".
        hasActivity:          (a.conversationsHandled ?? 0) > 0 || (a.escalationsReceived ?? 0) > 0,
      })));
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  const totalConversations = agents.reduce((sum, a) => sum + a.conversationsHandled, 0);
  const totalEscalations   = agents.reduce((sum, a) => sum + a.escalationsReceived, 0);
  const totalResolved      = agents.reduce((sum, a) => sum + a.escalationsResolved, 0);
  const avgTeamResponseTime = agents.length > 0
    ? (agents.reduce((sum, a) => sum + a.avgResponseTime, 0) / agents.length).toFixed(1) : 0;
  const teamResolutionRate = totalEscalations > 0
    ? ((totalResolved / totalEscalations) * 100).toFixed(1) : 100;

  // Real trend badges computed from the backend's current-vs-previous-window summary.
  const periodLabel = (PERIODS.find(p => p.key === selectedPeriod)?.label ?? 'Today').toLowerCase();
  const agentsTrend = { value: `${summary?.agentsActiveCurrent ?? 0} active ${periodLabel}`, isPositive: true, icon: CheckCircle };
  const convTrend = (() => {
    if (!summary || (summary.conversationsHandledPrevious ?? 0) <= 0)
      return { value: 'no prior data', isPositive: true, icon: ArrowUp };
    const d = ((summary.conversationsHandledCurrent - summary.conversationsHandledPrevious) / summary.conversationsHandledPrevious) * 100;
    return { value: `${d >= 0 ? '+' : ''}${d.toFixed(0)}% vs prev ${periodLabel}`, isPositive: d >= 0, icon: d >= 0 ? ArrowUp : ArrowDown };
  })();
  const respTrend = (() => {
    const cur = summary?.avgResponseMinutesCurrent, prev = summary?.avgResponseMinutesPrevious;
    if (cur == null || prev == null || prev <= 0)
      return { value: 'no prior data', isPositive: true, icon: ArrowDown };
    const d = ((cur - prev) / prev) * 100;
    const faster = d <= 0;
    return { value: `${Math.abs(d).toFixed(0)}% ${faster ? 'faster' : 'slower'}`, isPositive: faster, icon: faster ? ArrowDown : ArrowUp };
  })();

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'CRR':     return 'bg-green-50 text-green-700 border-green-200';
      case 'Manager': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'HOD':     return 'bg-purple-50 text-purple-700 border-purple-200';
      default:        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getPerformanceLevel = (agent: AgentPerformance) => {
    if (!agent.hasActivity)          return { label: 'No activity', color: 'text-gray-400', bg: 'bg-gray-100',  bar: 'bg-gray-200' };
    const resolutionRate = agent.resolutionRate;
    if (resolutionRate >= 90) return { label: 'Excellent', color: 'text-green-700', bg: 'bg-green-50',  bar: 'bg-green-500' };
    if (resolutionRate >= 70) return { label: 'Good',      color: 'text-blue-700',  bg: 'bg-blue-50',   bar: 'bg-blue-500' };
    if (resolutionRate >= 50) return { label: 'Average',   color: 'text-amber-700', bg: 'bg-amber-50',  bar: 'bg-amber-500' };
    return                           { label: 'Needs Work', color: 'text-red-700',  bg: 'bg-red-50',    bar: 'bg-red-500' };
  };

  const rankStyle = [
    { ring: 'ring-2 ring-amber-300',  label: '🥇' },
    { ring: 'ring-2 ring-gray-300',   label: '🥈' },
    { ring: 'ring-2 ring-orange-300', label: '🥉' },
    { ring: 'ring-1 ring-gray-200',   label: '4️⃣' },
    { ring: 'ring-1 ring-gray-200',   label: '5️⃣' },
  ];

  const sortedAgents = [...agents].sort((a, b) =>
    (b.hasActivity ? b.resolutionRate : -1) - (a.hasActivity ? a.resolutionRate : -1));
  const filteredAgents = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleExport = () => {
    const rows = [
      ['Agent', 'Role', 'Active', 'Handled', 'Closed', 'Escalations Received', 'Escalations Resolved', 'Avg Response (min)', 'Resolution Rate'],
      ...filteredAgents.map(a => [
        a.name, a.role, a.activeConversations, a.conversationsHandled,
        a.closedInPeriod, a.escalationsReceived, a.escalationsResolved,
        a.avgResponseTime, a.hasActivity ? `${a.resolutionRate.toFixed(0)}%` : 'N/A',
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-${selectedPeriod}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-white min-h-screen">

      {/* 1. KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6 lg:mb-8 items-stretch">
        <KPICard index={0} title="Total Agents" value={agents.length}
          icon={Users} iconColor="text-indigo-600" iconBgColor="bg-indigo-100"
          trend={agentsTrend} />
        <KPICard index={1} title="Conversations Handled" value={totalConversations}
          icon={MessageSquare} iconColor="text-blue-600" iconBgColor="bg-blue-100"
          trend={convTrend} />
        <KPICard index={2} title="Escalations Resolved" value={totalResolved}
          icon={CheckCircle} iconColor="text-green-600" iconBgColor="bg-green-100"
          trend={{ value: `${teamResolutionRate}% rate`, isPositive: Number(teamResolutionRate) >= 70, icon: Target }} />
        <KPICard index={3} title="Avg Response Time" value={`${avgTeamResponseTime} min`}
          icon={Clock} iconColor="text-amber-600" iconBgColor="bg-amber-100"
          trend={respTrend} />
        <div className="col-span-2 lg:col-span-1">
          <KPICard index={4} title="Resolution Rate" value={`${teamResolutionRate}%`}
            icon={Target} iconColor="text-purple-600" iconBgColor="bg-purple-100"
            trend={{
              value: Number(teamResolutionRate) >= 70 ? "On target" : "Below target",
              isPositive: Number(teamResolutionRate) >= 70,
              icon: Number(teamResolutionRate) >= 70 ? TrendingUp : TrendingDown,
            }} />
        </div>
      </div>

      {/* 2. Top Performers */}
      <div className="mb-6 lg:mb-8 bg-white rounded-2xl border border-gray-100 shadow-sm animate-fade-up delay-225">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
          <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center">
            <Award className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-800">Top Performers</h2>
        </div>
        <div className="p-5">
          {loading ? <LeaderboardSkeleton /> : (
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              {sortedAgents.slice(0, 5).map((agent, index) => {
                const rs = rankStyle[index];
                const initials = (agent.name || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                return (
                  <div key={agent.id}
                    className="group p-4 rounded-2xl border border-gray-100 bg-white
                      hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out cursor-default animate-fade-up"
                    style={{ animationDelay: `${index * 75}ms` }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center
                        font-bold text-sm bg-slate-700 text-white ${rs.ring} group-hover:scale-105 transition-transform duration-200`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{agent.name}</p>
                        <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded border ${getRoleBadgeColor(agent.role)} mt-0.5`}>
                          {agent.role}
                        </span>
                      </div>
                      <span className="ml-auto text-lg">{rs.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Resolution</p>
                        <p className="font-bold text-green-600">{agent.hasActivity ? `${agent.resolutionRate.toFixed(0)}%` : '—'}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Avg Time</p>
                        <p className="font-bold text-blue-600">{agent.avgResponseTime}m</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Individual Performance — toolbar + table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm animate-fade-up delay-300">

        {/* Toolbar: title left, search + filter + export right */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-wrap">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <Activity className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-800">Individual Performance</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search agent..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700
                  placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 w-44"
              />
            </div>

            {/* Period filter */}
            <div className="relative" ref={periodRef}>
              <button
                onClick={() => setShowPeriodMenu(v => !v)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700
                  hover:border-gray-300 hover:bg-gray-50 active:scale-95 transition-all duration-150 shadow-sm"
              >
                <CalendarDays className="h-3.5 w-3.5 text-indigo-600" />
                {PERIODS.find(p => p.key === selectedPeriod)?.label}
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${showPeriodMenu ? 'rotate-180' : ''}`} />
              </button>
              {showPeriodMenu && (
                <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1 animate-fade-in">
                  {PERIODS.map(({ key, label }) => (
                    <button key={key} onClick={() => { setSelectedPeriod(key); setShowPeriodMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors duration-100 ${
                        selectedPeriod === key ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Export */}
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white
                text-gray-600 hover:bg-gray-50 hover:border-gray-300 active:scale-95 transition-all duration-150 shadow-sm">
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-0">
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Agent','Role','Active','Handled','Closed','Escalations','Avg Response','Resolution Rate','Status'].map((h) => (
                      <th key={h} className="py-3 px-4 text-left">
                        <div className="skeleton h-3 rounded w-16" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</tbody>
              </table>
            </div>
            <div className="lg:hidden divide-y divide-gray-50 p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="pt-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="skeleton h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-4 rounded w-1/2" />
                      <div className="skeleton h-3 rounded w-1/4" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[0,1,2].map((j) => <div key={j} className="skeleton h-12 rounded-xl" />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Users className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">No agent data available</p>
            <p className="text-xs text-gray-400 mt-1">Performance data will appear once agents handle conversations.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Agent','Role','Active','Handled','Closed','Escalations','Avg Response','Resolution Rate','Status'].map((h) => (
                      <th key={h} className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredAgents.map((agent) => {
                    const perf = getPerformanceLevel(agent);
                    const initials = (agent.name || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                    return (
                      <tr key={agent.id} className="group hover:bg-gray-50 hover:shadow-[inset_3px_0_0_#cbd5e1] transition-all duration-150">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-slate-700 text-white flex items-center justify-center
                              font-semibold text-xs group-hover:scale-105 transition-transform duration-200">{initials}</div>
                            <span className="font-medium text-gray-900 text-sm">{agent.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${getRoleBadgeColor(agent.role)}`}>
                            {agent.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-semibold text-blue-600 text-sm">{agent.activeConversations}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-semibold text-sm text-gray-800">{agent.conversationsHandled}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-semibold text-green-600 text-sm">{agent.closedInPeriod}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-sm text-gray-600">
                            <span className="text-orange-600 font-medium">{agent.escalationsReceived}</span>
                            <span className="text-gray-300 mx-1">/</span>
                            <span className="text-green-600 font-medium">{agent.escalationsResolved}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                            <span className="font-medium text-sm text-gray-700">{agent.avgResponseTime}m</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-700 ease-out ${perf.bar}`}
                                style={{ width: `${agent.hasActivity ? agent.resolutionRate : 0}%` }} />
                            </div>
                            <span className="font-semibold text-sm text-gray-800 w-8 text-right">{agent.hasActivity ? `${agent.resolutionRate.toFixed(0)}%` : '—'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${perf.bg} ${perf.color}`}>
                            {perf.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-gray-50">
              {filteredAgents.map((agent, idx) => {
                const perf = getPerformanceLevel(agent);
                const initials = (agent.name || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                const delays = ['delay-75','delay-150','delay-225','delay-300','delay-375'];
                return (
                  <div key={agent.id} className={`p-4 animate-fade-up ${delays[idx % delays.length]}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-700 text-white flex items-center justify-center font-semibold text-xs">
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{agent.name}</p>
                          <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded border mt-0.5 ${getRoleBadgeColor(agent.role)}`}>
                            {agent.role}
                          </span>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${perf.bg} ${perf.color}`}>{perf.label}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Active</p>
                        <p className="font-semibold text-blue-600">{agent.activeConversations}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Handled</p>
                        <p className="font-semibold text-gray-800">{agent.conversationsHandled}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Closed</p>
                        <p className="font-semibold text-green-600">{agent.closedInPeriod}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        <span className="font-medium">{agent.avgResponseTime}m avg</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${perf.bar}`} style={{ width: `${agent.hasActivity ? agent.resolutionRate : 0}%` }} />
                        </div>
                        <span className="font-semibold text-sm text-gray-800">{agent.hasActivity ? `${agent.resolutionRate.toFixed(0)}%` : '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
