'use client';

import { useEffect, useState, useRef } from 'react';
import { customersApi, tagsApi } from '@/services/api';
import { Search, Phone, Mail, MessageSquare, RefreshCw, ChevronLeft, ChevronRight, X, Users, UserCheck, Sparkles, Clock, Tag, Plus } from 'lucide-react';
import { getRelativeTime } from '@/lib/utils';
import { KPICard } from '@/components/ui/kpi-card';
import { useToast } from '@/components/ui/toast';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total: number; activeThisWeek: number; seenToday: number; newThisWeek: number } | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', notes: '' });
  const [customerTags, setCustomerTags] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const PAGE_SIZE = 20;
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchCustomers = async (p = page, q = search) => {
    setLoading(true);
    try {
      const res = await customersApi.getAll(q || undefined, p, PAGE_SIZE);
      setCustomers(res.data.customers ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      showToast('Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers(1, '');
    customersApi.getStats().then(r => setStats(r.data)).catch(() => {});
    tagsApi.getAll('customer').then(r => setAllTags(r.data ?? [])).catch(() => {});
    // Close tag menu on outside click
    const handler = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) setShowTagMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (val: string) => {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
      fetchCustomers(1, val);
    }, 400);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
    fetchCustomers(1, '');
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchCustomers(p, search);
  };

  const openCustomer = async (c: any) => {
    setSelected(c);
    setEditForm({ name: c.name ?? '', email: c.email ?? '', notes: c.notes ?? '' });
    setEditing(false);
    setCustomerTags([]);
    setShowTagMenu(false);
    setLoadingConvs(true);
    customersApi.getTags(c.id).then(r => setCustomerTags(r.data ?? [])).catch(() => {});
    try {
      const res = await customersApi.getConversations(c.id);
      setConversations(res.data ?? []);
    } catch {
      setConversations([]);
    } finally {
      setLoadingConvs(false);
    }
  };

  const saveEdit = async () => {
    try {
      await customersApi.update(selected.id, editForm);
      showToast('Customer updated', 'success');
      setSelected({ ...selected, ...editForm });
      setEditing(false);
      fetchCustomers(page, search);
    } catch {
      showToast('Failed to update customer', 'error');
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Generate meaningful avatar text:
  // - If name: first letter of each word (max 2), e.g. "Anjali Sharma" → "AS"
  // - If no name: last 4 digits of phone, e.g. "+919560300375" → "0375"
  const getAvatar = (name: string | null, phone: string): string => {
    if (name && name.trim()) {
      const words = name.trim().split(/\s+/);
      return words.length >= 2
        ? (words[0][0] + words[1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
    }
    // fallback: last 4 digits of phone
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-4);
  };

  const statusColor: Record<string, string> = {
    open: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-500',
    escalated: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-0">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 sm:p-6 pb-0">
        <KPICard index={0} title="Total Customers" value={stats?.total ?? total}
          icon={Users} theme="blue" subtitleText="All time" />
        <KPICard index={1} title="Active This Week" value={stats?.activeThisWeek ?? 0}
          icon={UserCheck} theme="green" subtitleText="Messaged in last 7 days" />
        <KPICard index={2} title="Seen Today" value={stats?.seenToday ?? 0}
          icon={Clock} theme="amber" subtitleText="Active conversations today" />
        <KPICard index={3} title="New This Week" value={stats?.newThisWeek ?? 0}
          icon={Sparkles} theme="purple" subtitleText="First contact last 7 days" />
      </div>

      <div className="flex flex-1 min-h-0 gap-0">
      {/* Left: Customer list */}
      <div className={`flex flex-col bg-white border-r border-gray-100 transition-all duration-200 ${selected ? 'w-[420px] flex-shrink-0' : 'flex-1'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Customers</h1>
            <p className="text-xs text-gray-400 mt-0.5">{total} total</p>
          </div>
          <button onClick={() => fetchCustomers(page, search)} className="p-2 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search name, phone or email…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {searchInput && (
              <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
              <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <Phone className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">No customers found</p>
              <p className="text-xs text-gray-400">Customers appear here once they message your WhatsApp number</p>
            </div>
          ) : (
            customers.map(c => (
              <button
                key={c.id}
                onClick={() => openCustomer(c)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 ${selected?.id === c.id ? 'bg-indigo-50' : ''}`}
              >
                <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-indigo-700">
                    {getAvatar(c.name, c.phone)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.name ?? c.phone}</p>
                  <p className="text-xs text-gray-400 truncate">{c.phone}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">{c.totalConversations ?? 0} conv.</p>
                  {c.lastSeenAt && <p className="text-[11px] text-gray-300">{getRelativeTime(c.lastSeenAt)}</p>}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => handlePageChange(page - 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button disabled={page === totalPages} onClick={() => handlePageChange(page + 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Customer detail */}
      {selected && (
        <div className="flex-1 min-w-0 flex flex-col bg-gray-50 overflow-y-auto">
          {/* Detail header */}
          <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-sm font-bold text-indigo-700">
                  {getAvatar(selected.name, selected.phone)}
                </span>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">{selected.name ?? selected.phone}</h2>
                <p className="text-xs text-gray-400">{selected.phone}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {!editing && (
                <button onClick={() => setEditing(true)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                  Edit
                </button>
              )}
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 p-6 space-y-5">
            {/* Info card */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Contact Info</h3>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Name</label>
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Email</label>
                    <input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveEdit} className="text-sm px-4 py-1.5 bg-indigo-700 text-white rounded-lg hover:bg-indigo-800">Save</button>
                    <button onClick={() => setEditing(false)} className="text-sm px-4 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    <span>{selected.phone}</span>
                  </div>
                  {selected.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <span>{selected.email}</span>
                    </div>
                  )}
                  {selected.notes && (
                    <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg p-3 italic">{selected.notes}</p>
                  )}
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700">Tags</h3>
                </div>
                <div className="relative" ref={tagMenuRef}>
                  <button
                    onClick={() => setShowTagMenu(v => !v)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add Tag
                  </button>
                  {showTagMenu && (
                    <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 max-h-48 overflow-y-auto">
                      {allTags.filter(t => !customerTags.find(ct => ct.id === t.id)).map(tag => (
                        <button
                          key={tag.id}
                          onClick={async () => {
                            await customersApi.addTag(selected.id, tag.id);
                            setCustomerTags(prev => [...prev, tag]);
                            setShowTagMenu(false);
                            showToast(`Tag "${tag.name}" added`, 'success');
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </button>
                      ))}
                      {allTags.filter(t => !customerTags.find(ct => ct.id === t.id)).length === 0 && (
                        <p className="px-3 py-2 text-xs text-gray-400">All tags applied</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                {customerTags.length === 0 ? (
                  <p className="text-xs text-gray-400">No tags yet</p>
                ) : (
                  customerTags.map(tag => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: tag.color + '22', color: tag.color, border: `1px solid ${tag.color}44` }}
                    >
                      {tag.name}
                      <button
                        onClick={async () => {
                          await customersApi.removeTag(selected.id, tag.id);
                          setCustomerTags(prev => prev.filter(t => t.id !== tag.id));
                          showToast(`Tag "${tag.name}" removed`, 'success');
                        }}
                        className="ml-0.5 hover:opacity-60 transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <p className="text-2xl font-bold text-indigo-700">{selected.totalConversations ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">Total Conversations</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <p className="text-sm font-semibold text-gray-700">{selected.lastSeenAt ? getRelativeTime(selected.lastSeenAt) : '—'}</p>
                <p className="text-xs text-gray-400 mt-0.5">Last Seen</p>
              </div>
            </div>

            {/* Conversation history */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700">Conversation History</h3>
                  {conversations.length > 0 && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{conversations.length}</span>
                  )}
                </div>
              </div>
              {loadingConvs ? (
                <div className="space-y-3">{Array.from({length:3}).map((_,i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No conversations found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {conversations.map((conv: any) => {
                    // Parse tags from TagsRaw: "Name|Color;;Name2|Color2"
                    const tags = conv.tagsRaw
                      ? conv.tagsRaw.split(';;').filter(Boolean).map((t: string) => {
                          const [name, color] = t.split('|');
                          return { name, color: color || '#6366f1' };
                        })
                      : [];

                    // Clean last message content — "None" means media was shared
                    const rawContent = conv.lastMessageContent;
                    const lastMsg = (!rawContent || rawContent === 'None' || rawContent === 'null')
                      ? null
                      : rawContent;

                    // Determine preview text priority: summary > last message > media fallback
                    const mediaTypes: Record<string,string> = { image:'📷 Image shared', video:'🎥 Video shared', audio:'🎙 Voice/Audio', document:'📄 Document shared' };
                    const mediaLabel = conv.messageType && mediaTypes[conv.messageType];

                    const statusCls: Record<string,string> = {
                      Open:      'bg-green-100 text-green-700 border-green-200',
                      Closed:    'bg-gray-100 text-gray-500 border-gray-200',
                      Escalated: 'bg-red-100 text-red-700 border-red-200',
                    };

                    return (
                      <div key={conv.id} className="border border-gray-100 rounded-xl p-4 hover:border-indigo-200 hover:bg-indigo-50/20 transition-colors">
                        {/* Row 1: ID + Status + Tags + Time + View */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-gray-400">#{conv.id}</span>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${statusCls[conv.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                              {conv.status}
                            </span>
                            {conv.priority === 'High' && (
                              <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-bold">HIGH</span>
                            )}
                            {/* Conversation tags inline in header */}
                            {tags.map((tag: any, i: number) => (
                              <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                                style={{ color: tag.color, borderColor: tag.color + '55', backgroundColor: tag.color + '15' }}>
                                {tag.name}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] text-gray-400">{conv.lastMessageAt ? getRelativeTime(conv.lastMessageAt) : ''}</span>
                            <a href={`/dashboard/conversations?id=${conv.id}`}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap">
                              View →
                            </a>
                          </div>
                        </div>

                        {/* Summary — shown prominently when available */}
                        {conv.summaryText && (
                          <div className="mb-2 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-100">
                            <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-0.5">AI Summary</p>
                            <p className="text-xs text-gray-700 line-clamp-3 leading-relaxed">{conv.summaryText}</p>
                          </div>
                        )}

                        {/* Last message preview (only if no summary) */}
                        {!conv.summaryText && (lastMsg || mediaLabel) && (
                          <p className="text-xs text-gray-500 mb-2 line-clamp-2 leading-relaxed italic">
                            {lastMsg ?? <span className="text-gray-400 not-italic">{mediaLabel}</span>}
                          </p>
                        )}

                        {/* Tags now shown in Row 1 header — removed from here */}

                        {/* Row 4: Agent + Session + Message count */}
                        <div className="flex items-center gap-3 text-[11px] text-gray-400">
                          {conv.assignedUserName && (
                            <span className="flex items-center gap-1">
                              <span className="inline-flex h-4 w-4 rounded-full bg-indigo-100 text-indigo-700 items-center justify-center font-bold text-[9px]">
                                {conv.assignedUserName.charAt(0)}
                              </span>
                              {conv.assignedUserName}
                            </span>
                          )}
                          {conv.sessionPhoneNumber && (
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                              {conv.sessionPhoneNumber}
                            </span>
                          )}
                          {conv.messageCount > 0 && (
                            <span>{conv.messageCount} messages</span>
                          )}
                          {conv.createdAt && (
                            <span>Started {getRelativeTime(conv.createdAt)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
