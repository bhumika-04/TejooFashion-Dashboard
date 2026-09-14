'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { escalationsApi, escalationRulesApi, settingsApi, aiPromptsApi, aiBypassApi, teamEscalationPoliciesApi, usersApi } from '@/services/api';
import { AlertTriangle, CheckCircle, Clock, TrendingUp, Settings, Edit, Trash2, Bell, Zap, BrainCircuit, ShieldOff, Plus, Upload, Eye, EyeOff, ToggleLeft, ToggleRight, Users, ExternalLink, RefreshCw, UserCheck, ChevronDown, Search, Tag as TagIcon } from 'lucide-react';
import AutoTagManager from '@/components/AutoTagManager';
import { useRouter } from 'next/navigation';
import { FAB } from '@/components/ui/fab';
import { formatDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import EscalationRuleModal from '@/components/modals/EscalationRuleModal';
import { KPICard } from '@/components/ui/kpi-card';

export default function EscalationsPage() {
  const [escalations, setEscalations] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedEscalation, setSelectedEscalation] = useState<any>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [escalationMode, setEscalationMode] = useState('auto');
  const [confidenceThreshold, setConfidenceThreshold] = useState(50);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<any>(null);
  const { showToast } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<'escalations' | 'prompts' | 'bypass' | 'autotags'>('escalations');

  // AI Prompts tab state
  const [prompts, setPrompts] = useState<any[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<any>(null);
  const [editingText, setEditingText] = useState('');
  const [editingDesc, setEditingDesc] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState<number | null>(null);
  // Test AI Reply (dry-run preview)
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const runAiTest = async () => {
    if (!testMessage.trim() || testLoading) return;
    setTestLoading(true); setTestResult(null);
    try { const res = await aiPromptsApi.test(testMessage.trim()); setTestResult(res.data); }
    catch (e: any) { setTestResult({ error: e?.response?.data?.error || 'AI test failed' }); }
    finally { setTestLoading(false); }
  };

  // Bypass Numbers tab state
  const [bypassNumbers, setBypassNumbers] = useState<any[]>([]);
  const [bypassLoading, setBypassLoading] = useState(false);
  const [bypassPhone, setBypassPhone] = useState('');
  const [bypassName, setBypassName] = useState('');
  const [bypassReason, setBypassReason] = useState('');
  const [bypassType, setBypassType] = useState<'customer' | 'internal'>('customer');
  const [bypassAdding, setBypassAdding] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  // Enhanced escalations state
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<'all'|'High'|'Normal'|'Low'>('all');
  const [searchEsc, setSearchEsc] = useState('');
  const [selectedEscIds, setSelectedEscIds] = useState<Set<number>>(new Set());
  const [bulkResolving, setBulkResolving] = useState(false);
  const [quickNotes, setQuickNotes] = useState<Record<number, string>>({});
  const [savingNote, setSavingNote] = useState<number | null>(null);
  const [reassignEscId, setReassignEscId] = useState<number | null>(null);
  const [markingInProgress, setMarkingInProgress] = useState<number | null>(null);

  // Team Escalation Policies state
  const [teamPolicies, setTeamPolicies] = useState<any[]>([]);
  const [teamPoliciesLoading, setTeamPoliciesLoading] = useState(false);
  const [savingTeamId, setSavingTeamId] = useState<number | null>(null);

  // Calculate stats
  const totalEscalations = escalations.length;
  const pendingEscalations = escalations.filter(e => e.status === 'Pending').length;
  const inProgressEscalations = escalations.filter(e => e.status === 'InProgress').length;
  const resolvedToday = escalations.filter(e => {
    if (e.status !== 'Resolved' || !e.resolvedAt) return false;
    const today = new Date();
    const resolvedDate = new Date(e.resolvedAt);
    return resolvedDate.toDateString() === today.toDateString();
  }).length;
  const resolvedWithTimes = escalations.filter(e => e.status === 'Resolved' && e.resolvedAt && e.escalatedAt);
  const avgResolutionTime = resolvedWithTimes.length > 0
    ? Math.round(
        resolvedWithTimes.reduce((sum, e) => {
          const mins = (new Date(e.resolvedAt).getTime() - new Date(e.escalatedAt).getTime()) / 60000;
          return sum + mins;
        }, 0) / resolvedWithTimes.length
      )
    : 0;
  const highPriorityEscalations = escalations.filter(e => e.priority === 'High' && e.status !== 'Resolved').length;

  useEffect(() => {
    loadEscalations();
    loadRules();
    loadPolicy();
    loadTeamPolicies();
    usersApi.getAll().then(r => setUsers(r.data ?? [])).catch(() => {});
    // Auto-refresh escalations every 30s
    const interval = setInterval(() => loadEscalations(), 30_000);
    return () => clearInterval(interval);
  }, []);

  const loadTeamPolicies = async () => {
    setTeamPoliciesLoading(true);
    try { const r = await teamEscalationPoliciesApi.getAll(); setTeamPolicies(r.data ?? []); }
    catch { /* non-critical */ }
    finally { setTeamPoliciesLoading(false); }
  };

  const handleSaveTeamPolicy = async (teamId: number, policy: any) => {
    setSavingTeamId(teamId);
    try {
      await teamEscalationPoliciesApi.upsert(teamId, {
        crrTimeoutMinutes:     Number(policy.policy.crrTimeoutMinutes),
        managerTimeoutMinutes: Number(policy.policy.managerTimeoutMinutes),
        hodTimeoutMinutes:     Number(policy.policy.hodTimeoutMinutes),
        isActive:              policy.policy.isActive,
      });
      showToast(`Policy saved for ${policy.teamName}`, 'success');
    } catch { showToast('Failed to save policy', 'error'); }
    finally { setSavingTeamId(null); }
  };

  useEffect(() => {
    if (activeTab === 'prompts' && prompts.length === 0) loadPrompts();
    if (activeTab === 'bypass' && bypassNumbers.length === 0) loadBypass();
  }, [activeTab]);

  const loadPrompts = async () => {
    setPromptsLoading(true);
    try { const r = await aiPromptsApi.getAll(); setPrompts(r.data ?? []); }
    catch { showToast('Failed to load prompts', 'error'); }
    finally { setPromptsLoading(false); }
  };

  const loadBypass = async () => {
    setBypassLoading(true);
    try { const r = await aiBypassApi.getAll(); setBypassNumbers(r.data ?? []); }
    catch { showToast('Failed to load bypass list', 'error'); }
    finally { setBypassLoading(false); }
  };

  const handleSavePrompt = async () => {
    if (!editingPrompt) return;
    setPromptSaving(true);
    try {
      await aiPromptsApi.update(editingPrompt.id, { systemPrompt: editingText, description: editingDesc });
      setPrompts(prev => prev.map(p => p.id === editingPrompt.id ? { ...p, systemPrompt: editingText, description: editingDesc } : p));
      setEditingPrompt(null);
      showToast('Prompt updated', 'success');
    } catch { showToast('Failed to save prompt', 'error'); }
    finally { setPromptSaving(false); }
  };

  const handleTogglePrompt = async (prompt: any) => {
    try {
      await aiPromptsApi.toggle(prompt.id, !prompt.isActive);
      setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, isActive: !p.isActive } : p));
    } catch { showToast('Failed to toggle prompt', 'error'); }
  };

  const handleAddBypass = async () => {
    if (!bypassPhone.trim()) { showToast('Enter a phone number', 'error'); return; }
    setBypassAdding(true);
    try {
      await aiBypassApi.add({ phone: bypassPhone, name: bypassName, reason: bypassReason, type: bypassType });
      showToast('Number added to bypass list', 'success');
      setBypassPhone(''); setBypassName(''); setBypassReason('');
      loadBypass();
    } catch { showToast('Failed to add number', 'error'); }
    finally { setBypassAdding(false); }
  };

  const handleBulkUpload = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { showToast('Enter at least one number', 'error'); return; }
    setBulkUploading(true);
    try {
      const entries = lines.map(line => {
        const parts = line.split(',');
        return { phone: parts[0]?.trim(), name: parts[1]?.trim() || undefined, type: (parts[2]?.trim() || bypassType) as string };
      });
      const res = await aiBypassApi.bulkAdd(entries);
      showToast(`${res.data.added} numbers added`, 'success');
      setBulkText(''); setShowBulkPanel(false);
      loadBypass();
    } catch { showToast('Bulk upload failed', 'error'); }
    finally { setBulkUploading(false); }
  };

  const handleDeleteBypass = async (id: number) => {
    try {
      await aiBypassApi.delete(id);
      setBypassNumbers(prev => prev.filter(b => b.id !== id));
      showToast('Removed from bypass list', 'success');
    } catch { showToast('Failed to remove', 'error'); }
  };

  const handleToggleBypass = async (item: any) => {
    try {
      await aiBypassApi.toggle(item.id, !item.isActive);
      setBypassNumbers(prev => prev.map(b => b.id === item.id ? { ...b, isActive: !b.isActive } : b));
    } catch { showToast('Failed to toggle', 'error'); }
  };

  const loadPolicy = async () => {
    setPolicyLoading(true);
    try {
      const res = await settingsApi.getEscalationPolicy();
      setEscalationMode(res.data.mode ?? 'auto');
      setConfidenceThreshold(res.data.confidenceThreshold ?? 50);
    } catch {
      // non-critical — keep defaults
    } finally {
      setPolicyLoading(false);
    }
  };

  const savePolicy = async () => {
    setPolicySaving(true);
    try {
      await settingsApi.updateEscalationPolicy(escalationMode, confidenceThreshold);
      showToast('Policy saved', 'success');
    } catch {
      showToast('Failed to save policy', 'error');
    } finally {
      setPolicySaving(false);
    }
  };

  const loadEscalations = async () => {
    try {
      const response = await escalationsApi.getAll();
      setEscalations(response.data);
    } catch {
      showToast('Failed to load escalations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async () => {
    try {
      const response = await escalationRulesApi.getAll();
      setRules(response.data);
    } catch {
      showToast('Failed to load escalation rules', 'error');
    } finally {
      setRulesLoading(false);
    }
  };

  const handleResolveClick = (escalation: any) => {
    setSelectedEscalation(escalation);
    setResolutionNotes('');
    setResolveDialogOpen(true);
  };

  const handleResolveSubmit = async () => {
    if (!selectedEscalation) return;
    setSubmitting(true);
    try {
      await escalationsApi.resolve(selectedEscalation.id, resolutionNotes);
      showToast('Escalation resolved successfully', 'success');
      loadEscalations();
      setResolveDialogOpen(false);
      setSelectedEscalation(null);
      setResolutionNotes('');
    } catch {
      showToast('Failed to resolve escalation', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddRule = () => {
    setSelectedRule(null);
    setRuleModalOpen(true);
  };

  const handleEditRule = (rule: any) => {
    setSelectedRule(rule);
    setRuleModalOpen(true);
  };

  const handleDeleteRuleClick = (rule: any) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeleteRule = async () => {
    if (!ruleToDelete) return;
    try {
      await escalationRulesApi.delete(ruleToDelete.id);
      showToast('Rule deleted successfully', 'success');
      loadRules();
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    } catch {
      showToast('Failed to delete rule', 'error');
    }
  };

  const handleToggleRule = async (id: number, isActive: boolean) => {
    try {
      await escalationRulesApi.toggleActive(id, isActive);
      showToast(`Rule ${isActive ? 'activated' : 'deactivated'} successfully`, 'success');
      loadRules();
    } catch {
      showToast('Failed to toggle rule', 'error');
    }
  };

  const handleRuleSubmit = async (data: any) => {
    try {
      if (selectedRule) {
        await escalationRulesApi.update(selectedRule.id, data);
        showToast('Rule updated successfully', 'success');
      } else {
        await escalationRulesApi.create(data);
        showToast('Rule created successfully', 'success');
      }
      loadRules();
    } catch (err) {
      showToast('Failed to save rule', 'error');
      throw err;
    }
  };

  const handleNotificationToggle = async (rule: any, field: 'notifyDashboard' | 'notifyEmail' | 'notifySMS', value: boolean) => {
    try {
      const updateData = {
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        isActive: rule.isActive,
        conditionThreshold: rule.conditionThreshold,
        conditionKeywords: rule.conditionKeywords,
        assigneeTeam: rule.assigneeTeam,
        assigneeUserId: rule.assigneeUserId,
        notifyDashboard: field === 'notifyDashboard' ? value : rule.notifyDashboard,
        notifyEmail: field === 'notifyEmail' ? value : rule.notifyEmail,
        notifySMS: field === 'notifySMS' ? value : rule.notifySMS,
      };
      await escalationRulesApi.update(rule.id, updateData);
      loadRules();
    } catch {
      showToast('Failed to update notification settings', 'error');
    }
  };

  const handleMarkInProgress = async (esc: any) => {
    setMarkingInProgress(esc.id);
    try {
      await escalationsApi.updateStatus(esc.id, 'InProgress');
      await loadEscalations();
      showToast('Marked as In Progress', 'success');
    } catch { showToast('Failed to update', 'error'); }
    finally { setMarkingInProgress(null); }
  };

  const handleReassign = async (escId: number, newUserId: number, newUserName: string) => {
    try {
      await escalationsApi.reassign(escId, newUserId);
      setReassignEscId(null);
      await loadEscalations();
      showToast(`Reassigned to ${newUserName}`, 'success');
    } catch { showToast('Failed to reassign', 'error'); }
  };

  const handleBulkResolve = async () => {
    if (selectedEscIds.size === 0) return;
    setBulkResolving(true);
    try {
      await Promise.all([...selectedEscIds].map(id =>
        escalationsApi.resolve(id, 'Bulk resolved by admin')
      ));
      showToast(`${selectedEscIds.size} escalation(s) resolved`, 'success');
      setSelectedEscIds(new Set());
      await loadEscalations();
    } catch { showToast('Bulk resolve failed', 'error'); }
    finally { setBulkResolving(false); }
  };

  const handleSaveNote = async (escId: number) => {
    const note = quickNotes[escId];
    if (!note?.trim()) return;
    setSavingNote(escId);
    try {
      // Resolve with the note as resolution notes
      await escalationsApi.resolve(escId, note);
      showToast('Note saved & escalation resolved', 'success');
      setQuickNotes(prev => { const n = { ...prev }; delete n[escId]; return n; });
      await loadEscalations();
    } catch { showToast('Failed to save note', 'error'); }
    finally { setSavingNote(null); }
  };

  // Agent workload: count open escalations per assigned user
  const agentWorkload = escalations
    .filter(e => e.status !== 'Resolved')
    .reduce((acc: Record<string, number>, e) => {
      const name = e.escalatedToUserName || 'Unassigned';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});

  const getSlaInfo = (esc: any) => {
    if (esc.status === 'Resolved') return null;
    // Prefer an active escalation chain; fall back to any configured policy.
    // (Single-team setups resolve unambiguously; the backend timeout service is the source of truth per team.)
    const policy = teamPolicies.find((p: any) => p.policy?.isActive) ?? teamPolicies.find((p: any) => p.policy);
    if (!policy) return null;
    const level = esc.escalationLevel ?? 1;
    const timeout = level === 1 ? policy.policy.crrTimeoutMinutes
                  : level === 2 ? policy.policy.managerTimeoutMinutes
                  : policy.policy.hodTimeoutMinutes;
    const elapsed = Math.floor((Date.now() - new Date(esc.lastEscalatedAt ?? esc.escalatedAt).getTime()) / 60_000);
    const remaining = timeout - elapsed;
    return { remaining, timeout, elapsed, breached: remaining <= 0 };
  };

  // Minutes → "Xm" / "Xh Ym" / "Xd Yh" so long overdue times read as days, not huge minutes
  const fmtMins = (m: number) => {
    m = Math.round(m);
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  };

  const LEVEL_LABELS: Record<number, { label: string; color: string }> = {
    1: { label: 'CRR',     color: 'bg-blue-100 text-blue-700'   },
    2: { label: 'Manager', color: 'bg-amber-100 text-amber-700' },
    3: { label: 'HOD',     color: 'bg-red-100 text-red-700'     },
  };

  const filteredEscalations = escalations.filter((esc) => {
    const statusMatch = filter === 'all' || esc.status.toLowerCase() === filter;
    const priorityMatch = priorityFilter === 'all' || esc.priority === priorityFilter;
    const q = searchEsc.toLowerCase();
    const searchMatch = !q ||
      esc.customerPhone?.includes(q) ||
      esc.customerName?.toLowerCase().includes(q) ||
      esc.escalatedToUserName?.toLowerCase().includes(q) ||
      esc.reason?.toLowerCase().includes(q);
    return statusMatch && priorityMatch && searchMatch;
  });

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'High':
        return 'bg-red-100 text-red-700 border-red-200 border';
      case 'Normal':
        return 'bg-orange-100 text-orange-700 border-orange-200 border';
      case 'Low':
        return 'bg-gray-100 text-gray-700 border-gray-200 border';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200 border';
    }
  };

  const INTENT_COLORS: Record<string, string> = {
    router:              'bg-slate-100 text-slate-700',
    general_query:       'bg-blue-100 text-blue-700',
    follow_up:           'bg-emerald-100 text-emerald-700',
    order_status:        'bg-green-100 text-green-700',
    payment_outstanding: 'bg-amber-100 text-amber-700',
    dispatch_info:       'bg-orange-100 text-orange-700',
    credit_limit:        'bg-purple-100 text-purple-700',
  };

  const INTENT_LABEL: Record<string, string> = {
    router:              'Master Router',
    general_query:       'General Query',
    follow_up:           'Follow-Up',
    order_status:        'Order Status',
    payment_outstanding: 'Payment / Outstanding',
    dispatch_info:       'Dispatch & Tracking',
    credit_limit:        'Credit Limit',
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-beige min-h-screen">


      {/* ── AUTO-TAGS TAB ────────────────────────────────────── */}
      {activeTab === 'autotags' && <AutoTagManager />}

      {/* ── AI PROMPTS TAB ───────────────────────────────────── */}
      {activeTab === 'prompts' && (
        <div className="space-y-4">
          {/* Test AI Reply — runs the real router→specialist pipeline; nothing is sent */}
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <BrainCircuit className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">Test AI Reply</h3>
              <span className="text-[11px] text-gray-400">preview only — nothing is sent to the customer</span>
            </div>
            <div className="flex gap-2">
              <input
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runAiTest(); }}
                placeholder="Type a customer message, e.g. What is the wholesale price per piece?"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
              />
              <button
                disabled={!testMessage.trim() || testLoading}
                onClick={runAiTest}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 active:scale-95 transition disabled:opacity-50"
              >
                {testLoading ? 'Running…' : 'Test'}
              </button>
            </div>
            {testResult && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-sm">
                {testResult.error ? (
                  <p className="text-red-600">{testResult.error}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">intent: {testResult.intent ?? '—'}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">confidence: {testResult.confidence != null ? `${Math.round(testResult.confidence * 100)}%` : '—'}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        testResult.decision === 'send' ? 'bg-green-50 text-green-700'
                        : testResult.decision === 'escalate' ? 'bg-amber-50 text-amber-700'
                        : 'bg-gray-100 text-gray-500'}`}>
                        {testResult.decision === 'send' ? '✅ would auto-send' : testResult.decision === 'escalate' ? '⚠ would escalate to human' : 'no reply'}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-gray-800">{testResult.reply || '(no reply text)'}</p>
                  </>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-gray-400 mb-4">7 intent-specific prompts. Click Edit to modify the system prompt for any intent. Inactive prompts fall back to general_query.</p>
          {promptsLoading ? (
            <div className="space-y-3">{Array.from({length:7}).map((_,i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
          ) : prompts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <BrainCircuit className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No prompts found. Run the seed SQL to populate AI prompts.</p>
            </div>
          ) : (
            // Sort: router first, then alphabetical
            [...prompts].sort((a,b) => a.promptKey === 'router' ? -1 : b.promptKey === 'router' ? 1 : a.promptKey.localeCompare(b.promptKey))
            .map(prompt => (
              <div key={prompt.id} className={`rounded-2xl border ${prompt.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'} bg-white shadow-sm`}>
                {/* Header row */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${INTENT_COLORS[prompt.promptKey] ?? 'bg-gray-100 text-gray-600'}`}>
                      {INTENT_LABEL[prompt.promptKey] ?? prompt.promptKey}
                    </span>
                    {prompt.promptType === 'router' && (
                      <span className="text-[10px] bg-slate-200 text-slate-600 font-semibold px-2 py-0.5 rounded-full">ROUTER</span>
                    )}
                    {!prompt.isActive && <span className="text-[10px] bg-red-100 text-red-500 font-semibold px-2 py-0.5 rounded-full">INACTIVE</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setExpandedPrompt(expandedPrompt === prompt.id ? null : prompt.id)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      {expandedPrompt === prompt.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {expandedPrompt === prompt.id ? 'Hide' : 'Preview'}
                    </button>
                    <button onClick={() => handleTogglePrompt(prompt)}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        prompt.isActive ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }`}>
                      {prompt.isActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                      {prompt.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button onClick={() => { setEditingPrompt(prompt); setEditingText(prompt.systemPrompt ?? ''); setEditingDesc(prompt.description ?? ''); }}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors">
                      <Edit className="h-3.5 w-3.5" /> Edit
                    </button>
                  </div>
                </div>
                {/* Description */}
                {prompt.description && (
                  <p className="text-xs text-gray-400 px-5 pb-2 -mt-2">{prompt.description}</p>
                )}
                {/* Preview */}
                {expandedPrompt === prompt.id && (
                  <div className="mx-5 mb-4 bg-gray-50 rounded-xl border border-gray-100 p-4">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                      {prompt.systemPrompt}
                    </pre>
                  </div>
                )}
                {/* Inline editor */}
                {editingPrompt?.id === prompt.id && (
                  <div className="mx-5 mb-4 border border-emerald-200 rounded-xl overflow-hidden">
                    <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-100">
                      <p className="text-xs font-semibold text-emerald-700">Editing: {INTENT_LABEL[prompt.promptKey]}</p>
                    </div>
                    <div className="p-4 space-y-3 bg-white">
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Description</label>
                        <input value={editingDesc} onChange={e => setEditingDesc(e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">System Prompt</label>
                        <textarea value={editingText} onChange={e => setEditingText(e.target.value)}
                          rows={18}
                          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono resize-y" />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={handleSavePrompt} disabled={promptSaving}
                          className="px-4 py-2 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50">
                          {promptSaving ? 'Saving…' : 'Save Prompt'}
                        </button>
                        <button onClick={() => setEditingPrompt(null)}
                          className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── BYPASS NUMBERS TAB ───────────────────────────────── */}
      {activeTab === 'bypass' && (
        <div className="space-y-5">
          <p className="text-sm text-gray-400">Numbers on this list receive messages normally but AI auto-reply is skipped. Use for internal team WhatsApp numbers and customers who prefer human-only support.</p>

          {/* Add single number */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-600" /> Add Number
              </h3>
              <button onClick={() => setShowBulkPanel(v => !v)}
                className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 px-3 py-1.5 border border-emerald-200 rounded-lg hover:bg-emerald-50">
                <Upload className="h-3.5 w-3.5" /> Bulk Upload
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input value={bypassPhone} onChange={e => setBypassPhone(e.target.value)}
                placeholder="+91 98765 43210" onKeyDown={e => e.key === 'Enter' && handleAddBypass()}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              <input value={bypassName} onChange={e => setBypassName(e.target.value)}
                placeholder="Name (optional)"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              <input value={bypassReason} onChange={e => setBypassReason(e.target.value)}
                placeholder="Reason (optional)"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              <div className="flex gap-2">
                <select value={bypassType} onChange={e => setBypassType(e.target.value as any)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white">
                  <option value="customer">Customer</option>
                  <option value="internal">Internal Team</option>
                </select>
                <button onClick={handleAddBypass} disabled={bypassAdding}
                  className="px-4 py-2 bg-emerald-100 text-emerald-700 text-sm rounded-lg hover:bg-emerald-200 disabled:opacity-50 whitespace-nowrap">
                  {bypassAdding ? '…' : 'Add'}
                </button>
              </div>
            </div>

            {/* Bulk upload panel */}
            {showBulkPanel && (
              <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                <p className="text-xs text-gray-500">
                  Paste one number per line. Format: <code className="bg-gray-100 px-1 rounded">+919876543210</code> or <code className="bg-gray-100 px-1 rounded">+919876543210, Name, internal</code>
                </p>
                <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
                  rows={6} placeholder={'+919876543210\n+918800061841, Rajeev Kumar, internal\n+917000090823, VIP Customer, customer'}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono resize-none" />
                <div className="flex gap-2">
                  <button onClick={handleBulkUpload} disabled={bulkUploading}
                    className="px-4 py-2 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50">
                    {bulkUploading ? 'Uploading…' : 'Upload All'}
                  </button>
                  <button onClick={() => setShowBulkPanel(false)}
                    className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bypass list */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Bypass Numbers ({bypassNumbers.length})
              </h3>
              <div className="flex gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Customer</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Internal</span>
              </div>
            </div>
            {bypassLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : bypassNumbers.length === 0 ? (
              <div className="p-8 text-center">
                <ShieldOff className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No bypass numbers yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-5 py-2">Phone</th>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Reason</th>
                    <th className="text-center px-4 py-2">Type</th>
                    <th className="text-center px-4 py-2">Status</th>
                    <th className="text-center px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bypassNumbers.map(item => (
                    <tr key={item.id} className={`hover:bg-gray-50/50 ${!item.isActive ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${item.type === 'internal' ? 'bg-emerald-400' : 'bg-orange-400'}`} />
                          <span className="font-mono text-sm font-medium text-gray-900">{item.phone}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{item.reason || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          item.type === 'internal' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {item.type === 'internal' ? 'Internal' : 'Customer'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleToggleBypass(item)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${item.isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${item.isActive ? 'translate-x-4' : 'translate-x-1'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleDeleteBypass(item.id)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-500 mx-auto transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ESCALATIONS TAB ──────────────────────────────────── */}
      {activeTab === 'escalations' && <>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6 lg:mb-8 items-stretch">
        <KPICard index={0} title="Total Escalations" value={totalEscalations}
          icon={AlertTriangle} theme="orange"
          subtitleText={`${pendingEscalations} pending · ${inProgressEscalations} active`} />
        <KPICard index={1} title="Pending" value={pendingEscalations}
          icon={Clock} theme="amber" subtitleText="Awaiting agent response" />
        <KPICard index={2} title="In Progress" value={inProgressEscalations}
          icon={TrendingUp} theme="blue" subtitleText="Actively being handled" />
        <KPICard index={3} title="Resolved Today" value={resolvedToday}
          icon={CheckCircle} theme="green" subtitleText="Closed in last 24 hours" />
        <KPICard index={4} title="Avg Resolution" value={`${avgResolutionTime}m`}
          icon={Clock} theme="emerald" subtitleText="Minutes to resolve" />
        <KPICard index={5} title="High Priority" value={highPriorityEscalations}
          icon={Zap} theme="rose" subtitleText="Needs immediate attention" />
      </div>

      {/* Escalation Policy Section */}
      <Card className="mb-6 lg:mb-8 border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-orange-50 flex items-center justify-center">
              <Settings className="h-3.5 w-3.5 text-orange-600" />
            </div>
            <CardTitle className="text-sm font-semibold text-gray-800">Escalation Policy</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-6">
            {/* Escalation Mode */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-3 block">
                Escalation Mode
              </label>
              <div className="flex gap-3">
                <Button
                  variant={escalationMode === 'auto' ? 'default' : 'outline'}
                  onClick={() => setEscalationMode('auto')}
                  className={escalationMode === 'auto' ? 'bg-emerald-200 hover:bg-emerald-300 font-semibold' : ''}
                >
                  Auto
                </Button>
                <Button
                  variant={escalationMode === 'manual' ? 'default' : 'outline'}
                  onClick={() => setEscalationMode('manual')}
                  className={escalationMode === 'manual' ? 'bg-emerald-200 hover:bg-emerald-300 font-semibold' : ''}
                >
                  Manual
                </Button>
                <Button
                  variant={escalationMode === 'hybrid' ? 'default' : 'outline'}
                  onClick={() => setEscalationMode('hybrid')}
                  className={escalationMode === 'hybrid' ? 'bg-emerald-200 hover:bg-emerald-300 font-semibold' : ''}
                >
                  Hybrid
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {escalationMode === 'auto' && 'AI automatically escalates conversations based on confidence threshold and rules'}
                {escalationMode === 'manual' && 'Human agents manually trigger escalations when needed'}
                {escalationMode === 'hybrid' && 'Combines automatic escalation with manual override capability'}
              </p>
            </div>

            {/* AI Confidence Threshold */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">
                  Global AI Confidence Threshold
                </label>
                <span className="text-2xl font-bold text-emerald-700">{confidenceThreshold}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Conversations with AI confidence below {confidenceThreshold}% will be escalated to human agents
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={savePolicy}
                disabled={policySaving || policyLoading}
                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-sm px-5"
              >
                {policySaving ? 'Saving…' : 'Save Policy'}
              </Button>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Escalation Rules Section */}
      <Card className="mb-6 lg:mb-8 border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-purple-50 flex items-center justify-center">
                <AlertTriangle className="h-3.5 w-3.5 text-purple-600" />
              </div>
              <CardTitle className="text-sm font-semibold text-gray-800">Escalation Rules</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {rulesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="skeleton h-4 w-36 rounded" />
                      <div className="skeleton h-3 w-56 rounded" />
                    </div>
                    <div className="skeleton h-6 w-11 rounded-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="skeleton h-14 rounded-xl" />
                    <div className="skeleton h-14 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule, idx) => {
                const delays = ['delay-75','delay-150','delay-225'];
                return (
                <div key={rule.id} className={`group border rounded-xl p-4 transition-all duration-300
                  hover:shadow-md hover:-translate-y-px animate-fade-up ${delays[idx % 3]} ${
                  rule.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/50'
                }`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                        <h4 className={`font-semibold text-sm ${rule.isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                          {rule.name}
                        </h4>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getPriorityBadge(rule.priority)}`}>
                          {rule.priority}
                        </span>
                        {rule.ruleType && rule.ruleType !== 'Custom' && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                            {rule.ruleType.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{rule.description}</p>
                    </div>
                    {/* Toggle switch */}
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
                      <input type="checkbox" className="sr-only peer" checked={rule.isActive}
                        onChange={(e) => handleToggleRule(rule.id, e.target.checked)} />
                      <div className="w-10 h-5 bg-gray-200 rounded-full peer
                        peer-checked:bg-emerald-500
                        after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                        after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all
                        peer-checked:after:translate-x-5
                        transition-colors duration-200" />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Assignee</p>
                      <p className="text-sm font-semibold text-gray-900 truncate">{rule.assigneeTeam}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Conditions</p>
                      <p className="text-sm font-semibold text-gray-700 truncate">
                        {rule.conditionThreshold ? `Threshold: ${rule.conditionThreshold}` :
                         rule.conditionKeywords  ? rule.conditionKeywords.split(',').slice(0,2).join(', ') :
                         'None'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-gray-50">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer hover:text-gray-700 transition-colors">
                        <input type="checkbox" checked={rule.notifyDashboard}
                          onChange={(e) => handleNotificationToggle(rule, 'notifyDashboard', e.target.checked)}
                          className="rounded border-gray-300 accent-emerald-700" />
                        <Bell className="h-3.5 w-3.5" />
                        Dashboard
                      </label>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleEditRule(rule)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200
                          rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 active:scale-95 transition-all duration-150">
                        <Edit className="h-3 w-3" />Edit
                      </button>
                      <button onClick={() => handleDeleteRuleClick(rule)}
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-red-50 text-red-500
                          hover:bg-red-100 active:scale-95 transition-all duration-150">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}

              {rules.length === 0 && (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No escalation rules configured
                  </h3>
                  <p className="text-gray-600">Tap the <strong>+</strong> button below to create your first rule</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Agent Workload Analytics ── */}
      {Object.keys(agentWorkload).length > 0 && (
        <Card className="border-gray-100 shadow-sm mb-6">
          <CardHeader className="border-b border-gray-100 py-3">
            <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              Open Escalations by Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2.5">
              {Object.entries(agentWorkload)
                .sort(([,a],[,b]) => b - a)
                .map(([name, count]) => {
                  const max = Math.max(...Object.values(agentWorkload) as number[]);
                  const pct = Math.round(((count as number) / max) * 100);
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <div className="w-24 text-xs font-medium text-gray-700 truncate flex-shrink-0">{name}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full bg-amber-500 transition-all duration-500"
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-xs font-bold w-6 text-right ${
                        (count as number) >= 3 ? 'text-red-600' : (count as number) >= 2 ? 'text-amber-600' : 'text-gray-500'
                      }`}>{count as number}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Team Escalation Policies ── */}
      <Card className="border-gray-100 shadow-sm mb-6">
        <CardHeader className="border-b border-gray-100 py-4">
          <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            Team Escalation Chains
          </CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            AI escalates to CRR → if no reply in X min → Manager → if no reply → HOD. Configure per-team timeouts below.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {teamPoliciesLoading ? (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({length:3}).map((_,i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
            </div>
          ) : teamPolicies.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No teams configured. Add teams first.</div>
          ) : (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {teamPolicies.map((item: any) => {
                const steps = [
                  { label: 'AI',      ring: 'border-purple-400', fill: 'bg-purple-500', text: 'text-purple-700', field: null as string | null },
                  { label: 'CRR',     ring: 'border-blue-400',   fill: 'bg-blue-500',   text: 'text-blue-700',   field: 'crrTimeoutMinutes'     },
                  { label: 'Manager', ring: 'border-amber-400',  fill: 'bg-amber-500',  text: 'text-amber-700',  field: 'managerTimeoutMinutes' },
                  { label: 'HOD',     ring: 'border-rose-400',   fill: 'bg-rose-500',   text: 'text-rose-700',   field: 'hodTimeoutMinutes'     },
                ];
                return (
                  <div key={item.teamId}
                    className={`group rounded-3xl border p-6 transition-all duration-300 ${item.policy.isActive ? 'border-gray-200 bg-white shadow-md hover:shadow-xl hover:-translate-y-1' : 'border-gray-100 bg-gray-50/60 opacity-70'}`}>

                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-11 w-11 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <Users className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-bold text-gray-900 truncate">{item.teamName}</p>
                          <p className="text-xs text-gray-400">{item.policy.isActive ? 'Escalation chain active' : 'Chain paused'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setTeamPolicies(prev => prev.map(t =>
                          t.teamId === item.teamId ? { ...t, policy: { ...t.policy, isActive: !t.policy.isActive } } : t
                        ))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${item.policy.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${item.policy.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    {/* Escalation timeline — dots + connecting line, inline editable timeouts */}
                    <div className="relative mb-6">
                      {/* connecting line behind the dots (inset to first/last dot centres) */}
                      <div className="absolute top-[18px] left-[12.5%] right-[12.5%] h-1 rounded-full bg-gray-200" />
                      <div className="relative flex justify-between">
                        {steps.map(step => (
                          <div key={step.label} className="flex flex-col items-center gap-2 flex-1 min-w-0 px-0.5">
                            <div className={`relative z-10 h-10 w-10 rounded-full bg-white border-[3px] ${step.ring} flex items-center justify-center shadow-sm`}>
                              <span className={`h-4 w-4 rounded-full ${step.fill}`} />
                            </div>
                            <span className={`text-xs font-bold ${step.text}`}>{step.label}</span>
                            {step.field ? (
                              <div className="flex items-center gap-0.5 max-w-full bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1 focus-within:ring-2 focus-within:ring-emerald-300 focus-within:border-emerald-300 transition">
                                <input
                                  type="number" min={1}
                                  value={item.policy[step.field]}
                                  onChange={e => setTeamPolicies(prev => prev.map(t =>
                                    t.teamId === item.teamId ? { ...t, policy: { ...t.policy, [step.field!]: e.target.value } } : t
                                  ))}
                                  className="w-8 text-center text-xs sm:text-sm font-bold bg-transparent focus:outline-none text-gray-800 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <span className="text-[9px] text-gray-400 font-medium">min</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400 font-medium mt-1.5">immediate</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Save button */}
                    <button
                      onClick={() => handleSaveTeamPolicy(item.teamId, item)}
                      disabled={savingTeamId === item.teamId}
                      className="w-full py-2.5 text-sm font-semibold bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm"
                    >
                      {savingTeamId === item.teamId ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Escalations Section */}
      <Card className="border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <CardTitle className="text-sm font-semibold text-gray-800">Active Escalations</CardTitle>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                {escalations.filter(e => e.status !== 'Resolved').length} open
              </span>
            </div>
            <span className="text-xs text-gray-400">Auto-refreshes every 30s</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="px-4 pt-4 pb-0 space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input value={searchEsc} onChange={e => setSearchEsc(e.target.value)}
                placeholder="Search by customer, agent, or reason…"
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
            </div>
            {/* Filters + Bulk */}
            <div className="flex items-center gap-2 flex-wrap">
              <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}
                className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 cursor-pointer">
                <option value="all">All ({escalations.length})</option>
                <option value="pending">Pending ({escalations.filter(e => e.status === 'Pending').length})</option>
                <option value="inprogress">In Progress ({escalations.filter(e => e.status === 'InProgress').length})</option>
                <option value="resolved">Resolved ({escalations.filter(e => e.status === 'Resolved').length})</option>
              </select>
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as any)}
                className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 cursor-pointer">
                <option value="all">All Priorities</option>
                <option value="High">🔴 High</option>
                <option value="Normal">🟡 Normal</option>
                <option value="Low">⚪ Low</option>
              </select>
              {/* Bulk actions */}
              {selectedEscIds.size > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-gray-500">{selectedEscIds.size} selected</span>
                  <button onClick={handleBulkResolve} disabled={bulkResolving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50">
                    <CheckCircle className="h-3.5 w-3.5" />
                    {bulkResolving ? 'Resolving…' : `Resolve All (${selectedEscIds.size})`}
                  </button>
                  <button onClick={() => setSelectedEscIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">
                    Clear
                  </button>
                </div>
              )}
              <button onClick={loadEscalations} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 ml-auto">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="skeleton h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <div className="skeleton h-3.5 w-32 rounded" />
                        <div className="skeleton h-3 w-24 rounded" />
                      </div>
                    </div>
                    <div className="skeleton h-6 w-20 rounded-full" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[0,1,2].map(j => <div key={j} className="skeleton h-14 rounded-lg" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {filteredEscalations.map((esc, idx) => {
                const delays = ['delay-75','delay-150','delay-225','delay-300'];
                return (
                <div key={esc.id} className={`group border rounded-xl p-4 bg-white
                  hover:shadow-lg hover:-translate-y-px transition-all duration-300 animate-fade-up ${delays[idx % 4]}
                  ${selectedEscIds.has(esc.id) ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-100'}`}>
                  {/* Select checkbox */}
                  {esc.status !== 'Resolved' && (
                    <div className="flex items-center gap-2 mb-2">
                      <input type="checkbox"
                        checked={selectedEscIds.has(esc.id)}
                        onChange={e => setSelectedEscIds(prev => {
                          const next = new Set(prev);
                          e.target.checked ? next.add(esc.id) : next.delete(esc.id);
                          return next;
                        })}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-[10px] text-gray-400">Select for bulk action</span>
                    </div>
                  )}
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-105 ${esc.priority === 'High' ? 'bg-red-50' : 'bg-amber-50'}`}>
                        <AlertTriangle className={`h-5 w-5 ${esc.priority === 'High' ? 'text-red-500' : 'text-amber-600'}`} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-gray-900 text-sm truncate">
                          {esc.customerPhone}
                          {esc.customerName && <span className="font-normal text-gray-500 ml-1.5">· {esc.customerName}</span>}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <button onClick={() => router.push(`/dashboard/conversations?id=${esc.conversationId}`)}
                            className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-0.5">
                            Conv #{esc.conversationId} <ExternalLink className="h-3 w-3" />
                          </button>
                          {/* Escalation Level badge */}
                          {esc.escalationLevel && LEVEL_LABELS[esc.escalationLevel] && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${LEVEL_LABELS[esc.escalationLevel].color}`}>
                              L{esc.escalationLevel} · {LEVEL_LABELS[esc.escalationLevel].label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`ml-1 flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      esc.status === 'Pending'    ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      esc.status === 'InProgress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    'bg-green-50 text-green-700 border-green-200'
                    }`}>
                      {esc.status === 'InProgress' ? 'In Progress' : esc.status}
                    </span>
                  </div>

                  {/* SLA Countdown */}
                  {esc.status !== 'Resolved' && (() => {
                    const sla = getSlaInfo(esc);
                    if (!sla) return null;
                    return (
                      <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl text-xs font-medium ${
                        sla.breached ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                      }`}>
                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                        {sla.breached
                          ? `⚠ SLA breached ${fmtMins(Math.abs(sla.remaining))} ago — escalating to next level`
                          : `${fmtMins(sla.remaining)} left before escalating to ${LEVEL_LABELS[Math.min((esc.escalationLevel ?? 1) + 1, 3)]?.label ?? 'next level'}`
                        }
                      </div>
                    );
                  })()}

                  {/* Info grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: 'From',     value: esc.escalatedFromUserName || 'AI System' },
                      { label: 'Assigned', value: esc.escalatedToUserName },
                      { label: 'Priority', value: esc.priority,
                        cls: `font-semibold ${esc.priority === 'High' ? 'text-red-600' : esc.priority === 'Normal' ? 'text-amber-600' : 'text-gray-500'}` },
                    ].map(({ label, value, cls }) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
                        <p className={`text-sm font-semibold text-gray-900 truncate ${cls ?? ''}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {esc.reason && (
                    <div className="mb-3 px-3 py-2.5 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Reason</p>
                      <p className="text-sm text-gray-700">{esc.reason}</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-50 gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDate(esc.escalatedAt)}
                    </div>
                    {esc.status !== 'Resolved' && (
                      <div className="flex items-center gap-1.5">
                        {/* Mark In Progress */}
                        {esc.status === 'Pending' && (
                          <button
                            disabled={markingInProgress === esc.id}
                            onClick={() => handleMarkInProgress(esc)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 active:scale-95 transition-all disabled:opacity-50">
                            <UserCheck className="h-3.5 w-3.5" />
                            In Progress
                          </button>
                        )}
                        {/* Reassign */}
                        <div className="relative">
                          <button
                            onClick={() => setReassignEscId(reassignEscId === esc.id ? null : esc.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 active:scale-95 transition-all">
                            <Users className="h-3.5 w-3.5" />
                            Reassign
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          {reassignEscId === esc.id && (
                            <div className="absolute bottom-full mb-1 right-0 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 max-h-40 overflow-y-auto">
                              {users.filter(u => u.id !== esc.escalatedToUserId).map((u: any) => (
                                <button key={u.id}
                                  onClick={() => handleReassign(esc.id, u.id, u.fullName)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center gap-2">
                                  <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                    {u.fullName?.[0] ?? '?'}
                                  </span>
                                  <span className="truncate">{u.fullName}</span>
                                  <span className="text-gray-300 text-[10px] ml-auto">{u.role}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Resolve */}
                        <button onClick={() => handleResolveClick(esc)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 active:scale-95 transition-all shadow-sm">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Resolve
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Quick Note (unresolved only) */}
                  {esc.status !== 'Resolved' && (
                    <div className="mt-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={quickNotes[esc.id] || ''}
                          onChange={e => setQuickNotes(prev => ({ ...prev, [esc.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleSaveNote(esc.id)}
                          placeholder="Add resolution note and resolve… (Enter)"
                          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-300 bg-gray-50"
                        />
                        {quickNotes[esc.id]?.trim() && (
                          <button onClick={() => handleSaveNote(esc.id)} disabled={savingNote === esc.id}
                            className="px-3 py-1.5 text-xs font-semibold bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 whitespace-nowrap flex-shrink-0">
                            {savingNote === esc.id ? '…' : '✓ Resolve'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {esc.resolutionNotes && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm font-semibold text-green-900">Resolution Notes</p>
                      <p className="text-sm text-green-700 mt-1">{esc.resolutionNotes}</p>
                      <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Resolved at {esc.resolvedAt ? formatDate(esc.resolvedAt) : '—'}
                      </p>
                    </div>
                  )}
                </div>
                );
              })}

              {filteredEscalations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                  <div className="h-14 w-14 rounded-2xl bg-green-50 flex items-center justify-center mb-3">
                    <CheckCircle className="h-7 w-7 text-green-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">All clear</p>
                  <p className="text-xs text-gray-400 mt-1">No {filter !== 'all' ? filter : ''} escalations right now</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader onClose={() => setResolveDialogOpen(false)}>
            <DialogTitle>Resolve Escalation</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  You are about to mark this escalation as resolved. Please provide resolution notes.
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resolution Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Describe how the issue was resolved..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResolveDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleResolveSubmit}
              disabled={submitting || !resolutionNotes.trim()}
            >
              {submitting ? 'Resolving...' : 'Mark as Resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDeleteRule}
        title="Delete Escalation Rule"
        message={`Are you sure you want to delete "${ruleToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Rule Modal */}
      <EscalationRuleModal
        open={ruleModalOpen}
        onOpenChange={setRuleModalOpen}
        rule={selectedRule}
        onSubmit={handleRuleSubmit}
      />

      {/* Floating Action Button */}
      <FAB onClick={handleAddRule} label="Add Rule" />

      </> /* end escalations tab */}

    </div>
  );
}
