'use client';

import { useEffect, useState } from 'react';
import { dashboardApi, teamsApi, escalationsApi } from '@/services/api';
import {
  BarChart3, TrendingUp, MessageSquare, Clock, Users, CheckCircle,
  Target, ArrowUp, Download, AlertTriangle,
  Activity, Phone, Zap, Timer, Tag, Search, X, ArrowDown,
} from 'lucide-react';
import { KPICard } from '@/components/ui/kpi-card';
import { formatDateOnly, formatChartDate, formatNumber } from '@/lib/utils';

interface TeamReport {
  id: number; name: string; managerName: string; isActive: boolean;
  memberCount: number; conversationsHandled: number; activeConversations: number;
  escalationsReceived: number; escalationsResolved: number;
  resolutionRate: number; avgResponseTime: number;
}
interface HourlyRow { hour: number; messageCount: number; inbound: number; outbound: number; }
interface TopCustomer { customerPhone: string; customerName?: string; messageCount: number; conversationCount: number; lastMessageAt?: string; }

type Period = 1 | 7 | 14 | 30 | 60 | 90 | 365;

// ── SVG Bar Chart ────────────────────────────────────────────────────────────
// Shows total messages per day as main bar, with AI portion highlighted inside
// Round a max value up to a clean axis bound with ~5% headroom (e.g. 1700 → 2000)
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const target = v * 1.05;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const n = target / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function BarChart({ data }: { data: any[] }) {
  if (!data.length) return null;
  const W = 600; const H = 180; const PL = 44; const PB = 32; const PT = 22; // PT = headroom for legend + top labels
  const sorted = [...data].reverse();
  const maxVal = Math.max(...sorted.map(d => d.total || 0), 1);
  const niceMax = niceCeil(maxVal);   // clean axis max so the tallest bar never hits the top
  const plotH = H - PT;               // bars/gridlines live between PT and H
  const barW = Math.max(8, (W - PL - 12) / sorted.length - 4);

  return (
    <svg viewBox={`0 0 ${W} ${H + PB}`} className="w-full" style={{ height: 230 }}>
      {/* Gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
        const y = H - pct * plotH;
        const val = Math.round(pct * niceMax);
        return (
          <g key={pct}>
            <line x1={PL} y1={y} x2={W - 4} y2={y} stroke="#f0f0f0" strokeWidth={1} />
            <text x={PL - 6} y={y + 4} fontSize={9} fill="#9ca3af" textAnchor="end">
              {val >= 1000 ? `${(val/1000).toFixed(1)}k` : val}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {sorted.map((d, i) => {
        const x = PL + i * ((W - PL) / sorted.length) + 2;
        const total  = d.total        || 0;
        const ai     = d.aiHandled    || 0;
        const human  = d.humanHandled || 0;
        const totalH = (total / niceMax) * plotH;
        const aiH    = total > 0 ? (ai    / total) * totalH : 0;
        const humH   = total > 0 ? (human / total) * totalH : 0;
        const label  = formatChartDate(d.date);
        const showLabel = sorted.length <= 14 || i % Math.ceil(sorted.length / 14) === 0;
        return (
          <g key={i}>
            {/* Total bar background (inbound messages) */}
            <rect x={x} y={H - totalH} width={barW} height={totalH}
              rx={3} fill="#e0e7ff" />
            {/* Human reply portion (bottom of bar) */}
            {humH > 0 && (
              <rect x={x} y={H - humH} width={barW} height={humH}
                rx={3} fill="#818cf8" opacity={0.9} />
            )}
            {/* AI reply portion (stacked above human) */}
            {aiH > 0 && (
              <rect x={x} y={H - humH - aiH} width={barW} height={aiH}
                rx={3} fill="#34d399" opacity={0.9} />
            )}
            {/* Value label on top of bar */}
            {total > 0 && totalH > 14 && (
              <text x={x + barW / 2} y={H - totalH - 3} fontSize={8} fill="#6b7280"
                textAnchor="middle">{total >= 1000 ? `${(total/1000).toFixed(1)}k` : total}</text>
            )}
            {/* X label */}
            {showLabel && (
              <text x={x + barW / 2} y={H + PB - 4} fontSize={9} fill="#9ca3af"
                textAnchor="middle"
                transform={sorted.length > 21 ? `rotate(-35,${x + barW / 2},${H + PB - 4})` : undefined}>
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* Legend */}
      <rect x={PL} y={3} width={9} height={9} fill="#e0e7ff" rx={2} />
      <text x={PL + 12} y={11} fontSize={9} fill="#6b7280">Inbound msgs</text>
      <rect x={PL + 90} y={3} width={9} height={9} fill="#34d399" rx={2} />
      <text x={PL + 102} y={11} fontSize={9} fill="#6b7280">AI replies</text>
      <rect x={PL + 160} y={3} width={9} height={9} fill="#818cf8" rx={2} />
      <text x={PL + 172} y={11} fontSize={9} fill="#6b7280">Human replies</text>
    </svg>
  );
}

// ── SVG Donut Chart ──────────────────────────────────────────────────────────
function DonutChart({ rate, label, color = '#6366f1', count, countLabel }: {
  rate: number; label: string; color?: string; count?: number; countLabel?: string;
}) {
  const r = 38; const circ = 2 * Math.PI * r;
  // Show at least a tiny arc when rate > 0 so it's visible
  const clampedRate = rate > 0 && rate < 3 ? 3 : rate;
  const dash = (clampedRate / 100) * circ;
  const isZero = rate === 0;

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className="relative">
        <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
          <circle cx={50} cy={50} r={r} fill="none" stroke="#f3f4f6" strokeWidth={12} />
          {!isZero && (
            <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={12}
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          )}
        </svg>
        {/* Percentage in centre */}
        <div className="absolute inset-0 flex items-center justify-center rotate-0">
          <span className={`text-lg font-extrabold ${isZero ? 'text-gray-300' : 'text-gray-900'}`}>
            {rate.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className={`text-sm font-semibold ${isZero ? 'text-gray-400' : 'text-gray-800'}`}>{label}</p>
        {count !== undefined && (
          <p className={`text-xs mt-0.5 ${isZero ? 'text-gray-300' : 'text-gray-500'}`}>
            {count.toLocaleString('en-IN')} {countLabel ?? 'messages'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Hourly Heatmap (redesigned) ─────────────────────────────────────────────
function HourlyHeatmap({ data }: { data: HourlyRow[] }) {
  const [tooltip, setTooltip] = useState<{ hour: number; count: number; x: number; y: number } | null>(null);

  const max = Math.max(...data.map(d => d.messageCount), 1);

  const fmtHour = (h: number) => {
    if (h === 0)  return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
  };

  // Build a full 24-hour array, filling gaps with 0
  const hours = Array.from({ length: 24 }, (_, i) => {
    const found = data.find(d => d.hour === i);
    return { hour: i, count: found?.messageCount ?? 0 };
  });

  const bgColor = (count: number) => {
    const pct = count / max;
    if (pct === 0)   return '#f3f4f6';
    if (pct < 0.15)  return '#e0e7ff';
    if (pct < 0.30)  return '#c7d2fe';
    if (pct < 0.50)  return '#a5b4fc';
    if (pct < 0.70)  return '#818cf8';
    if (pct < 0.85)  return '#6366f1';
    return '#4338ca';
  };

  const textColor = (count: number) => {
    const pct = count / max;
    return pct >= 0.5 ? 'text-white' : 'text-gray-500';
  };

  // Group into 3 rows of 8 for better readability on all screen sizes
  const rows = [hours.slice(0, 8), hours.slice(8, 16), hours.slice(16, 24)];
  const rowLabels = ['Night  12am–7am', 'Morning  8am–3pm', 'Evening  4pm–11pm'];
  const rowColors = ['text-indigo-500', 'text-amber-600', 'text-purple-600'];

  return (
    <div className="relative space-y-3">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx}>
          <div className="flex items-center gap-1 mb-1.5">
            <span className={`text-[10px] font-semibold ${rowColors[rowIdx]}`}>{rowLabels[rowIdx]}</span>
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {row.map(({ hour, count }) => (
              <div key={hour} className="flex flex-col items-center gap-1">
                {/* Cell */}
                <div
                  className="w-full relative rounded-lg cursor-pointer transition-all duration-150 hover:scale-105 hover:shadow-md"
                  style={{ backgroundColor: bgColor(count), paddingBottom: '80%' }}
                  onMouseEnter={e => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setTooltip({ hour, count, x: rect.left + rect.width / 2, y: rect.top });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* Show count inside cell if significant */}
                  {count > 0 && (
                    <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${textColor(count)}`}>
                      {count >= 1000 ? `${(count/1000).toFixed(1)}k` : count}
                    </span>
                  )}
                </div>
                {/* Hour label */}
                <span className="text-[9px] text-gray-400 font-medium">{fmtHour(hour)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 pointer-events-none shadow-xl transform -translate-x-1/2 -translate-y-full -mt-2"
          style={{ left: tooltip.x, top: tooltip.y - 8 }}
        >
          <p className="font-semibold">{fmtHour(tooltip.hour)}</p>
          <p className="text-gray-300">{tooltip.count.toLocaleString('en-IN')} messages</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [trends, setTrends]         = useState<any[]>([]);
  const [teams, setTeams]           = useState<TeamReport[]>([]);
  const [hourly, setHourly]         = useState<HourlyRow[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [sla, setSla]               = useState<any>(null);
  const [resolution, setResolution] = useState<any>(null);
  const [compare, setCompare]       = useState<any>(null);
  const [intents, setIntents]       = useState<{ name: string; color: string | null; count: number }[]>([]);
  const [tagType, setTagType]       = useState<'conversation' | 'customer'>('conversation');
  const [query, setQuery]           = useState('');                                   // filters the tables by name/phone
  const [agentRole, setAgentRole]   = useState<'all' | 'CRR' | 'Manager' | 'HOD'>('all');
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState<Period>(7);
  const [hourlyPeriod, setHourlyPeriod] = useState<Period>(7);

  useEffect(() => { loadData(); }, [period]);
  useEffect(() => { loadHourly(); }, [hourlyPeriod]);
  useEffect(() => { loadTags(); }, [period, tagType]);

  const loadHourly = async () => {
    try {
      const res = await dashboardApi.getHourlyDistribution(hourlyPeriod);
      setHourly(res.data ?? []);
    } catch { /* silently ignore */ }
  };

  const loadTags = async () => {
    try {
      const res = await dashboardApi.getTagDistribution(tagType, period);
      setIntents(res.data ?? []);
    } catch { setIntents([]); }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [trendsRes, teamsRes, agentStatsRes, escalationsRes, topRes, slaRes, resolutionRes, compareRes] =
        await Promise.all([
          dashboardApi.getConversationTrends(period),
          teamsApi.getAll(),
          dashboardApi.getAgentStats(),
          escalationsApi.getAll(),
          dashboardApi.getTopCustomers(period, 10),
          // Resilient: a missing/failing SLA endpoint must not blank the whole page (tags load separately)
          dashboardApi.getResponseSla(period, 30).catch(() => ({ data: null })),
          dashboardApi.getResolution(period).catch(() => ({ data: null })),
          dashboardApi.getPeriodComparison(period).catch(() => ({ data: null })),
        ]);

      setTrends(trendsRes.data);
      setTopCustomers(topRes.data ?? []);
      setSla(slaRes.data ?? null);
      setResolution(resolutionRes.data ?? null);
      setCompare(compareRes.data ?? null);

      const rawTeams: any[]    = teamsRes.data;
      const agentStats: any[]  = agentStatsRes.data;
      const escalations: any[] = escalationsRes.data;

      const memberResults = await Promise.all(
        rawTeams.map((team: any) =>
          teamsApi.getMembers(team.id)
            .then(r => ({ teamId: team.id, members: r.data as any[] }))
            .catch(() => ({ teamId: team.id, members: [] as any[] }))
        )
      );
      const membersByTeam = new Map<number, any[]>(
        memberResults.map(({ teamId, members }) => [teamId, members])
      );

      const teamList: TeamReport[] = rawTeams.map((team: any) => {
        const members    = membersByTeam.get(team.id) ?? [];
        const memberIds  = new Set(members.map((m: any) => m.userId));
        const teamAgents = agentStats.filter((a: any) => memberIds.has(a.userId));
        const conversationsHandled = teamAgents.reduce((s, a) => s + (a.totalConversations || 0), 0);
        const activeConversations  = teamAgents.reduce((s, a) => s + (a.activeConversations  || 0), 0);
        const avgResponseTime = teamAgents.length
          ? Math.round(teamAgents.reduce((s, a) => s + (a.avgResolutionMinutes || 0), 0) / teamAgents.length / 60)
          : 0;
        const escalationsReceived = escalations.filter((e: any) => memberIds.has(e.escalatedToUserId));
        const escalationsResolved = escalationsReceived.filter((e: any) => e.status === 'Resolved');
        const resolutionRate = escalationsReceived.length > 0
          ? (escalationsResolved.length / escalationsReceived.length) * 100 : 100;
        return {
          id: team.id, name: team.name, managerName: team.managerName || '—',
          isActive: team.isActive, memberCount: members.length,
          conversationsHandled, activeConversations,
          escalationsReceived: escalationsReceived.length,
          escalationsResolved: escalationsResolved.length,
          resolutionRate, avgResponseTime,
        };
      });
      setTeams(teamList);
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  };

  // Search/filter the tabular sections (client-side over already-loaded data)
  const q = query.trim().toLowerCase();
  const filteredTeams = teams.filter(t =>
    !q || t.name.toLowerCase().includes(q) || (t.managerName ?? '').toLowerCase().includes(q));
  const filteredCustomers = topCustomers.filter((c: any) =>
    !q || (c.customerName ?? '').toLowerCase().includes(q) || (c.customerPhone ?? '').toLowerCase().includes(q));
  const filteredAgents = ((sla?.agents ?? []) as any[]).filter(a =>
    (agentRole === 'all' || a.role === agentRole) && (!q || (a.userName ?? '').toLowerCase().includes(q)));

  // Derived KPIs
  const totalConversations    = teams.reduce((s, t) => s + t.conversationsHandled, 0);
  const totalEscalations      = teams.reduce((s, t) => s + t.escalationsReceived, 0);
  const totalResolved         = teams.reduce((s, t) => s + t.escalationsResolved, 0);
  const overallResolutionRate = totalEscalations > 0
    ? ((totalResolved / totalEscalations) * 100).toFixed(1) : '100';
  const totalMessages = trends.reduce((s, d) => s + (d.total    || 0), 0);
  const totalAI       = trends.reduce((s, d) => s + (d.aiHandled || 0), 0);
  const totalHuman    = trends.reduce((s, d) => s + (d.humanHandled || 0), 0);
  const aiRate        = totalMessages > 0 ? (totalAI / totalMessages) * 100 : 0;

  const peakHour = hourly.length
    ? hourly.reduce((best, h) => h.messageCount > best.messageCount ? h : best, hourly[0])
    : null;

  const resColor = (r: number) =>
    r >= 90 ? 'text-green-600' : r >= 70 ? 'text-indigo-600' : r >= 50 ? 'text-amber-600' : 'text-red-500';
  const resBar = (r: number) =>
    r >= 90 ? 'bg-green-500' : r >= 70 ? 'bg-indigo-500' : r >= 50 ? 'bg-amber-400' : 'bg-red-500';

  // Generic CSV download with proper escaping (handles commas/quotes/newlines in names)
  const downloadCsv = (filename: string, rows: (string | number)[][]) => {
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    downloadCsv(`daily-volume-${period}d.csv`, [
      ['Date', 'Total', 'AI Handled', 'Human Handled', 'AI Rate (%)'],
      ...trends.map(d => [
        formatDateOnly(d.date), d.total, d.aiHandled, d.humanHandled,
        d.total > 0 ? ((d.aiHandled / d.total) * 100).toFixed(1) : '0',
      ]),
    ]);
  };

  const exportAgents = () => downloadCsv(`agent-sla-${period}d.csv`, [
    ['Agent', 'Role', 'Assigned', 'Avg First Reply (min)', 'On Time', 'Breached', 'SLA %'],
    ...filteredAgents.map((a: any) => {
      const repl = (a.metSla ?? 0) + (a.breachedSla ?? 0);
      return [a.userName, a.role, a.totalConversations,
        a.avgFirstResponseMinutes != null ? a.avgFirstResponseMinutes.toFixed(1) : '',
        a.metSla, a.breachedSla, repl > 0 ? ((a.metSla / repl) * 100).toFixed(0) : ''];
    }),
  ]);

  const exportTags = () => downloadCsv(`${tagType}-tags-${period}d.csv`, [
    ['Tag', tagType === 'conversation' ? 'Conversations' : 'Customers'],
    ...intents.map(i => [i.name, i.count]),
  ]);

  const exportTeams = () => downloadCsv(`team-performance-${period}d.csv`, [
    ['Team', 'Manager', 'Members', 'Active', 'Handled', 'Escalations', 'Resolution %', 'Avg Time (h)', 'Status'],
    ...filteredTeams.map(t => [t.name, t.managerName, t.memberCount, t.activeConversations,
      t.conversationsHandled, t.escalationsReceived, t.resolutionRate.toFixed(0), t.avgResponseTime,
      t.isActive ? 'Active' : 'Inactive']),
  ]);

  const exportCustomers = () => downloadCsv(`top-customers-${period}d.csv`, [
    ['Rank', 'Name', 'Phone', 'Messages', 'Conversations'],
    ...filteredCustomers.map((c: any, i: number) => [i + 1, c.customerName ?? '', c.customerPhone, c.messageCount, c.conversationCount]),
  ]);

  const fmtHour = (h: number) => {
    if (h === 0) return '12 AM'; if (h === 12) return '12 PM';
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
  };

  // Build a KPICard trend badge from current vs previous counts
  const trendBadge = (cur?: number, prev?: number) => {
    if (cur == null || prev == null) return undefined;
    if (prev === 0) return cur > 0 ? { value: 'new', isPositive: true, icon: ArrowUp } : undefined;
    const change = ((cur - prev) / prev) * 100;
    const isPositive = change >= 0;
    return { value: `${Math.abs(change).toFixed(0)}%`, isPositive, icon: isPositive ? ArrowUp : ArrowDown };
  };

  // Minutes → "Xm" / "Xh Ym" / "Xd Yh"
  const fmtDuration = (mins: number) => {
    const m = Math.round(mins);
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  };

  if (loading) return (
    <div className="p-6 lg:p-8 space-y-6 bg-white min-h-screen">
      <div className="flex items-center justify-between">
        <div className="skeleton h-6 w-48 rounded" />
        <div className="skeleton h-8 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <div className="skeleton h-3.5 w-24 rounded" />
            <div className="skeleton h-8 w-16 rounded" />
            <div className="skeleton h-3 w-28 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-gray-100 rounded-xl h-64 skeleton" />
        <div className="border border-gray-100 rounded-xl h-64 skeleton" />
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-white min-h-screen space-y-8">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-400">Conversation trends, team performance, and customer insights</p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search — filters the agent, team and customer tables */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search agent, team, customer…"
              className="w-56 pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700
                focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select value={period} onChange={e => setPeriod(Number(e.target.value) as Period)}
            className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg bg-white text-gray-700
              focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer">
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 365 days</option>
          </select>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700
              bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all">
            <Download className="h-3.5 w-3.5 text-gray-400" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Section 1: Summary KPIs ── */}
      <div>
        <SectionLabel icon={Activity} label="Overview" color="text-indigo-600" bg="bg-indigo-50" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
          <KPICard index={0} title="Total Conversations" value={totalMessages}
            icon={MessageSquare} theme="purple"
            subtitleText={`vs ${formatNumber(compare?.conversationsPrevious ?? 0)} prev ${period}d`}
            trend={trendBadge(compare?.conversationsCurrent, compare?.conversationsPrevious)} />
          <KPICard index={1} title="AI Handled" value={totalAI}
            icon={Zap} theme="green"
            subtitleText={`${aiRate.toFixed(1)}% AI rate`}
            trend={trendBadge(compare?.aiRepliesCurrent, compare?.aiRepliesPrevious)} />
          <KPICard index={2} title="Resolution Rate" value={`${overallResolutionRate}%`}
            icon={Target} theme="indigo"
            subtitleText={`${totalResolved} of ${totalEscalations} resolved`} />
          <KPICard index={3} title="Peak Hour" value={peakHour ? fmtHour(peakHour.hour) : '—'}
            icon={Clock} theme="amber"
            subtitleText={peakHour ? `${peakHour.messageCount} messages` : 'No data yet'} />
        </div>
      </div>

      {/* ── Section 2: Trend Chart + AI Donut ── */}
      <div>
        <SectionLabel icon={BarChart3} label="Conversation Trends" color="text-purple-600" bg="bg-purple-50" />
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Bar chart */}
          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-800">Daily Volume — Last {period} Days</p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400 inline-block" />AI
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400 inline-block" />Human
                </span>
              </div>
            </div>
            {trends.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <BarChart3 className="h-10 w-10 mb-2 text-gray-300" />
                <p className="text-sm">No data for this period</p>
              </div>
            ) : (
              <BarChart data={trends} />
            )}
          </div>

          {/* AI Rate donut + Human donut */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">AI vs Human Split</p>
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                {formatNumber(totalMessages)} total msgs
              </span>
            </div>
            <div className="flex items-center justify-around flex-1 py-2">
              <DonutChart rate={aiRate} label="AI handled" color="#34d399" count={totalAI} countLabel="AI replies" />
              <div className="w-px h-20 bg-gray-100" />
              <DonutChart rate={100 - aiRate} label="Human handled" color="#818cf8" count={totalHuman} countLabel="Human replies" />
            </div>
            {aiRate === 0 && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-center">
                AI auto-reply not yet active. Enable AI in Sessions → restart backend to see AI handling rate.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Hourly Heatmap ── */}
      <div>
        <SectionLabel icon={Clock} label="Message Activity by Hour" color="text-amber-600" bg="bg-amber-50" />
        <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <p className="text-sm font-semibold text-gray-800">When are customers messaging?</p>
            <div className="flex items-center gap-2">
              {peakHour && peakHour.messageCount > 0 && (
                <span className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full font-medium">
                  Peak: {fmtHour(peakHour.hour)} · {peakHour.messageCount} messages
                </span>
              )}
              <select value={hourlyPeriod} onChange={e => setHourlyPeriod(Number(e.target.value) as Period)}
                className="px-2.5 py-1 text-xs font-medium border border-gray-200 rounded-lg bg-white text-gray-700
                  focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer">
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
          </div>
          {hourly.some(h => h.messageCount > 0) ? (
            <>
              <HourlyHeatmap data={hourly} />
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
                <p className="text-[10px] text-gray-400">Hover over a cell to see exact count</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400">Low</span>
                  {['#f3f4f6','#e0e7ff','#c7d2fe','#a5b4fc','#818cf8','#6366f1','#4338ca'].map(c => (
                    <span key={c} className="h-3 w-3 rounded-sm" style={{ backgroundColor: c }} />
                  ))}
                  <span className="text-[10px] text-gray-400">High</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Clock className="h-10 w-10 mb-2 text-gray-300" />
              <p className="text-sm">No messages in the last {hourlyPeriod} days</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3b: First Response & SLA ── */}
      <div>
        <SectionLabel icon={Timer} label="First Response & SLA" color="text-rose-600" bg="bg-rose-50" />
        {(() => {
          const o = sla?.overall;
          const responded = o?.responded ?? 0;
          const metPct = responded > 0 ? (o.metSla / responded) * 100 : 0;
          const avgFrt = o?.avgFirstResponseMinutes;
          return (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
                <KPICard index={0} title="Avg First Response" value={avgFrt != null ? `${avgFrt.toFixed(1)}m` : '—'}
                  icon={Timer} theme="blue" subtitleText={`${formatNumber(responded)} replied of ${formatNumber(o?.totalConversations ?? 0)}`} />
                <KPICard index={1} title={`Within SLA (${sla?.slaMinutes ?? 30}m)`} value={`${metPct.toFixed(0)}%`}
                  icon={Target} theme="green" subtitleText={`${formatNumber(o?.metSla ?? 0)} on time`} />
                <KPICard index={2} title="Breached SLA" value={formatNumber(o?.breachedSla ?? 0)}
                  icon={AlertTriangle} theme="rose" subtitleText="Replied late" />
                <KPICard index={3} title="No Recorded Reply" value={formatNumber(o?.unanswered ?? 0)}
                  icon={MessageSquare} theme="amber" subtitleText="Often answered on Interakt app" />
              </div>

              {o && o.unanswered > 0 && (
                <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  ⚠ &ldquo;No recorded reply&rdquo; means no outbound message was saved in the dashboard — many of these are replies sent from the Interakt mobile app, which the API can&apos;t capture. They are <strong>not</strong> counted as SLA breaches.
                </p>
              )}

              {/* Per-agent first-response breakdown */}
              {sla?.agents?.length > 0 && (
                <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                  {/* Role filter */}
                  <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-b border-gray-50 flex-wrap">
                    <span className="text-xs font-semibold text-gray-500">Per-agent first response</span>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                        {(['all', 'CRR', 'Manager', 'HOD'] as const).map(r => (
                          <button key={r} onClick={() => setAgentRole(r)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                              agentRole === r ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}>
                            {r === 'all' ? 'All' : r}
                          </button>
                        ))}
                      </div>
                      <button onClick={exportAgents} title="Export CSV"
                        className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50">
                        <Download className="h-3 w-3" /> CSV
                      </button>
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
                        <th className="px-5 py-2.5 font-medium">SLA %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredAgents.map((a: any) => {
                        const repl = (a.metSla ?? 0) + (a.breachedSla ?? 0);
                        const pct = repl > 0 ? (a.metSla / repl) * 100 : 0;
                        return (
                          <tr key={a.userId} className="hover:bg-gray-50/50">
                            <td className="px-5 py-3">
                              <span className="font-medium text-gray-900">{a.userName}</span>
                              <span className="ml-1.5 text-[10px] text-gray-400">{a.role}</span>
                            </td>
                            <td className="px-3 py-3 text-gray-600">{formatNumber(a.totalConversations)}</td>
                            <td className="px-3 py-3 text-gray-600">{a.avgFirstResponseMinutes != null ? `${a.avgFirstResponseMinutes.toFixed(1)}m` : '—'}</td>
                            <td className="px-3 py-3 text-green-600 font-medium">{formatNumber(a.metSla)}</td>
                            <td className="px-3 py-3 text-rose-600 font-medium">{formatNumber(a.breachedSla)}</td>
                            <td className="px-5 py-3">
                              <span className={`font-semibold ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {repl > 0 ? `${pct.toFixed(0)}%` : '—'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                  {filteredAgents.length === 0 && (
                    <p className="px-5 py-6 text-center text-sm text-gray-400">No agents match the current search/filter.</p>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* ── Section 3d: Resolution & Handling ── */}
      <div>
        <SectionLabel icon={CheckCircle} label="Resolution & Handling" color="text-teal-600" bg="bg-teal-50" />
        {(() => {
          const r = resolution;
          const total = r?.totalConversations ?? 0;
          const ai = r?.aiHandled ?? 0, human = r?.humanHandled ?? 0, none = r?.noReply ?? 0;
          const pct = (n: number) => total > 0 ? (n / total) * 100 : 0;
          return (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
                <KPICard index={0} title="Conversations" value={formatNumber(total)}
                  icon={MessageSquare} theme="indigo" subtitleText={`Last ${period} days`} />
                <KPICard index={1} title="Avg Resolution" value={r?.avgResolutionMinutes != null ? fmtDuration(r.avgResolutionMinutes) : '—'}
                  icon={Clock} theme="green" subtitleText={`${formatNumber(r?.totalClosed ?? 0)} closed`} />
                <KPICard index={2} title="Escalation Rate" value={`${(r?.escalationRate ?? 0).toFixed(1)}%`}
                  icon={AlertTriangle} theme="amber" subtitleText={`${formatNumber(r?.escalatedConversations ?? 0)} escalated`} />
                <KPICard index={3} title="Escalations Resolved" value={`${formatNumber(r?.escalationsResolved ?? 0)}/${formatNumber(r?.totalEscalations ?? 0)}`}
                  icon={Target} theme="teal" subtitleText={r?.avgEscalationResolveMinutes != null ? `avg ${fmtDuration(r.avgEscalationResolveMinutes)}` : 'no data'} />
              </div>

              {/* Handling split — AI vs Human vs not captured */}
              <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
                <p className="text-sm font-semibold text-gray-800 mb-3">How conversations were handled</p>
                {total === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No conversations in the last {period} days</p>
                ) : (
                  <>
                    <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                      {human > 0 && <div className="bg-indigo-500" style={{ width: `${pct(human)}%` }} title={`Human: ${human}`} />}
                      {ai > 0 && <div className="bg-emerald-500" style={{ width: `${pct(ai)}%` }} title={`AI: ${ai}`} />}
                      {none > 0 && <div className="bg-gray-300" style={{ width: `${pct(none)}%` }} title={`Not captured: ${none}`} />}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs flex-wrap">
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />Human replied <b className="text-gray-700">{formatNumber(human)}</b> ({pct(human).toFixed(0)}%)</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />AI replied <b className="text-gray-700">{formatNumber(ai)}</b> ({pct(ai).toFixed(0)}%)</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gray-300" />No reply recorded <b className="text-gray-700">{formatNumber(none)}</b> ({pct(none).toFixed(0)}%)</span>
                    </div>
                    {none / Math.max(total, 1) > 0.5 && (
                      <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        ⚠ Most conversations show <strong>no reply recorded</strong> — replies sent from the Interakt mobile app aren&apos;t captured by the dashboard, and AI auto-reply is off for most sessions. Turn on auto-reply or reply from the dashboard to make this reflect real handling.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Escalations by reason / level */}
              {(r?.byReason?.length > 0 || r?.byLevel?.length > 0) && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
                    <p className="text-sm font-semibold text-gray-800 mb-3">Escalations by reason</p>
                    {r.byReason.length === 0 ? <p className="text-xs text-gray-400">No escalations in this period</p> : (
                      <div className="space-y-2">
                        {r.byReason.map((x: any) => (
                          <div key={x.name} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 truncate">{x.name}</span>
                            <span className="font-semibold text-gray-800">{formatNumber(x.count)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
                    <p className="text-sm font-semibold text-gray-800 mb-3">Escalations by level</p>
                    {r.byLevel.length === 0 ? <p className="text-xs text-gray-400">No escalations in this period</p> : (
                      <div className="space-y-2">
                        {r.byLevel.map((x: any) => (
                          <div key={x.name} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{x.name}</span>
                            <span className="font-semibold text-gray-800">{formatNumber(x.count)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* ── Section 3c: Tag Breakdown (conversation / customer) ── */}
      <div>
        <SectionLabel icon={Tag} label="Tag Breakdown" color="text-purple-600" bg="bg-purple-50" />
        <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          {/* Toggle: conversation tags vs customer tags */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <p className="text-sm font-semibold text-gray-800">
              {tagType === 'conversation' ? 'What customers ask about' : 'Customer segments'}
            </p>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                {(['conversation', 'customer'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTagType(t)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      tagType === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t === 'conversation' ? 'Conversation tags' : 'Customer tags'}
                  </button>
                ))}
              </div>
              {intents.length > 0 && (
                <button onClick={exportTags} title="Export CSV"
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50">
                  <Download className="h-3 w-3" /> CSV
                </button>
              )}
            </div>
          </div>

          {intents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <Tag className="h-9 w-9 mb-2 text-gray-300" />
              <p className="text-sm">
                {tagType === 'conversation'
                  ? `No tagged conversations in the last ${period} days`
                  : `No tagged customers active in the last ${period} days`}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {(() => {
                const maxCount = Math.max(...intents.map(i => i.count), 1);
                const unit = tagType === 'conversation' ? 'conversations' : 'customers';
                return intents.map(i => (
                  <div key={i.name} className="flex items-center gap-3">
                    <span className="w-28 text-xs font-medium text-gray-600 truncate flex-shrink-0">{i.name}</span>
                    <div className="flex-1 h-6 bg-gray-50 rounded-lg overflow-hidden">
                      <div className="h-full rounded-lg transition-all duration-500 flex items-center justify-end px-2"
                        title={`${i.count} ${unit}`}
                        style={{ width: `${(i.count / maxCount) * 100}%`, backgroundColor: (i.color || '#6366f1') + '33', minWidth: '28px' }}>
                        <span className="text-[11px] font-bold" style={{ color: i.color || '#6366f1' }}>{formatNumber(i.count)}</span>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Team Performance ── */}
      <div>
        <SectionLabel icon={Users} label="Team Performance" color="text-indigo-600" bg="bg-indigo-50" />
        <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <KPICard index={0} title="Total Teams" value={teams.length}
            icon={Users} theme="indigo"
            subtitleText={`${teams.filter(t => t.isActive).length} active`} />
          <KPICard index={1} title="Conversations Handled" value={totalConversations}
            icon={MessageSquare} theme="blue"
            subtitleText={`Last ${period} days`} />
          <KPICard index={2} title="Escalation Resolution" value={`${overallResolutionRate}%`}
            icon={Target} theme="green"
            subtitleText={`${totalResolved} of ${totalEscalations} resolved`} />
          <KPICard index={3} title="Total Escalations" value={totalEscalations}
            icon={AlertTriangle} theme="amber"
            subtitleText={`${totalEscalations - totalResolved} pending`} />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-semibold text-gray-800">Performance by Team</h3>
            </div>
            {teams.length > 0 && (
              <button onClick={exportTeams} title="Export CSV"
                className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50">
                <Download className="h-3 w-3" /> CSV
              </button>
            )}
          </div>
          {teams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="h-16 w-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-gray-900 mb-1">No teams set up yet</p>
              <p className="text-xs text-gray-400 max-w-xs">Create teams and assign members to track performance here.</p>
              <a href="/dashboard/teams"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-700 text-white rounded-lg hover:bg-indigo-800">
                <Users className="h-3.5 w-3.5" />Go to Teams
              </a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Team','Manager','Members','Active','Handled','Escalations','Resolution','Avg Time','Status'].map(h => (
                      <th key={h} className={`py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide ${h === 'Team' || h === 'Manager' ? 'text-left' : 'text-center'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTeams.length === 0 && (
                    <tr><td colSpan={9} className="py-6 text-center text-sm text-gray-400">No teams match “{query}”.</td></tr>
                  )}
                  {filteredTeams.map(team => (
                    <tr key={team.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <Users className="h-3.5 w-3.5 text-slate-600" />
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{team.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-gray-600">{team.managerName}</td>
                      <td className="py-3.5 px-4 text-center text-sm font-semibold text-gray-800">{team.memberCount}</td>
                      <td className="py-3.5 px-4 text-center text-sm font-bold text-blue-600">{team.activeConversations}</td>
                      <td className="py-3.5 px-4 text-center text-sm font-semibold text-gray-800">{team.conversationsHandled}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="text-sm font-medium text-orange-600">{team.escalationsReceived}</span>
                        <span className="text-gray-300 mx-1">/</span>
                        <span className="text-sm font-medium text-green-600">{team.escalationsResolved}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${resBar(team.resolutionRate)}`}
                              style={{ width: `${team.resolutionRate}%` }} />
                          </div>
                          <span className={`text-sm font-semibold ${resColor(team.resolutionRate)}`}>
                            {team.resolutionRate.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
                          <Clock className="h-3.5 w-3.5 text-gray-400" />
                          {team.avgResponseTime}m
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          team.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${team.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {team.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 5: Top Customers + Daily Table ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top Customers */}
        <div>
          <SectionLabel icon={Phone} label="Top Customers" color="text-green-600" bg="bg-green-50" />
          <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
              <p className="text-sm font-semibold text-gray-800">Most Active — Last {period} Days</p>
              {topCustomers.length > 0 && (
                <button onClick={exportCustomers} title="Export CSV"
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50">
                  <Download className="h-3 w-3" /> CSV
                </button>
              )}
            </div>
            {topCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Phone className="h-8 w-8 mb-2 text-gray-300" />
                <p className="text-sm">No customer data yet</p>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Phone className="h-8 w-8 mb-2 text-gray-300" />
                <p className="text-sm">No customers match “{query}”</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredCustomers.map((c: any, i: number) => (
                  <a key={c.customerPhone} href={`/dashboard/customers?search=${encodeURIComponent(c.customerPhone)}`}
                    title="Open in Customers" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
                    <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-200 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {c.customerName || c.customerPhone}
                      </p>
                      {c.customerName && (
                        <p className="text-xs text-gray-400 truncate">{c.customerPhone}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-indigo-600">{c.messageCount}</p>
                      <p className="text-xs text-gray-400">{c.conversationCount} conv</p>
                    </div>
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                      <div className="h-full bg-indigo-400 rounded-full"
                        style={{ width: `${(c.messageCount / (topCustomers[0]?.messageCount || 1)) * 100}%` }} />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Daily Breakdown */}
        <div>
          <SectionLabel icon={MessageSquare} label="Daily Breakdown" color="text-purple-600" bg="bg-purple-50" />
          <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
              <p className="text-sm font-semibold text-gray-800">Last {period} Days</p>
            </div>
            {trends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <BarChart3 className="h-8 w-8 mb-2 text-gray-300" />
                <p className="text-sm">No data for this period</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-96">
                <table className="w-full">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">AI</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">Human</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...trends].reverse().map((day, idx) => {
                      const rate = day.total > 0 ? (day.aiHandled / day.total) * 100 : 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2.5 px-4 text-sm text-gray-700 font-medium">
                            {formatDateOnly(day.date)}
                          </td>
                          <td className="py-2.5 px-3 text-center text-sm font-bold text-gray-900">{day.total || 0}</td>
                          <td className="py-2.5 px-3 text-center text-sm font-semibold text-emerald-600">{day.aiHandled || 0}</td>
                          <td className="py-2.5 px-3 text-center text-sm font-semibold text-indigo-600">{day.humanHandled || 0}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              rate >= 70 ? 'bg-green-50 text-green-700 border-green-200'
                              : rate >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              {rate.toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white border-t border-gray-200">
                    <tr>
                      <td className="py-2.5 px-4 text-xs font-bold text-gray-600 uppercase">Total</td>
                      <td className="py-2.5 px-3 text-center text-sm font-bold text-gray-900">{totalMessages}</td>
                      <td className="py-2.5 px-3 text-center text-sm font-bold text-emerald-600">{totalAI}</td>
                      <td className="py-2.5 px-3 text-center text-sm font-bold text-indigo-600">{totalHuman}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          aiRate >= 70 ? 'bg-green-50 text-green-700 border-green-200'
                          : aiRate >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-red-50 text-red-600 border-red-200'
                        }`}>
                          {aiRate.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

function SectionLabel({ icon: Icon, label, color, bg }: { icon: any; label: string; color: string; bg: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-7 w-7 rounded-full ${bg} flex items-center justify-center`}>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
    </div>
  );
}
