'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { dashboardApi, teamsApi, escalationsApi } from '@/services/api';
import {
  BarChart3, MessageSquare, Clock, Users, CheckCircle,
  Target, ArrowUp, Download, AlertTriangle,
  Activity, Phone, Zap, Timer, Tag, Search, X, ArrowDown, BrainCircuit,
  ChevronDown, FileText, FileSpreadsheet, Smile, Meh, Frown,
} from 'lucide-react';
import { KPICard } from '@/components/ui/kpi-card';
import { formatDateOnly, formatChartDate, formatNumber } from '@/lib/utils';
import { DASHBOARD_RANGE_EVENT, DashboardRangeDetail, rangeToDays } from '@/lib/dateRange';
import { exportExcel, exportPdf, exportDocx } from '@/lib/reportExport';
import type { TableBlock, PieBlock, Kpi } from '@/lib/reportExport';

interface TeamReport {
  id: number; name: string; managerName: string; isActive: boolean;
  memberCount: number; conversationsHandled: number; activeConversations: number;
  escalationsReceived: number; escalationsResolved: number;
  resolutionRate: number; avgResponseTime: number;
}
interface HourlyRow { hour: number; messageCount: number; inbound: number; outbound: number; }
interface TopCustomer { customerPhone: string; customerName?: string; messageCount: number; conversationCount: number; lastMessageAt?: string; }

type Period = number; // days; driven by the header date filter

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
              rx={3} fill="#d1fae5" />
            {/* Human reply portion (bottom of bar) */}
            {humH > 0 && (
              <rect x={x} y={H - humH} width={barW} height={humH}
                rx={3} fill="#34d399" opacity={0.9} />
            )}
            {/* AI reply portion (stacked above human) — light blue to distinguish from human (green) */}
            {aiH > 0 && (
              <rect x={x} y={H - humH - aiH} width={barW} height={aiH}
                rx={3} fill="#60a5fa" opacity={0.95} />
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
      <rect x={PL} y={3} width={9} height={9} fill="#d1fae5" rx={2} />
      <text x={PL + 12} y={11} fontSize={9} fill="#6b7280">Inbound msgs</text>
      <rect x={PL + 90} y={3} width={9} height={9} fill="#60a5fa" rx={2} />
      <text x={PL + 102} y={11} fontSize={9} fill="#6b7280">AI replies</text>
      <rect x={PL + 160} y={3} width={9} height={9} fill="#34d399" rx={2} />
      <text x={PL + 172} y={11} fontSize={9} fill="#6b7280">Human replies</text>
    </svg>
  );
}

// ── SVG Donut Chart ──────────────────────────────────────────────────────────
function DonutChart({ rate, label, color = '#10b981', count, countLabel }: {
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

// ── Reusable trend line (gradient area + hover dots) ────────────────────────
function TrendLine({ data, valueKey, color = '#10b981', suffix = '', fmt }: {
  data: any[]; valueKey: string; color?: string; suffix?: string; fmt?: (n: number) => string;
}) {
  if (!data || data.length === 0)
    return <p className="text-sm text-gray-400 py-8 text-center">No data for this period yet</p>;
  const vals = data.map(d => Number(d[valueKey]) || 0);
  const max = Math.max(...vals, 0.0001);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const W = 100, H = 34;
  const pts = data.map((d, i) => {
    const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W;
    const y = H - ((Number(d[valueKey]) - min) / range) * (H - 3) - 1.5;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const show = (n: number) => (fmt ? fmt(n) : n.toFixed(1)) + suffix;
  const gid = `tl-${valueKey}-${color.replace('#', '')}`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-28">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={1.3} fill={color} vectorEffect="non-scaling-stroke">
            <title>{`${formatChartDate(data[i].date)}: ${show(vals[i])}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>{formatChartDate(data[0].date)}</span>
        <span className="font-semibold text-gray-600">latest: {show(vals[vals.length - 1])}</span>
        <span>{formatChartDate(data[data.length - 1].date)}</span>
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
    if (pct < 0.15)  return '#d1fae5';
    if (pct < 0.30)  return '#a7f3d0';
    if (pct < 0.50)  return '#6ee7b7';
    if (pct < 0.70)  return '#34d399';
    if (pct < 0.85)  return '#10b981';
    return '#047857';
  };

  const textColor = (count: number) => {
    const pct = count / max;
    return pct >= 0.5 ? 'text-white' : 'text-gray-500';
  };

  // Group into 3 rows of 8 for better readability on all screen sizes
  const rows = [hours.slice(0, 8), hours.slice(8, 16), hours.slice(16, 24)];
  const rowLabels = ['Night  12am–7am', 'Morning  8am–3pm', 'Evening  4pm–11pm'];
  const rowColors = ['text-emerald-500', 'text-amber-600', 'text-purple-600'];

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
  const [aiStats, setAiStats]       = useState<any>(null);
  const [aiByAgent, setAiByAgent]   = useState<any[]>([]);
  const [sentiment, setSentiment]   = useState<any>(null);
  const [respTrend, setRespTrend]   = useState<any[]>([]);
  const [intents, setIntents]       = useState<{ name: string; color: string | null; count: number }[]>([]);
  const [tagType, setTagType]       = useState<'conversation' | 'customer'>('conversation');
  const [query, setQuery]           = useState('');                                   // filters the tables by name/phone
  const [agentRole, setAgentRole]   = useState<'all' | 'CRR' | 'Manager' | 'HOD'>('all');
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState<Period>(7);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [slaAgent, setSlaAgent] = useState<any>(null);

  useEffect(() => { loadData(); }, [period]);
  useEffect(() => { loadHourly(); }, [period]);   // hourly follows the global period filter
  useEffect(() => { loadTags(); }, [period, tagType]);

  // Header date filter → set the day window for all report queries.
  useEffect(() => {
    const onRange = (e: Event) => {
      const d = (e as CustomEvent<DashboardRangeDetail>).detail;
      if (d) setPeriod(rangeToDays(d.range, d.from, d.to));
    };
    window.addEventListener(DASHBOARD_RANGE_EVENT, onRange);
    return () => window.removeEventListener(DASHBOARD_RANGE_EVENT, onRange);
  }, []);

  // Close the export menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const loadHourly = async () => {
    try {
      const res = await dashboardApi.getHourlyDistribution(period);
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
      const [trendsRes, teamsRes, agentStatsRes, escalationsRes, topRes, slaRes, resolutionRes, compareRes, aiRes, aiByAgentRes, sentimentRes, respTrendRes] =
        await Promise.all([
          dashboardApi.getConversationTrends(period),
          teamsApi.getAll(),
          dashboardApi.getAgentStats(period),
          escalationsApi.getAll(),
          dashboardApi.getTopCustomers(period, 10),
          // Resilient: a missing/failing SLA endpoint must not blank the whole page (tags load separately)
          dashboardApi.getResponseSla(period, 30).catch(() => ({ data: null })),
          dashboardApi.getResolution(period).catch(() => ({ data: null })),
          dashboardApi.getPeriodComparison(period).catch(() => ({ data: null })),
          dashboardApi.getAiSuggestionStats(period <= 7 ? 'week' : 'month').catch(() => ({ data: null })),
          dashboardApi.getAiSuggestionsByAgent(period <= 7 ? 'week' : 'month').catch(() => ({ data: [] })),
          dashboardApi.getSentiment(period).catch(() => ({ data: null })),
          dashboardApi.getResponseTimeTrend(period).catch(() => ({ data: [] })),
        ]);

      setTrends(trendsRes.data);
      setTopCustomers(topRes.data ?? []);
      setSla(slaRes.data ?? null);
      setResolution(resolutionRes.data ?? null);
      setCompare(compareRes.data ?? null);
      setAiStats(aiRes.data ?? null);
      setAiByAgent(aiByAgentRes.data ?? []);
      setSentiment(sentimentRes.data ?? null);
      setRespTrend(respTrendRes.data ?? []);

      const rawTeams: any[]    = teamsRes.data;
      const agentStats: any[]  = agentStatsRes.data;
      // Scope escalations to the selected period (endpoint returns all) so team escalation metrics
      // and the Resolution Rate KPI follow the header date filter like the rest of the page.
      const escFrom = new Date(); escFrom.setHours(0, 0, 0, 0); escFrom.setDate(escFrom.getDate() - (period - 1));
      const escalations: any[] = ((escalationsRes.data as any[]) ?? []).filter((e: any) => {
        const d = e.escalatedAt ? new Date(e.escalatedAt) : null;
        return d ? d >= escFrom : true;
      });

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
    r >= 90 ? 'text-green-600' : r >= 70 ? 'text-emerald-600' : r >= 50 ? 'text-amber-600' : 'text-red-500';
  const resBar = (r: number) =>
    r >= 90 ? 'bg-green-500' : r >= 70 ? 'bg-emerald-500' : r >= 50 ? 'bg-amber-400' : 'bg-red-500';

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

  // ── Master report export (CSV / Excel / PDF / Word) ──
  const buildKpis = (): Kpi[] => [
    { label: 'Total Conversations', value: formatNumber(totalMessages) },
    { label: 'AI Handled',          value: `${formatNumber(totalAI)} (${aiRate.toFixed(0)}%)` },
    { label: 'Resolution Rate',     value: `${overallResolutionRate}%` },
    { label: 'Peak Hour',           value: peakHour ? fmtHour(peakHour.hour) : '—' },
  ];

  const buildPies = (): PieBlock[] => {
    const pies: PieBlock[] = [];
    if (totalMessages > 0) pies.push({
      title: 'AI vs Human Replies',
      slices: [
        { label: 'Human replies', value: totalHuman, color: '#34d399' },
        { label: 'AI replies',    value: totalAI,    color: '#34d399' },
      ],
    });
    const r = resolution;
    if (r && (r.totalConversations ?? 0) > 0) pies.push({
      title: 'How Conversations Were Handled',
      slices: [
        { label: 'Human replied',     value: r.humanHandled ?? 0, color: '#10b981' },
        { label: 'AI replied',        value: r.aiHandled ?? 0,    color: '#10b981' },
        { label: 'No reply recorded', value: r.noReply ?? 0,      color: '#d1d5db' },
      ],
    });
    return pies;
  };

  const buildTables = (): TableBlock[] => {
    const blocks: TableBlock[] = [];
    if (trends.length) blocks.push({
      title: 'Daily Volume',
      headers: ['Date', 'Total', 'AI', 'Human', 'AI Rate %'],
      rows: [...trends].reverse().map(d => [
        formatDateOnly(d.date), d.total || 0, d.aiHandled || 0, d.humanHandled || 0,
        d.total > 0 ? ((d.aiHandled / d.total) * 100).toFixed(0) : '0',
      ]),
    });
    if (filteredTeams.length) blocks.push({
      title: 'Team Performance',
      headers: ['Team', 'Manager', 'Members', 'Active', 'Handled', 'Esc Recv', 'Esc Resolved', 'Resolution %', 'Avg Time (m)', 'Status'],
      rows: filteredTeams.map(t => [t.name, t.managerName, t.memberCount, t.activeConversations,
        t.conversationsHandled, t.escalationsReceived, t.escalationsResolved, t.resolutionRate.toFixed(0), t.avgResponseTime,
        t.isActive ? 'Active' : 'Inactive']),
    });
    if (filteredAgents.length) blocks.push({
      title: 'Agent SLA',
      headers: ['Agent', 'Role', 'Assigned', 'Avg 1st Reply (m)', 'On Time', 'Breached', 'SLA %'],
      rows: filteredAgents.map((a: any) => {
        const repl = (a.metSla ?? 0) + (a.breachedSla ?? 0);
        return [a.userName, a.role, a.totalConversations,
          a.avgFirstResponseMinutes != null ? a.avgFirstResponseMinutes.toFixed(1) : '—',
          a.metSla ?? 0, a.breachedSla ?? 0, repl > 0 ? `${((a.metSla / repl) * 100).toFixed(0)}%` : '—'];
      }),
    });
    if (filteredCustomers.length) blocks.push({
      title: 'Top Customers',
      headers: ['Rank', 'Name', 'Phone', 'Messages', 'Conversations'],
      rows: filteredCustomers.map((c: any, i: number) => [i + 1, c.customerName ?? '', c.customerPhone, c.messageCount, c.conversationCount]),
    });
    if (intents.length) blocks.push({
      title: tagType === 'conversation' ? 'Conversation Tags' : 'Customer Tags',
      headers: ['Tag', tagType === 'conversation' ? 'Conversations' : 'Customers'],
      rows: intents.map(i => [i.name, i.count]),
    });
    return blocks;
  };

  const runExport = async (kind: 'csv' | 'excel' | 'pdf' | 'docx') => {
    setExportOpen(false);
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `tejoo-report-${period}d-${stamp}`;
    if (kind === 'csv')   { handleExport(); return; }
    if (kind === 'excel') { await exportExcel(`${base}.xlsx`, buildTables()); return; }
    const payload = {
      title: 'Tejoo Fashion — Analytics Report',
      subtitle: `${period === 1 ? 'Today' : `Last ${period} days`} · generated ${new Date().toLocaleDateString('en-IN')}`,
      kpis: buildKpis(), pies: buildPies(), tables: buildTables(),
    };
    if (kind === 'pdf') await exportPdf(`${base}.pdf`, payload);
    else                await exportDocx(`${base}.docx`, payload);
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
    <div className="p-6 lg:p-8 space-y-6 bg-beige min-h-screen">
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
    <div className="p-4 sm:p-6 lg:p-8 bg-beige min-h-screen space-y-8">

      {/* ── Section 1: Summary KPIs ── */}
      <div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KPICard index={0} title="Total Conversations" value={totalMessages}
            icon={MessageSquare} theme="purple"
            subtitleText={`vs ${formatNumber(compare?.conversationsPrevious ?? 0)} prev ${period}d`}
            trend={trendBadge(compare?.conversationsCurrent, compare?.conversationsPrevious)} />
          <KPICard index={1} title="AI Handled" value={totalAI}
            icon={Zap} theme="green"
            subtitleText={`${aiRate.toFixed(1)}% AI rate`}
            trend={trendBadge(compare?.aiRepliesCurrent, compare?.aiRepliesPrevious)} />
          <KPICard index={2} title="Resolution Rate" value={`${overallResolutionRate}%`}
            icon={Target} theme="emerald"
            subtitleText={`${totalResolved} of ${totalEscalations} resolved`} />
          <KPICard index={3} title="Peak Hour" value={peakHour ? fmtHour(peakHour.hour) : '—'}
            icon={Clock} theme="amber"
            subtitleText={peakHour ? `${peakHour.messageCount} messages` : 'No data yet'} />
        </div>

        {/* Search + Export — full-width row below the KPIs */}
        <div className="flex items-center gap-2 mt-4">
          {/* Search — filters the agent, team and customer tables */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search agent, team, customer…"
              className="w-full pl-8 pr-7 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700
                focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="relative flex-shrink-0" ref={exportRef}>
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
                  { k: 'excel', label: 'Excel workbook', icon: FileSpreadsheet, hint: 'tables' },
                  { k: 'csv',   label: 'CSV (daily)',    icon: Download,        hint: '' },
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
                  <span className="h-2.5 w-2.5 rounded-sm bg-blue-400 inline-block" />AI
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400 inline-block" />Human
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
              <DonutChart rate={100 - aiRate} label="Human handled" color="#34d399" count={totalHuman} countLabel="Human replies" />
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
                <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full font-medium">
                  Peak: {fmtHour(peakHour.hour)} · {peakHour.messageCount} messages
                </span>
              )}
              <span className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
                {period === 1 ? 'Today' : `Last ${period} days`}
              </span>
            </div>
          </div>
          {hourly.some(h => h.messageCount > 0) ? (
            <>
              <HourlyHeatmap data={hourly} />
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
                <p className="text-[10px] text-gray-400">Hover over a cell to see exact count</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400">Low</span>
                  {['#f3f4f6','#d1fae5','#a7f3d0','#6ee7b7','#34d399','#10b981','#047857'].map(c => (
                    <span key={c} className="h-3 w-3 rounded-sm" style={{ backgroundColor: c }} />
                  ))}
                  <span className="text-[10px] text-gray-400">High</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Clock className="h-10 w-10 mb-2 text-gray-300" />
              <p className="text-sm">No messages in the last {period} days</p>
            </div>
          )}
        </div>
      </div>

      {/* ── AI Copilot acceptance ── */}
      <div>
        <SectionLabel icon={BrainCircuit} label="AI Copilot" color="text-violet-600" bg="bg-violet-50" />
        {(() => {
          const a = aiStats;
          const acted = a?.acted ?? 0;
          const total = a?.total ?? 0;
          return (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
                <KPICard index={0} title="Acceptance Rate" value={`${(a?.acceptanceRate ?? 0).toFixed(0)}%`}
                  icon={CheckCircle} theme="purple" subtitleText="drafts used (sent or edited)" />
                <KPICard index={1} title="Sent As-Is" value={`${(a?.sendAsIsRate ?? 0).toFixed(0)}%`}
                  icon={Zap} theme="emerald" subtitleText="good enough untouched" />
                <KPICard index={2} title="Drafts Generated" value={formatNumber(total)}
                  icon={BrainCircuit} theme="blue" subtitleText={`Last ${period} days`} />
                <KPICard index={3} title="Acted On" value={formatNumber(acted)}
                  icon={Target} theme="amber" subtitleText={`${formatNumber(a?.pending ?? 0)} pending`} />
              </div>

              <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
                <p className="text-sm font-semibold text-gray-800 mb-3">How CRRs handled AI drafts</p>
                {acted === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No AI drafts acted on in the last {period} days</p>
                ) : (
                  <>
                    <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                      {(a.sent ?? 0) > 0      && <div className="bg-emerald-500" style={{ width: `${(a.sent / acted) * 100}%` }}      title={`Sent as-is: ${a.sent}`} />}
                      {(a.edited ?? 0) > 0    && <div className="bg-violet-500"  style={{ width: `${(a.edited / acted) * 100}%` }}    title={`Edited: ${a.edited}`} />}
                      {(a.dismissed ?? 0) > 0 && <div className="bg-gray-400"    style={{ width: `${(a.dismissed / acted) * 100}%` }} title={`Dismissed: ${a.dismissed}`} />}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Sent as-is <b className="text-gray-700">{a.sent ?? 0}</b></span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Edited <b className="text-gray-700">{a.edited ?? 0}</b></span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> Dismissed <b className="text-gray-700">{a.dismissed ?? 0}</b></span>
                    </div>
                  </>
                )}
              </div>

              {/* Per-agent AI acceptance */}
              {aiByAgent.length > 0 && (
                <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
                  <p className="text-sm font-semibold text-gray-800 mb-3">Acceptance by agent</p>
                  <div className="space-y-2.5">
                    {aiByAgent.map((ag: any) => (
                      <div key={ag.agentName} className="flex items-center gap-3">
                        <div className="w-28 text-xs font-medium text-gray-700 truncate flex-shrink-0">{ag.agentName}</div>
                        <div className="flex-1 flex h-3.5 rounded-full overflow-hidden bg-gray-100">
                          {ag.sent > 0      && <div className="bg-emerald-500" style={{ width: `${(ag.sent / ag.acted) * 100}%` }}      title={`Sent as-is: ${ag.sent}`} />}
                          {ag.edited > 0    && <div className="bg-violet-500"  style={{ width: `${(ag.edited / ag.acted) * 100}%` }}    title={`Edited: ${ag.edited}`} />}
                          {ag.dismissed > 0 && <div className="bg-gray-300"    style={{ width: `${(ag.dismissed / ag.acted) * 100}%` }} title={`Dismissed: ${ag.dismissed}`} />}
                        </div>
                        <div className="w-24 text-right text-xs text-gray-500 flex-shrink-0">
                          <b className="text-gray-800">{ag.acceptanceRate.toFixed(0)}%</b> <span className="text-gray-400">· {ag.acted}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* ── Customer Sentiment ── */}
      <div>
        <SectionLabel icon={Smile} label="Customer Sentiment" color="text-rose-600" bg="bg-rose-50" />
        {(() => {
          const s = sentiment;
          const total = s?.total ?? 0;
          const pos = s?.positive ?? 0, neu = s?.neutral ?? 0, neg = s?.negative ?? 0;
          const avg = s?.avgScore ?? 0;
          const pct = (n: number) => total > 0 ? (n / total) * 100 : 0;
          const mood = avg >= 0.3 ? 'Positive' : avg <= -0.3 ? 'Negative' : 'Neutral';
          return (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
                <KPICard index={0} title="Overall Mood" value={mood}
                  icon={avg >= 0.3 ? Smile : avg <= -0.3 ? Frown : Meh}
                  theme={avg >= 0.3 ? 'emerald' : avg <= -0.3 ? 'rose' : 'amber'}
                  subtitleText={`avg score ${avg.toFixed(2)} · ${total} chats`} />
                <KPICard index={1} title="Positive" value={formatNumber(pos)} icon={Smile} theme="emerald" subtitleText={`${pct(pos).toFixed(0)}% of rated`} />
                <KPICard index={2} title="Neutral"  value={formatNumber(neu)} icon={Meh}   theme="amber"   subtitleText={`${pct(neu).toFixed(0)}%`} />
                <KPICard index={3} title="Negative" value={formatNumber(neg)} icon={Frown} theme="rose"    subtitleText={`${pct(neg).toFixed(0)}%`} />
              </div>

              <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
                <p className="text-sm font-semibold text-gray-800 mb-3">Sentiment distribution</p>
                {total === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No sentiment data yet — it fills in as conversation summaries are generated.</p>
                ) : (
                  <>
                    <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                      {pos > 0 && <div className="bg-emerald-500" style={{ width: `${pct(pos)}%` }} title={`Positive: ${pos}`} />}
                      {neu > 0 && <div className="bg-amber-400"   style={{ width: `${pct(neu)}%` }} title={`Neutral: ${neu}`} />}
                      {neg > 0 && <div className="bg-rose-500"    style={{ width: `${pct(neg)}%` }} title={`Negative: ${neg}`} />}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Positive <b className="text-gray-700">{pos}</b></span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Neutral <b className="text-gray-700">{neu}</b></span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Negative <b className="text-gray-700">{neg}</b></span>
                    </div>
                    {(s?.trend?.length ?? 0) > 1 && (
                      <div className="mt-5 pt-4 border-t border-gray-50">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Average sentiment over time <span className="text-gray-300">(−1 to +1)</span></p>
                        <TrendLine data={s.trend} valueKey="avgScore" color="#8b5cf6" fmt={(n) => n.toFixed(2)} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Response-time trend */}
              <div className="mt-4 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
                <p className="text-sm font-semibold text-gray-800 mb-3">First-response time over time</p>
                <TrendLine data={respTrend} valueKey="avgResponseMinutes" color="#0ea5e9" suffix="m" fmt={(n) => n.toFixed(1)} />
              </div>
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
                  icon={MessageSquare} theme="emerald" subtitleText={`Last ${period} days`} />
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
                      {human > 0 && <div className="bg-emerald-500" style={{ width: `${pct(human)}%` }} title={`Human: ${human}`} />}
                      {ai > 0 && <div className="bg-emerald-500" style={{ width: `${pct(ai)}%` }} title={`AI: ${ai}`} />}
                      {none > 0 && <div className="bg-gray-300" style={{ width: `${pct(none)}%` }} title={`Not captured: ${none}`} />}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs flex-wrap">
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Human replied <b className="text-gray-700">{formatNumber(human)}</b> ({pct(human).toFixed(0)}%)</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-400" />AI replied <b className="text-gray-700">{formatNumber(ai)}</b> ({pct(ai).toFixed(0)}%)</span>
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
                      tagType === t ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t === 'conversation' ? 'Conversation tags' : 'Customer tags'}
                  </button>
                ))}
              </div>
              {intents.length > 0 && (
                <button onClick={exportTags} title="Export CSV"
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-emerald-600 px-2 py-1 rounded-lg hover:bg-emerald-50">
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
                        style={{ width: `${(i.count / maxCount) * 100}%`, backgroundColor: (i.color || '#10b981') + '33', minWidth: '28px' }}>
                        <span className="text-[11px] font-bold" style={{ color: i.color || '#10b981' }}>{formatNumber(i.count)}</span>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 5: Top Customers + Daily Table ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Top Customers */}
        <div className="flex flex-col">
          <SectionLabel icon={Phone} label="Top Customers" color="text-green-600" bg="bg-green-50" />
          <div className="mt-4 flex-1 flex flex-col bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-800">Most Active — Last {period} Days</p>
              {topCustomers.length > 0 && (
                <button onClick={exportCustomers} title="Export CSV"
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-emerald-600 px-2 py-1 rounded-lg hover:bg-emerald-50">
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
              <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
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
                      <p className="text-sm font-bold text-emerald-600">{c.messageCount}</p>
                      <p className="text-xs text-gray-400">{c.conversationCount} conv</p>
                    </div>
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                      <div className="h-full bg-emerald-400 rounded-full"
                        style={{ width: `${(c.messageCount / (topCustomers[0]?.messageCount || 1)) * 100}%` }} />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Daily Breakdown */}
        <div className="flex flex-col">
          <SectionLabel icon={MessageSquare} label="Daily Breakdown" color="text-purple-600" bg="bg-purple-50" />
          <div className="mt-4 flex-1 flex flex-col bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-800">Last {period} Days</p>
            </div>
            {trends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <BarChart3 className="h-8 w-8 mb-2 text-gray-300" />
                <p className="text-sm">No data for this period</p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto min-h-0">
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
                          <td className="py-2.5 px-3 text-center text-sm font-semibold text-emerald-600">{day.humanHandled || 0}</td>
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
                      <td className="py-2.5 px-3 text-center text-sm font-bold text-emerald-600">{totalHuman}</td>
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

      {/* ── Agent first-response SLA drill-down ── */}
      {slaAgent && typeof document !== 'undefined' && createPortal(
        (() => {
          const a = slaAgent;
          const responded = (a.metSla ?? 0) + (a.breachedSla ?? 0);
          const pct = responded > 0 ? (a.metSla / responded) * 100 : 0;
          const Stat = ({ label, value, color = 'text-gray-900' }: { label: string; value: string; color?: string }) => (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          );
          return (
            <div className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center p-4" onClick={() => setSlaAgent(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-up" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                  <div>
                    <p className="text-base font-bold text-gray-900">{a.userName}</p>
                    <span className="text-xs text-gray-400">{a.role} · first-response SLA</span>
                  </div>
                  <button onClick={() => setSlaAgent(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {responded === 0 ? (
                    <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">No responded conversations in this period.</p>
                  ) : (
                    <div>
                      <div className="flex items-end justify-between mb-3">
                        <div>
                          <p className={`text-4xl font-extrabold ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{pct.toFixed(0)}%</p>
                          <p className="text-xs text-gray-400 mt-1">of {formatNumber(responded)} responded within SLA</p>
                        </div>
                        <div className="text-right text-xs text-gray-500 space-y-0.5">
                          <p><span className="font-bold text-green-600">{formatNumber(a.metSla)}</span> on time</p>
                          <p><span className="font-bold text-rose-600">{formatNumber(a.breachedSla)}</span> breached</p>
                        </div>
                      </div>
                      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                        <div className="bg-green-500" style={{ width: `${(a.metSla / responded) * 100}%` }} />
                        <div className="bg-rose-400" style={{ width: `${(a.breachedSla / responded) * 100}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Responded" value={formatNumber(responded)} />
                    <Stat label="Met SLA" value={formatNumber(a.metSla)} color="text-green-600" />
                    <Stat label="Breached" value={formatNumber(a.breachedSla)} color="text-rose-600" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Avg 1st reply" value={a.avgFirstResponseMinutes != null ? `${a.avgFirstResponseMinutes.toFixed(1)}m` : '—'} color="text-emerald-700" />
                    <Stat label="Assigned" value={formatNumber(a.totalConversations)} />
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
