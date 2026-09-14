'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { customersApi, tagsApi } from '@/services/api';
import { Search, Phone, Mail, MessageSquare, RefreshCw, X, Users, UserCheck, Sparkles, Clock, Tag, Plus, Check, Download, Filter, ChevronDown } from 'lucide-react';
import { getRelativeTime } from '@/lib/utils';
import { KPICard } from '@/components/ui/kpi-card';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total: number; activeThisWeek: number; seenToday: number; newThisWeek: number } | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterTagId, setFilterTagId] = useState<number | null>(null);
  const [filterConvTagId, setFilterConvTagId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', notes: '' });
  const [customerTags, setCustomerTags] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [allConvTags, setAllConvTags] = useState<any[]>([]);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  // Bulk multi-select tagging
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkTagRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const PAGE_SIZE = 100;
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchCustomers = async (p = page, q = search, tagId = filterTagId, convTagId = filterConvTagId) => {
    setLoading(true);
    try {
      const res = await customersApi.getAll(q || undefined, p, PAGE_SIZE, tagId ?? undefined, convTagId ?? undefined);
      setCustomers(res.data.customers ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      showToast('Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Honor ?search= (e.g. drill-down from Reports → Top Customers) by prefilling + filtering.
    const initial = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('search') ?? ''
      : '';
    if (initial) { setSearchInput(initial); setSearch(initial); }
    fetchCustomers(1, initial);
    customersApi.getStats().then(r => setStats(r.data)).catch(() => {});
    tagsApi.getAll('customer').then(r => setAllTags(r.data ?? [])).catch(() => {});
    tagsApi.getAll('conversation').then(r => setAllConvTags(r.data ?? [])).catch(() => {});
    // Close tag menu on outside click
    const handler = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) setShowTagMenu(false);
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) setShowFilterMenu(false);
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

  const handleTagFilter = (tagId: number | null) => {
    const next = filterTagId === tagId ? null : tagId;
    setFilterTagId(next);
    setPage(1);
    fetchCustomers(1, search, next, filterConvTagId);
  };

  const handleConvTagFilter = (tagId: number | null) => {
    const next = filterConvTagId === tagId ? null : tagId;
    setFilterConvTagId(next);
    setPage(1);
    fetchCustomers(1, search, filterTagId, next);
  };

  // Export the current (searched / filtered) customer list to CSV.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await customersApi.getAll(search || undefined, 1, Math.max(total, 1), filterTagId ?? undefined, filterConvTagId ?? undefined);
      const rows: any[] = res.data.customers ?? [];
      const tagNames = (raw?: string) => (raw || '').split(';;').filter(Boolean).map(t => t.split('|')[0]).join('; ');
      const cell = (v: any) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ['Sr. No.', 'Mobile Number', 'Name', 'Total Conversations', 'Conversation Tags', 'Customer Tags', 'Last Status'];
      const lines = rows.map((c, i) => [
        i + 1, c.phone, c.name ?? '', c.totalConversations ?? 0,
        tagNames(c.convTagsRaw), tagNames(c.tagsRaw), c.lastStatus ?? '',
      ].map(cell).join(','));
      const csv = [header.join(','), ...lines].join('\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${rows.length} customers`, 'success');
    } catch {
      showToast('Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ── Bulk multi-select tagging ──
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); setShowBulkTag(false); };
  const selectAllVisible = () => {
    const ids = customers.map(c => c.id);
    setSelectedIds(prev => (prev.size === ids.length && ids.length > 0 ? new Set() : new Set(ids)));
  };
  const runBulkTag = async (tagId: number, action: 'add' | 'remove') => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await customersApi.bulkTag([...selectedIds], tagId, action);
      const tagName = allTags.find(t => t.id === tagId)?.name ?? 'tag';
      showToast(`${action === 'add' ? 'Tagged' : 'Removed tag from'} ${res.data.affected} customer${res.data.affected === 1 ? '' : 's'} — ${tagName}`, 'success');
      exitSelect();
      fetchCustomers(page, search);
      if (selected) customersApi.getTags(selected.id).then(r => setCustomerTags(r.data ?? [])).catch(() => {});
    } catch {
      showToast('Bulk tag failed', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  // Close bulk-tag popover on outside click
  useEffect(() => {
    if (!showBulkTag) return;
    const h = (e: MouseEvent) => { if (bulkTagRef.current && !bulkTagRef.current.contains(e.target as Node)) setShowBulkTag(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showBulkTag]);

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
      <div className="flex flex-col flex-1 bg-white border-r border-gray-100">
        {/* Toolbar: search + filter + export + select + refresh — all in one row */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search name, phone or email…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            {searchInput && (
              <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter dropdown (customer + conversation tags) */}
          {(allTags.length > 0 || allConvTags.length > 0) && (
            <div className="relative flex-shrink-0" ref={filterMenuRef}>
              <button
                onClick={() => setShowFilterMenu(v => !v)}
                className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors ${
                  (filterTagId || filterConvTagId) ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Filter className="h-4 w-4" /> Filter
                {(filterTagId || filterConvTagId) && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {showFilterMenu && (
                <div className="absolute right-0 mt-1 w-64 max-h-[70vh] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3 space-y-3">
                  {/* Customer tags */}
                  {allTags.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Customer tags</p>
                        {filterTagId && (
                          <button onClick={() => handleTagFilter(null)} className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                            <X className="h-3 w-3" /> Clear
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allTags.map(tag => {
                          const active = filterTagId === tag.id;
                          return (
                            <button key={tag.id} onClick={() => handleTagFilter(tag.id)}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all"
                              style={active
                                ? { backgroundColor: tag.color, color: '#fff', borderColor: tag.color }
                                : { backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '44' }}>
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Conversation tags */}
                  {allConvTags.length > 0 && (
                    <div className={allTags.length > 0 ? 'border-t border-gray-100 pt-3' : ''}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Conversation tags</p>
                        {filterConvTagId && (
                          <button onClick={() => handleConvTagFilter(null)} className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                            <X className="h-3 w-3" /> Clear
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allConvTags.map(tag => {
                          const active = filterConvTagId === tag.id;
                          return (
                            <button key={tag.id} onClick={() => handleConvTagFilter(tag.id)}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all"
                              style={active
                                ? { backgroundColor: tag.color, color: '#fff', borderColor: tag.color }
                                : { backgroundColor: tag.color + '15', color: tag.color, borderColor: tag.color + '44' }}>
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Export */}
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 flex-shrink-0"
          >
            <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export'}
          </button>

          {/* Select */}
          {allTags.length > 0 && (
            <button
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors flex-shrink-0 ${
                selectMode ? 'bg-emerald-100 text-emerald-700 border-emerald-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Check className="h-4 w-4" /> {selectMode ? 'Done' : 'Select'}
            </button>
          )}

          {/* Refresh */}
          <button onClick={() => fetchCustomers(page, search)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Bulk-tag action bar */}
        {selectMode && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-emerald-100 bg-emerald-50/60 flex-wrap">
            <button onClick={selectAllVisible} className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-1.5">
              {selectedIds.size === customers.length && customers.length > 0 ? 'Clear' : 'All'}
            </button>
            <span className="text-[11px] font-medium text-gray-600">{selectedIds.size} selected</span>
            <div className="flex-1" />
            <div className="relative" ref={bulkTagRef}>
              <button
                onClick={() => setShowBulkTag(v => !v)}
                disabled={selectedIds.size === 0 || bulkBusy}
                className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 px-2 py-1 rounded-lg hover:bg-emerald-100 disabled:opacity-40"
              >
                <Tag className="h-3.5 w-3.5" /> Tag
              </button>
              {showBulkTag && (
                <div className="absolute right-0 mt-1 w-52 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
                  <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Add / remove tag</p>
                  {allTags.map(tag => (
                    <div key={tag.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50">
                      <span className="flex items-center gap-2 text-xs text-gray-700 truncate">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color || '#10b981' }} />
                        {tag.name}
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => runBulkTag(tag.id, 'add')} title="Add to selected"
                          className="text-[10px] font-semibold text-green-600 hover:bg-green-50 px-1.5 py-0.5 rounded">+ Add</button>
                        <button onClick={() => runBulkTag(tag.id, 'remove')} title="Remove from selected"
                          className="text-[10px] font-semibold text-gray-400 hover:text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded">Remove</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={exitSelect} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}


        {/* Table — overflow-auto (both axes) so the wide table scrolls sideways on mobile instead of squishing */}
        <div className="flex-1 overflow-auto">
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
            <>
            <table className="hidden lg:table w-full min-w-[720px] text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr className="border-b border-gray-200">
                  {selectMode && <th className="w-10 px-3 py-2.5" />}
                  <th className="text-center font-semibold px-3 py-2.5 w-14">Sr. No.</th>
                  <th className="text-left font-semibold px-4 py-2.5">Mobile Number</th>
                  <th className="text-left font-semibold px-4 py-2.5">Name</th>
                  <th className="text-center font-semibold px-3 py-2.5 whitespace-nowrap">Total Conv</th>
                  <th className="text-left font-semibold px-4 py-2.5">Conv Tag</th>
                  <th className="text-left font-semibold px-4 py-2.5">Customer Tag</th>
                  <th className="text-center font-semibold px-4 py-2.5 whitespace-nowrap">Last Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c, idx) => {
                  const checked = selectedIds.has(c.id);
                  const custTags = (c.tagsRaw || '').split(';;').filter(Boolean);
                  const convTags = (c.convTagsRaw || '').split(';;').filter(Boolean);
                  const srNo = (page - 1) * PAGE_SIZE + idx + 1;
                  const statusCls: Record<string, string> = {
                    Open: 'bg-green-50 text-green-700 border-green-200',
                    Escalated: 'bg-amber-50 text-amber-700 border-amber-200',
                    Closed: 'bg-gray-100 text-gray-500 border-gray-200',
                  };
                  const renderChips = (list: string[]) =>
                    list.slice(0, 3).map((t: string, i: number) => {
                      const [name, color] = t.split('|');
                      const col = color || '#10b981';
                      return (
                        <span key={i} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border leading-none whitespace-nowrap"
                          style={{ color: col, borderColor: col + '55', backgroundColor: col + '15' }}>
                          {name}
                        </span>
                      );
                    });
                  return (
                    <tr
                      key={c.id}
                      onClick={() => (selectMode ? toggleSelect(c.id) : openCustomer(c))}
                      className={`cursor-pointer transition-colors ${
                        checked ? 'bg-emerald-50' : selected?.id === c.id ? 'bg-emerald-50/60' : 'hover:bg-gray-50'
                      }`}
                    >
                      {selectMode && (
                        <td className="px-3 py-3 align-middle">
                          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                            checked ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 bg-white'
                          }`}>
                            {checked && <Check className="h-3.5 w-3.5 text-white" />}
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-3 align-middle text-center text-xs text-gray-400 tabular-nums">{srNo}</td>
                      <td className="px-4 py-3 align-middle text-gray-700 whitespace-nowrap">{c.phone}</td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-[11px] font-semibold text-emerald-700">{getAvatar(c.name, c.phone)}</span>
                          </div>
                          <span className="font-semibold text-gray-900 truncate">{c.name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {c.totalConversations ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-1 flex-wrap">
                          {convTags.length ? (
                            <>{renderChips(convTags)}{convTags.length > 3 && <span className="text-[9px] text-gray-400">+{convTags.length - 3}</span>}</>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-1 flex-wrap">
                          {custTags.length ? (
                            <>{renderChips(custTags)}{custTags.length > 3 && <span className="text-[9px] text-gray-400">+{custTags.length - 3}</span>}</>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-center">
                        {c.lastStatus ? (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${statusCls[c.lastStatus] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                            {c.lastStatus}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile / tablet card list — all customer fields without a wide horizontal-scroll table */}
            <div className="lg:hidden divide-y divide-gray-100">
              {customers.map((c, idx) => {
                const checked = selectedIds.has(c.id);
                const custTags = (c.tagsRaw || '').split(';;').filter(Boolean);
                const convTags = (c.convTagsRaw || '').split(';;').filter(Boolean);
                const statusCls: Record<string, string> = {
                  Open: 'bg-green-50 text-green-700 border-green-200',
                  Escalated: 'bg-amber-50 text-amber-700 border-amber-200',
                  Closed: 'bg-gray-100 text-gray-500 border-gray-200',
                };
                const chip = (t: string, i: number) => {
                  const [name, color] = t.split('|');
                  const col = color || '#10b981';
                  return (
                    <span key={i} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border leading-none whitespace-nowrap"
                      style={{ color: col, borderColor: col + '55', backgroundColor: col + '15' }}>{name}</span>
                  );
                };
                return (
                  <div key={c.id} onClick={() => (selectMode ? toggleSelect(c.id) : openCustomer(c))}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                    {selectMode && (
                      <div className={`mt-0.5 h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 bg-white'}`}>
                        {checked && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                    )}
                    <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-semibold text-emerald-700">{getAvatar(c.name, c.phone)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900 truncate">{c.name ?? '—'}</span>
                        {c.lastStatus && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap flex-shrink-0 ${statusCls[c.lastStatus] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>{c.lastStatus}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span className="tabular-nums">{c.phone}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-emerald-700 font-medium">{c.totalConversations ?? 0} conv</span>
                      </div>
                      {(convTags.length > 0 || custTags.length > 0) && (
                        <div className="flex items-center gap-1 flex-wrap mt-1.5">
                          {convTags.slice(0, 3).map(chip)}
                          {custTags.slice(0, 3).map(chip)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>

        {/* Pagination */}
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={handlePageChange}
          summary={total > 0 ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : undefined}
        />
      </div>

      {/* Customer detail — popup modal (portaled above the app chrome) */}
      {selected && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setSelected(null); setEditing(false); }} />
          <div className="relative z-[151] w-full max-w-4xl max-h-[90vh] flex flex-col bg-gray-50 rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
          {/* Detail header */}
          <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-emerald-100 flex items-center justify-center">
                <span className="text-sm font-bold text-emerald-700">
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

          <div className="flex-1 p-6 space-y-5 overflow-y-auto">
            {/* Info card */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Contact Info</h3>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Name</label>
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Email</label>
                    <input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveEdit} className="text-sm px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200">Save</button>
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
                    className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
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
                <p className="text-2xl font-bold text-emerald-700">{selected.totalConversations ?? 0}</p>
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
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{conversations.length}</span>
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
                          return { name, color: color || '#10b981' };
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
                      <div key={conv.id} className="border border-gray-100 rounded-xl p-4 hover:border-emerald-200 hover:bg-emerald-50/20 transition-colors">
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
                            <Link href={`/dashboard/conversations?id=${conv.id}`}
                              className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap">
                              View →
                            </Link>
                          </div>
                        </div>

                        {/* Summary — shown prominently when available */}
                        {conv.summaryText && (
                          <div className="mb-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                            <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-0.5">AI Summary</p>
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
                              <span className="inline-flex h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 items-center justify-center font-bold text-[9px]">
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
        </div>,
        document.body
      )}
      </div>
    </div>
  );
}
