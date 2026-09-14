'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dashboardApi, teamsApi, escalationsApi } from '@/services/api';
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
  Search,
  Download,
  FileText,
  FileSpreadsheet,
  Timer,
  AlertTriangle,
  X,
} from 'lucide-react';
import { KPICard } from '@/components/ui/kpi-card';
import { formatNumber } from '@/lib/utils';
import { DASHBOARD_RANGE_EVENT, DashboardRangeDetail, rangeToPerfPeriod } from '@/lib/dateRange';
import { exportExcel, exportPdf, exportDocx } from '@/lib/reportExport';
import type { TableBlock, PieBlock, Kpi } from '@/lib/reportExport';

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
  slaMet: number;
  slaResponded: number;
  slaMetPct: number | null;   // % of responded conversations answered within their number's SLA
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[48, 32, 24, 24, 28, 40, 36, 40, 56, 40].map((w, i) => (
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
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [detailAgent, setDetailAgent] = useState<AgentPerformance | null>(null);
  // First Response & SLA + Team Performance (moved here from Reports)
  const [sla, setSla] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [agentRole, setAgentRole] = useState<'all' | 'CRR' | 'Manager' | 'HOD'>('all');
  const perfDays = selectedPeriod === 'today' ? 1 : selectedPeriod === 'week' ? 7 : 30;

  useEffect(() => { loadPerformanceData(); }, [selectedPeriod]);
  useEffect(() => { loadSlaAndTeams(); }, [selectedPeriod]);

  // First-response SLA + per-team performance for the selected period.
  const loadSlaAndTeams = async () => {
    const days = selectedPeriod === 'today' ? 1 : selectedPeriod === 'week' ? 7 : 30;
    try {
      const [slaRes, teamsRes, agentStatsRes, escRes] = await Promise.all([
        dashboardApi.getResponseSla(days, 30).catch(() => ({ data: null })),
        teamsApi.getAll().catch(() => ({ data: [] })),
        dashboardApi.getAgentStats(days).catch(() => ({ data: [] })),
        escalationsApi.getAll().catch(() => ({ data: [] })),
      ]);
      setSla(slaRes.data ?? null);

      const rawTeams: any[]   = teamsRes.data ?? [];
      const agentStats: any[] = agentStatsRes.data ?? [];
      const escFrom = new Date(); escFrom.setHours(0, 0, 0, 0); escFrom.setDate(escFrom.getDate() - (days - 1));
      const escalations: any[] = ((escRes.data as any[]) ?? []).filter((e: any) => {
        const dt = e.escalatedAt ? new Date(e.escalatedAt) : null;
        return dt ? dt >= escFrom : true;
      });
      const memberResults = await Promise.all(
        rawTeams.map((t: any) => teamsApi.getMembers(t.id)
          .then(r => ({ teamId: t.id, members: r.data as any[] }))
          .catch(() => ({ teamId: t.id, members: [] as any[] })))
      );
      const membersByTeam = new Map<number, any[]>(memberResults.map(({ teamId, members }) => [teamId, members]));
      setTeams(rawTeams.map((team: any) => {
        const members   = membersByTeam.get(team.id) ?? [];
        const memberIds = new Set(members.map((m: any) => m.userId));
        const teamAgents = agentStats.filter((a: any) => memberIds.has(a.userId));
        const escReceived = escalations.filter((e: any) => memberIds.has(e.escalatedToUserId));
        const escResolved = escReceived.filter((e: any) => e.status === 'Resolved');
        return {
          id: team.id, name: team.name, managerName: team.managerName || '—',
          isActive: team.isActive, memberCount: members.length,
          conversationsHandled: teamAgents.reduce((s, a) => s + (a.totalConversations || 0), 0),
          activeConversations:  teamAgents.reduce((s, a) => s + (a.activeConversations  || 0), 0),
          escalationsReceived: escReceived.length,
          escalationsResolved: escResolved.length,
          resolutionRate: escReceived.length > 0 ? (escResolved.length / escReceived.length) * 100 : 100,
          avgResponseTime: teamAgents.length ? Math.round(teamAgents.reduce((s, a) => s + (a.avgResolutionMinutes || 0), 0) / teamAgents.length / 60) : 0,
        };
      }));
    } catch { /* silently ignore */ }
  };

  const q = search.trim().toLowerCase();
  const slaAgents = ((sla?.agents ?? []) as any[]).filter(a =>
    (agentRole === 'all' || a.role === agentRole) && (!q || (a.userName ?? '').toLowerCase().includes(q)));
  const filteredTeams = teams.filter(t => !q || t.name.toLowerCase().includes(q) || (t.managerName ?? '').toLowerCase().includes(q));
  const teamTotalEsc = teams.reduce((s, t) => s + t.escalationsReceived, 0);
  const teamTotalResolved = teams.reduce((s, t) => s + t.escalationsResolved, 0);
  const tpResolutionRate = teamTotalEsc > 0 ? ((teamTotalResolved / teamTotalEsc) * 100).toFixed(0) : '100';
  const resColor = (r: number) => r >= 80 ? 'text-green-600' : r >= 50 ? 'text-amber-600' : 'text-rose-600';
  const resBar = (r: number) => r >= 80 ? 'bg-green-500' : r >= 50 ? 'bg-amber-500' : 'bg-rose-500';

  // Header date filter → set the performance period (today | week | month).
  useEffect(() => {
    const onRange = (e: Event) => {
      const d = (e as CustomEvent<DashboardRangeDetail>).detail;
      if (d) setSelectedPeriod(rangeToPerfPeriod(d.range));
    };
    window.addEventListener(DASHBOARD_RANGE_EVENT, onRange);
    return () => window.removeEventListener(DASHBOARD_RANGE_EVENT, onRange);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
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
        resolutionRate:       a.escalationsReceived > 0 ? (a.escalationsResolved / a.escalationsReceived) * 100 : 0,
        activeConversations:  a.activeConversations,
        closedInPeriod:       a.closedInPeriod,
        // An agent with no handled conversations and no escalations has no basis for a rate —
        // don't flatter them with a fake 100%/"Excellent".
        hasActivity:          (a.conversationsHandled ?? 0) > 0 || (a.escalationsReceived ?? 0) > 0,
        slaMet:               a.slaMet ?? 0,
        slaResponded:         a.slaResponded ?? 0,
        // Null when the agent answered nothing — no basis for an SLA %.
        slaMetPct:            (a.slaResponded ?? 0) > 0 ? ((a.slaMet ?? 0) / a.slaResponded) * 100 : null,
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
  const hasTeamEsc = totalEscalations > 0;
  const teamResolutionRate = hasTeamEsc ? ((totalResolved / totalEscalations) * 100).toFixed(1) : null;
  const teamRateOnTarget = hasTeamEsc && Number(teamResolutionRate) >= 70;

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

  // Bar colour for a resolution / SLA percentage.
  const pctBar = (r: number) => r >= 90 ? 'bg-green-500' : r >= 70 ? 'bg-blue-500' : r >= 50 ? 'bg-amber-500' : 'bg-red-500';

  const getPerformanceLevel = (agent: AgentPerformance) => {
    if (!agent.hasActivity) return { label: 'No activity', color: 'text-gray-400', bg: 'bg-gray-100', bar: 'bg-gray-200' };
    // Rate by first-response SLA — the real quality signal. Fall back to escalation
    // resolution only when the agent actually received escalations; with neither there is
    // no basis to call them "Excellent", so show a neutral "Active".
    const score = agent.slaMetPct != null ? agent.slaMetPct
                : (agent.escalationsReceived > 0 ? agent.resolutionRate : null);
    if (score == null)  return { label: 'Active',     color: 'text-emerald-700', bg: 'bg-emerald-50', bar: 'bg-emerald-300' };
    if (score >= 90)    return { label: 'Excellent',  color: 'text-green-700',  bg: 'bg-green-50',  bar: 'bg-green-500' };
    if (score >= 70)    return { label: 'Good',       color: 'text-blue-700',   bg: 'bg-blue-50',   bar: 'bg-blue-500' };
    if (score >= 50)    return { label: 'Average',    color: 'text-amber-700',  bg: 'bg-amber-50',  bar: 'bg-amber-500' };
    return                     { label: 'Needs Work', color: 'text-red-700',    bg: 'bg-red-50',    bar: 'bg-red-500' };
  };

  const rankStyle = [
    { ring: 'ring-2 ring-amber-300',  label: '🥇' },
    { ring: 'ring-2 ring-gray-300',   label: '🥈' },
    { ring: 'ring-2 ring-orange-300', label: '🥉' },
    { ring: 'ring-1 ring-gray-200',   label: '4️⃣' },
    { ring: 'ring-1 ring-gray-200',   label: '5️⃣' },
  ];

  const agentScore = (x: AgentPerformance) => !x.hasActivity ? -1
    : (x.slaMetPct != null ? x.slaMetPct : (x.escalationsReceived > 0 ? x.resolutionRate : 0));
  const sortedAgents = [...agents].sort((a, b) => agentScore(b) - agentScore(a));
  const filteredAgents = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleExport = () => {
    const rows = [
      ['Agent', 'Role', 'Active', 'Handled', 'Closed', 'Escalations Received', 'Escalations Resolved', 'Avg Response (min)', 'SLA Met %', 'Resolution Rate'],
      ...filteredAgents.map(a => [
        a.name, a.role, a.activeConversations, a.conversationsHandled,
        a.closedInPeriod, a.escalationsReceived, a.escalationsResolved,
        a.avgResponseTime, a.slaMetPct == null ? 'N/A' : `${a.slaMetPct.toFixed(0)}%`,
        a.escalationsReceived > 0 ? `${a.resolutionRate.toFixed(0)}%` : 'N/A',
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

  // ── Master export (CSV / Excel / PDF / Word with charts) ──
  const periodLabelText = PERIODS.find(p => p.key === selectedPeriod)?.label ?? 'Today';

  const perfKpis = (): Kpi[] => [
    { label: 'Total Agents',          value: String(agents.length) },
    { label: 'Conversations Handled', value: String(totalConversations) },
    { label: 'Escalations Resolved',  value: String(totalResolved) },
    { label: 'Avg Response Time',     value: `${avgTeamResponseTime} min` },
    { label: 'Resolution Rate',       value: hasTeamEsc ? `${teamResolutionRate}%` : '—' },
  ];

  const perfPies = (): PieBlock[] => {
    const pies: PieBlock[] = [];
    if (totalEscalations > 0) pies.push({
      title: 'Escalations — Resolved vs Pending',
      slices: [
        { label: 'Resolved', value: totalResolved, color: '#10b981' },
        { label: 'Pending',  value: Math.max(0, totalEscalations - totalResolved), color: '#f59e0b' },
      ],
    });
    const slaMet  = agents.reduce((s, a) => s + (a.slaMet || 0), 0);
    const slaResp = agents.reduce((s, a) => s + (a.slaResponded || 0), 0);
    if (slaResp > 0) pies.push({
      title: 'First-Response SLA',
      slices: [
        { label: 'Met SLA',      value: slaMet, color: '#34d399' },
        { label: 'Breached SLA', value: Math.max(0, slaResp - slaMet), color: '#f43f5e' },
      ],
    });
    return pies;
  };

  const perfTable = (): TableBlock => ({
    title: 'Agent Performance',
    headers: ['Agent', 'Role', 'Active', 'Handled', 'Closed', 'Esc Recv', 'Esc Resolved', 'Avg Response (m)', 'SLA Met %', 'Resolution %'],
    rows: filteredAgents.map(a => [
      a.name, a.role, a.activeConversations, a.conversationsHandled, a.closedInPeriod,
      a.escalationsReceived, a.escalationsResolved, a.avgResponseTime,
      a.slaMetPct == null ? '—' : `${a.slaMetPct.toFixed(0)}%`,
      a.escalationsReceived > 0 ? `${a.resolutionRate.toFixed(0)}%` : '—',
    ]),
  });

  const runExport = async (kind: 'csv' | 'excel' | 'pdf' | 'docx') => {
    setExportOpen(false);
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `tejoo-performance-${selectedPeriod}-${stamp}`;
    if (kind === 'csv')   { handleExport(); return; }
    if (kind === 'excel') { await exportExcel(`${base}.xlsx`, [perfTable()]); return; }
    const payload = {
      title: 'Tejoo Fashion — Team Performance',
      subtitle: `${periodLabelText} · generated ${new Date().toLocaleDateString('en-IN')}`,
      kpis: perfKpis(), pies: perfPies(), tables: [perfTable()],
    };
    if (kind === 'pdf') await exportPdf(`${base}.pdf`, payload);
    else                await exportDocx(`${base}.docx`, payload);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-beige min-h-screen">

      {/* Export — right-aligned above the KPIs (period is controlled by the header date filter) */}
      <div className="flex justify-end mb-4">
          <div className="relative" ref={exportRef}>
            <button onClick={() => setExportOpen(v => !v)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 active:scale-95 transition-all shadow-sm">
              <Download className="h-3.5 w-3.5" />
              Export
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${exportOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-30 py-1 animate-fade-in">
                <p className="px-3.5 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Export report</p>
                {([
                  { k: 'pdf',   label: 'PDF report',     icon: FileText,        hint: 'charts' },
                  { k: 'docx',  label: 'Word report',    icon: FileText,        hint: 'charts' },
                  { k: 'excel', label: 'Excel workbook', icon: FileSpreadsheet, hint: 'table' },
                  { k: 'csv',   label: 'CSV',            icon: Download,        hint: '' },
                ] as const).map(({ k, label, icon: Icon, hint }) => (
                  <button key={k} onClick={() => runExport(k)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                    <Icon className="h-4 w-4 text-gray-400" />
                    <span className="flex-1 text-left">{label}</span>
                    {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
      </div>

      {/* 1. KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6 lg:mb-8 items-stretch">
        <KPICard index={0} title="Total Agents" value={agents.length}
          icon={Users} iconColor="text-emerald-600" iconBgColor="bg-emerald-100"
          trend={agentsTrend} />
        <KPICard index={1} title="Conversations Handled" value={totalConversations}
          icon={MessageSquare} iconColor="text-blue-600" iconBgColor="bg-blue-100"
          trend={convTrend} />
        <KPICard index={2} title="Escalations Resolved" value={totalResolved}
          icon={CheckCircle} iconColor="text-green-600" iconBgColor="bg-green-100"
          trend={{ value: hasTeamEsc ? `${teamResolutionRate}% rate` : 'no escalations', isPositive: hasTeamEsc ? teamRateOnTarget : true, icon: Target }} />
        <KPICard index={3} title="Avg Response Time" value={`${avgTeamResponseTime} min`}
          icon={Clock} iconColor="text-amber-600" iconBgColor="bg-amber-100"
          trend={respTrend} />
        <div className="col-span-2 lg:col-span-1">
          <KPICard index={4} title="Resolution Rate" value={hasTeamEsc ? `${teamResolutionRate}%` : '—'}
            icon={Target} iconColor="text-purple-600" iconBgColor="bg-purple-100"
            trend={{
              value: hasTeamEsc ? (teamRateOnTarget ? "On target" : "Below target") : "no escalations yet",
              isPositive: hasTeamEsc ? teamRateOnTarget : true,
              icon: teamRateOnTarget ? TrendingUp : TrendingDown,
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
                        font-bold text-sm bg-slate-200 text-slate-700 ${rs.ring} group-hover:scale-105 transition-transform duration-200`}>
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
                        <p className="text-gray-400 text-xs mb-0.5">SLA Met</p>
                        <p className="font-bold text-green-600">{agent.slaMetPct != null ? `${agent.slaMetPct.toFixed(0)}%` : '—'}</p>
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
            <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Activity className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-800">Individual Performance</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Search — period + export now live in the page header (global) */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search agent..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700
                  placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 w-44"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-0">
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Agent','Role','Active','Handled','Closed','Escalations','Avg Response','SLA Met','Resolution Rate','Status'].map((h) => (
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
                    {['Agent','Role','Active','Handled','Closed','Escalations','Avg Response','SLA Met','Resolution Rate','Status'].map((h) => (
                      <th key={h} className="py-3 px-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredAgents.map((agent) => {
                    const perf = getPerformanceLevel(agent);
                    const initials = (agent.name || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                    return (
                      <tr key={agent.id} onClick={() => setDetailAgent(agent)}
                        title="View SLA & performance detail"
                        className="group cursor-pointer hover:bg-emerald-50/40 hover:shadow-[inset_3px_0_0_#34d399] transition-all duration-150">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center
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
                        <td className="py-3.5 px-4 text-center">
                          {agent.slaMetPct == null ? (
                            <span className="text-sm text-gray-300">—</span>
                          ) : (
                            <span className={`text-sm font-semibold ${
                              agent.slaMetPct >= 90 ? 'text-green-600'
                              : agent.slaMetPct >= 70 ? 'text-blue-600' : 'text-red-600'}`}
                              title={`${agent.slaMet}/${agent.slaResponded} answered within SLA`}>
                              {agent.slaMetPct.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-700 ease-out ${pctBar(agent.resolutionRate)}`}
                                style={{ width: `${agent.escalationsReceived > 0 ? agent.resolutionRate : 0}%` }} />
                            </div>
                            <span className="font-semibold text-sm text-gray-800 w-8 text-right">{agent.escalationsReceived > 0 ? `${agent.resolutionRate.toFixed(0)}%` : '—'}</span>
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
                  <div key={agent.id} onClick={() => setDetailAgent(agent)}
                    className={`p-4 cursor-pointer hover:bg-emerald-50/40 transition-colors animate-fade-up ${delays[idx % delays.length]}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-semibold text-xs">
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
                        {agent.slaMetPct != null && (
                          <span className={`text-xs font-medium ${
                            agent.slaMetPct >= 90 ? 'text-green-600'
                            : agent.slaMetPct >= 70 ? 'text-blue-600' : 'text-red-600'}`}>
                            · SLA {agent.slaMetPct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pctBar(agent.resolutionRate)}`} style={{ width: `${agent.escalationsReceived > 0 ? agent.resolutionRate : 0}%` }} />
                        </div>
                        <span className="font-semibold text-sm text-gray-800">{agent.escalationsReceived > 0 ? `${agent.resolutionRate.toFixed(0)}%` : '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── First Response & SLA (moved from Reports) ── */}
      <div className="flex items-center gap-2 mt-8 mb-4">
        <div className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center"><Timer className="h-4 w-4 text-rose-600" /></div>
        <h2 className="text-base font-bold text-gray-900">First Response &amp; SLA</h2>
      </div>
      {(() => {
        const o = sla?.overall;
        const responded = o?.responded ?? 0;
        const metPct = responded > 0 ? (o.metSla / responded) * 100 : 0;
        const avgFrt = o?.avgFirstResponseMinutes;
        return (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <KPICard index={0} title="Avg First Response" value={avgFrt != null ? `${avgFrt.toFixed(1)}m` : '—'} icon={Timer} theme="blue" subtitleText={`${formatNumber(responded)} replied of ${formatNumber(o?.totalConversations ?? 0)}`} />
              <KPICard index={1} title={`Within SLA (${sla?.slaMinutes ?? 30}m)`} value={`${metPct.toFixed(0)}%`} icon={Target} theme="green" subtitleText={`${formatNumber(o?.metSla ?? 0)} on time`} />
              <KPICard index={2} title="Breached SLA" value={formatNumber(o?.breachedSla ?? 0)} icon={AlertTriangle} theme="rose" subtitleText="Replied late" />
              <KPICard index={3} title="No Recorded Reply" value={formatNumber(o?.unanswered ?? 0)} icon={MessageSquare} theme="amber" subtitleText="Often answered on Interakt app" />
            </div>
            {sla?.agents?.length > 0 && (
              <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b border-gray-50 flex-wrap">
                  <span className="text-xs font-semibold text-gray-500">Per-agent first response</span>
                  <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                    {(['all','CRR','Manager','HOD'] as const).map(r => (
                      <button key={r} onClick={() => setAgentRole(r)} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${agentRole===r?'bg-white text-emerald-700 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>{r==='all'?'All':r}</button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-50">
                        <th className="px-5 py-2.5 font-medium">Agent</th>
                        <th className="px-3 py-2.5 font-medium">Assigned</th>
                        <th className="px-3 py-2.5 font-medium">Avg 1st Reply</th>
                        <th className="px-3 py-2.5 font-medium">On Time</th>
                        <th className="px-3 py-2.5 font-medium">Breached</th>
                        <th className="px-3 py-2.5 font-medium">SLA Target</th>
                        <th className="px-5 py-2.5 font-medium">SLA %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {slaAgents.map((a: any) => {
                        const repl = (a.metSla ?? 0) + (a.breachedSla ?? 0);
                        const pct = repl > 0 ? (a.metSla / repl) * 100 : 0;
                        return (
                          <tr key={a.userId} className="hover:bg-emerald-50/40">
                            <td className="px-5 py-3"><span className="font-medium text-gray-900">{a.userName}</span><span className="ml-1.5 text-[10px] text-gray-400">{a.role}</span></td>
                            <td className="px-3 py-3 text-gray-600">{formatNumber(a.totalConversations)}</td>
                            <td className="px-3 py-3 text-gray-600">{a.avgFirstResponseMinutes != null ? `${a.avgFirstResponseMinutes.toFixed(1)}m` : '—'}</td>
                            <td className="px-3 py-3 text-green-600 font-medium">{formatNumber(a.metSla)}</td>
                            <td className="px-3 py-3 text-rose-600 font-medium">{formatNumber(a.breachedSla)}</td>
                            <td className="px-3 py-3 text-gray-500"><span className="inline-flex items-center gap-1"><Timer className="h-3 w-3 text-gray-400" />{a.slaMinutes ?? sla?.slaMinutes ?? 30}m</span></td>
                            <td className="px-5 py-3"><span className={`font-semibold ${pct>=80?'text-green-600':pct>=50?'text-amber-600':'text-rose-600'}`}>{repl>0?`${pct.toFixed(0)}%`:'—'}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {slaAgents.length === 0 && <p className="px-5 py-6 text-center text-sm text-gray-400">No agents match the current filter.</p>}
              </div>
            )}
          </>
        );
      })()}

      {/* ── Team Performance (moved from Reports) ── */}
      <div className="flex items-center gap-2 mt-8 mb-4">
        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><Users className="h-4 w-4 text-emerald-600" /></div>
        <h2 className="text-base font-bold text-gray-900">Team Performance</h2>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard index={0} title="Total Teams" value={teams.length} icon={Users} theme="emerald" subtitleText={`${teams.filter(t=>t.isActive).length} active`} />
        <KPICard index={1} title="Conversations Handled" value={teams.reduce((s,t)=>s+t.conversationsHandled,0)} icon={MessageSquare} theme="blue" subtitleText={selectedPeriod==='today'?'Today':selectedPeriod==='week'?'Last 7 days':'Last 30 days'} />
        <KPICard index={2} title="Escalation Resolution" value={`${tpResolutionRate}%`} icon={Target} theme="green" subtitleText={`${teamTotalResolved} of ${teamTotalEsc} resolved`} />
        <KPICard index={3} title="Total Escalations" value={teamTotalEsc} icon={AlertTriangle} theme="amber" subtitleText={`${teamTotalEsc - teamTotalResolved} pending`} />
      </div>
      <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60"><p className="text-sm font-semibold text-gray-800">Performance by Team</p></div>
        {teams.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No teams set up yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Team','Manager','Members','Active','Handled','Escalations','Resolution','Avg Time','Status'].map(h => (
                    <th key={h} className={`py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide ${h==='Team'||h==='Manager'?'text-left':'text-center'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTeams.map(team => (
                  <tr key={team.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3.5 px-4"><div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"><Users className="h-3.5 w-3.5 text-slate-600" /></div><span className="text-sm font-semibold text-gray-900">{team.name}</span></div></td>
                    <td className="py-3.5 px-4 text-sm text-gray-600">{team.managerName}</td>
                    <td className="py-3.5 px-4 text-center text-sm font-semibold text-gray-800">{team.memberCount}</td>
                    <td className="py-3.5 px-4 text-center text-sm font-bold text-blue-600">{team.activeConversations}</td>
                    <td className="py-3.5 px-4 text-center text-sm font-semibold text-gray-800">{team.conversationsHandled}</td>
                    <td className="py-3.5 px-4 text-center"><span className="text-sm font-medium text-orange-600">{team.escalationsReceived}</span><span className="text-gray-300 mx-1">/</span><span className="text-sm font-medium text-green-600">{team.escalationsResolved}</span></td>
                    <td className="py-3.5 px-4"><div className="flex items-center gap-2"><div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${resBar(team.resolutionRate)}`} style={{width:`${team.resolutionRate}%`}} /></div><span className={`text-sm font-semibold ${resColor(team.resolutionRate)}`}>{team.resolutionRate.toFixed(0)}%</span></div></td>
                    <td className="py-3.5 px-4 text-center"><div className="flex items-center justify-center gap-1 text-sm text-gray-600"><Clock className="h-3.5 w-3.5 text-gray-400" />{team.avgResponseTime}m</div></td>
                    <td className="py-3.5 px-4 text-center"><span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${team.isActive?'bg-green-50 text-green-700 border-green-200':'bg-gray-100 text-gray-500 border-gray-200'}`}><span className={`h-1.5 w-1.5 rounded-full ${team.isActive?'bg-green-500':'bg-gray-400'}`} />{team.isActive?'Active':'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Agent SLA & performance drill-down ── */}
      {detailAgent && typeof document !== 'undefined' && createPortal(
        (() => {
          const a = detailAgent;
          const responded = a.slaResponded;
          const breached = Math.max(0, a.slaResponded - a.slaMet);
          const perf = getPerformanceLevel(a);
          const initials = (a.name || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
          const Stat = ({ label, value, color = 'text-gray-900' }: { label: string; value: string; color?: string }) => (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          );
          return (
            <div className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center p-4"
              onClick={() => setDetailAgent(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-up"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold">{initials}</div>
                    <div>
                      <p className="text-base font-bold text-gray-900">{a.name}</p>
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${getRoleBadgeColor(a.role)}`}>{a.role}</span>
                    </div>
                  </div>
                  <button onClick={() => setDetailAgent(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* First-Response SLA (focus) */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-gray-800">First-Response SLA</h3>
                    </div>
                    {responded === 0 ? (
                      <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No responded conversations in this period.</p>
                    ) : (
                      <>
                        <div className="flex items-end justify-between mb-3">
                          <div>
                            <p className={`text-4xl font-extrabold ${a.slaMetPct! >= 90 ? 'text-green-600' : a.slaMetPct! >= 70 ? 'text-blue-600' : 'text-red-600'}`}>
                              {a.slaMetPct!.toFixed(0)}%
                            </p>
                            <p className="text-xs text-gray-400 mt-1">of {responded} responded within SLA</p>
                          </div>
                          <div className="text-right text-xs text-gray-500 space-y-0.5">
                            <p><span className="font-bold text-green-600">{a.slaMet}</span> on time</p>
                            <p><span className="font-bold text-red-600">{breached}</span> breached</p>
                          </div>
                        </div>
                        <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                          <div className="bg-green-500" style={{ width: `${(a.slaMet / responded) * 100}%` }} />
                          <div className="bg-red-400" style={{ width: `${(breached / responded) * 100}%` }} />
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-500">
                          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-green-500" />Met SLA</span>
                          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-400" />Breached</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Responded" value={String(responded)} />
                    <Stat label="Met SLA" value={String(a.slaMet)} color="text-green-600" />
                    <Stat label="Avg 1st reply" value={`${a.avgResponseTime}m`} color="text-emerald-700" />
                  </div>

                  {/* Activity */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Activity · {periodLabel}</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <Stat label="Handled" value={String(a.conversationsHandled)} />
                      <Stat label="Active" value={String(a.activeConversations)} color="text-blue-600" />
                      <Stat label="Closed" value={String(a.closedInPeriod)} color="text-green-600" />
                    </div>
                  </div>

                  {/* Escalations & resolution */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Escalations &amp; resolution</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <Stat label="Received" value={String(a.escalationsReceived)} color="text-orange-600" />
                      <Stat label="Resolved" value={String(a.escalationsResolved)} color="text-green-600" />
                      <Stat label="Resolution" value={a.escalationsReceived > 0 ? `${a.resolutionRate.toFixed(0)}%` : '—'} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-sm text-gray-500">Overall performance</span>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${perf.bg} ${perf.color}`}>{perf.label}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}
