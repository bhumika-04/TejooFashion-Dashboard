'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { galleryApi, sessionsApi, catalogsApi } from '@/services/api';
import { Images, RefreshCw, X, Download, ChevronLeft, ChevronRight, ExternalLink, ArrowDownLeft, ArrowUpRight, CheckSquare, FolderPlus, Plus, Trash2, Edit, Check, Layers } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { getRelativeTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { usePermissions } from '@/hooks/usePermissions';

const MEDIA_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
const resolveUrl = (u?: string | null) => (!u ? '' : u.startsWith('/') ? `${MEDIA_BASE}${u}` : u);

export default function GalleryPage() {
  const { canAccess } = usePermissions();
  const canManage = canAccess('catalogs');
  const { showToast } = useToast();

  const [tab, setTab] = useState<'images' | 'catalogs'>('images');

  // ── Images ──
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const PAGE_SIZE = 102;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Filters
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [sessionId, setSessionId] = useState<number | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  type Filters = { direction: 'all' | 'inbound' | 'outbound'; sessionId: number | ''; fromDate: string; toDate: string };
  const hasFilters = direction !== 'all' || sessionId !== '' || !!fromDate || !!toDate;

  // Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Map<number, { mediaUrl: string }>>(new Map());

  // ── Catalogs ──
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);       // open catalog detail
  const [detailLoading, setDetailLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);          // "add selected to catalog" picker
  const [formOpen, setFormOpen] = useState(false);              // create/edit catalog form
  const [formEditing, setFormEditing] = useState<any | null>(null);
  const [formName, setFormName] = useState('');
  const [formInfo, setFormInfo] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [attachSelectionOnCreate, setAttachSelectionOnCreate] = useState(false); // create-new-catalog from the "add to catalog" picker → attach the selected images
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = async (p = page, f: Filters = { direction, sessionId, fromDate, toDate }) => {
    setLoading(true);
    try {
      const res = await galleryApi.get('image', p, PAGE_SIZE, {
        direction: f.direction === 'all' ? undefined : f.direction,
        sessionId: f.sessionId === '' ? undefined : f.sessionId,
        from: f.fromDate || undefined,
        to: f.toDate || undefined,
      });
      setItems(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      showToast('Failed to load gallery', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = (patch: Partial<Filters>) => {
    const next: Filters = { direction, sessionId, fromDate, toDate, ...patch };
    setDirection(next.direction); setSessionId(next.sessionId);
    setFromDate(next.fromDate); setToDate(next.toDate);
    setPage(1); setSelected(new Map());
    load(1, next);
  };
  const clearFilters = () => applyFilter({ direction: 'all', sessionId: '', fromDate: '', toDate: '' });

  const loadCatalogs = async () => {
    setCatalogsLoading(true);
    try { const r = await catalogsApi.getAll(); setCatalogs(r.data ?? []); }
    catch { showToast('Failed to load catalogs', 'error'); }
    finally { setCatalogsLoading(false); }
  };

  useEffect(() => { load(1); }, []);
  useEffect(() => { sessionsApi.getAll().then(r => setSessions(r.data ?? [])).catch(() => {}); }, []);
  useEffect(() => { loadCatalogs(); }, []);

  const go = (p: number) => {
    setPage(p); setSelected(new Map());
    load(p);
    document.getElementById('gallery-scroll')?.scrollTo({ top: 0 });
  };

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightbox === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox(i => (i === null ? null : Math.min(items.length - 1, i + 1)));
      if (e.key === 'ArrowLeft') setLightbox(i => (i === null ? null : Math.max(0, i - 1)));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lightbox, items.length]);

  const active = lightbox !== null ? items[lightbox] : null;

  // ── Selection ──
  const toggleSelect = (m: any) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.set(m.id, { mediaUrl: m.mediaUrl });
      return next;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Map()); };

  const addSelectedToCatalog = async (catalogId: number) => {
    const payload = [...selected.entries()].map(([id, v]) => ({ mediaUrl: v.mediaUrl, sourceMessageId: id }));
    if (payload.length === 0) return;
    try {
      const res = await catalogsApi.addItems(catalogId, payload);
      showToast(`${res.data.added} image${res.data.added === 1 ? '' : 's'} added`, 'success');
      setPickerOpen(false); exitSelect();
      loadCatalogs();
      load(page); // refresh badges
    } catch { showToast('Failed to add images', 'error'); }
  };

  // ── Catalog CRUD ──
  const openCreate = (attachSelection = false) => { setAttachSelectionOnCreate(attachSelection); setFormEditing(null); setFormName(''); setFormInfo(''); setFormOpen(true); };
  const openEdit = (c: any) => { setFormEditing(c); setFormName(c.name); setFormInfo(c.info ?? ''); setFormOpen(true); };
  const saveForm = async () => {
    if (!formName.trim()) { showToast('Enter a catalog name', 'error'); return; }
    setFormSaving(true);
    try {
      if (formEditing) {
        await catalogsApi.update(formEditing.id, formName.trim(), formInfo.trim() || undefined);
        showToast('Catalog updated', 'success');
        if (detail?.id === formEditing.id) setDetail((d: any) => ({ ...d, name: formName.trim(), info: formInfo.trim() }));
      } else {
        const res = await catalogsApi.create(formName.trim(), formInfo.trim() || undefined);
        const newId = res.data?.id;
        // Created from the "add to catalog" picker → attach the images that were selected.
        if (attachSelectionOnCreate && newId && selected.size > 0) {
          const payload = [...selected.entries()].map(([id, v]) => ({ mediaUrl: v.mediaUrl, sourceMessageId: id }));
          const addRes = await catalogsApi.addItems(newId, payload);
          showToast(`Catalog created · ${addRes.data.added} image${addRes.data.added === 1 ? '' : 's'} added`, 'success');
          exitSelect();
          load(page); // refresh image badges
        } else {
          showToast('Catalog created', 'success');
        }
      }
      setAttachSelectionOnCreate(false);
      setFormOpen(false); loadCatalogs();
    } catch { showToast('Failed to save catalog', 'error'); }
    finally { setFormSaving(false); }
  };
  const confirmDelete = async () => {
    if (deleteId === null) return;
    try {
      await catalogsApi.delete(deleteId);
      showToast('Catalog deleted', 'success');
      if (detail?.id === deleteId) setDetail(null);
      setDeleteId(null); loadCatalogs();
    } catch { showToast('Failed to delete catalog', 'error'); }
  };

  const openDetail = async (c: any) => {
    setDetail({ id: c.id, name: c.name, info: c.info, items: [] });
    setDetailLoading(true);
    try { const r = await catalogsApi.getById(c.id); setDetail(r.data); }
    catch { showToast('Failed to open catalog', 'error'); setDetail(null); }
    finally { setDetailLoading(false); }
  };
  const removeFromCatalog = async (itemId: number) => {
    if (!detail) return;
    try {
      await catalogsApi.removeItem(detail.id, itemId);
      setDetail((d: any) => ({ ...d, items: d.items.filter((it: any) => it.id !== itemId) }));
      loadCatalogs();
      load(page);
    } catch { showToast('Failed to remove image', 'error'); }
  };
  // From catalog detail → jump to Images tab in select mode to pick more.
  const addImagesFlow = () => { setDetail(null); setTab('images'); setSelectMode(true); setSelected(new Map()); };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Images className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gallery</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {tab === 'images' ? `${total} image${total === 1 ? '' : 's'} shared in conversations` : `${catalogs.length} catalog${catalogs.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            {([{ key: 'images', label: 'Images', icon: Images }, { key: 'catalogs', label: 'Catalogs', icon: Layers }] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  tab === key ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
          <button onClick={() => (tab === 'images' ? load(page) : loadCatalogs())} className="p-2 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── IMAGES TAB ── */}
      {tab === 'images' && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-gray-100 bg-white">
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              {([{ key: 'all', label: 'All', icon: null }, { key: 'inbound', label: 'In', icon: ArrowDownLeft }, { key: 'outbound', label: 'Out', icon: ArrowUpRight }] as const).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => applyFilter({ direction: key })}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    direction === key ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {Icon && <Icon className="h-3.5 w-3.5" />}{label}
                </button>
              ))}
            </div>
            <select value={sessionId}
              onChange={e => applyFilter({ sessionId: e.target.value === '' ? '' : Number(e.target.value) })}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 text-gray-700 max-w-[220px] cursor-pointer">
              <option value="">All sessions</option>
              {sessions.map((s: any) => (
                <option key={s.id} value={s.id}>{s.phoneNumber}{s.assignedUserName ? ` · ${s.assignedUserName}` : ''}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 text-sm">
              <input type="date" value={fromDate} max={toDate || undefined}
                onChange={e => applyFilter({ fromDate: e.target.value })}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 text-gray-600" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={toDate} min={fromDate || undefined}
                onChange={e => applyFilter({ toDate: e.target.value })}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 text-gray-600" />
            </div>
            {hasFilters && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
            {/* Select mode toggle */}
            <div className="ml-auto flex items-center gap-2">
              {!selectMode ? (
                <button onClick={() => setSelectMode(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                  <CheckSquare className="h-3.5 w-3.5" /> Select
                </button>
              ) : (
                <>
                  <span className="text-xs text-gray-500">{selected.size} selected</span>
                  <button disabled={selected.size === 0} onClick={() => setPickerOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-lg px-3 py-1.5 hover:bg-emerald-200 disabled:opacity-50">
                    <FolderPlus className="h-3.5 w-3.5" /> Add to catalog
                  </button>
                  <button onClick={exitSelect} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </>
              )}
            </div>
          </div>

          {/* Grid */}
          <div id="gallery-scroll" className="flex-1 overflow-y-auto p-4 sm:p-6">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Array.from({ length: 18 }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Images className="h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm font-semibold text-gray-700">{hasFilters ? 'No images match your filters' : 'No images yet'}</p>
                <p className="text-xs text-gray-400">{hasFilters ? 'Try adjusting the direction, session, or date range' : 'Images shared in conversations will appear here'}</p>
                {hasFilters && <button onClick={clearFilters} className="mt-3 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg">Clear filters</button>}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {items.map((m, idx) => {
                  const isSel = selected.has(m.id);
                  const cats = m.catalogNames ? String(m.catalogNames).split(', ') : [];
                  return (
                    <button
                      key={m.id}
                      onClick={() => (selectMode ? toggleSelect(m) : setLightbox(idx))}
                      className={`group relative aspect-square rounded-xl overflow-hidden bg-gray-100 border transition-all ${
                        isSel ? 'border-emerald-500 ring-2 ring-emerald-400' : 'border-gray-200 hover:border-emerald-300 hover:shadow-md'
                      }`}
                    >
                      <img src={resolveUrl(m.mediaUrl)} alt="" loading="lazy"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.25'; }} />
                      {/* Direction badge */}
                      <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        m.direction === 'inbound' ? 'bg-white/85 text-gray-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {m.direction === 'inbound' ? 'IN' : 'OUT'}
                      </span>
                      {/* Catalog badge */}
                      {cats.length > 0 && (
                        <span title={cats.join(', ')}
                          className="absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 max-w-[70%] truncate">
                          <Layers className="h-2.5 w-2.5 flex-shrink-0" />
                          {cats[0]}{cats.length > 1 ? ` +${cats.length - 1}` : ''}
                        </span>
                      )}
                      {/* Select checkbox */}
                      {selectMode && (
                        <span className={`absolute bottom-1.5 right-1.5 h-5 w-5 rounded-md flex items-center justify-center border-2 ${
                          isSel ? 'bg-emerald-500 border-emerald-500' : 'bg-white/70 border-white'
                        }`}>
                          {isSel && <Check className="h-3.5 w-3.5 text-white" />}
                        </span>
                      )}
                      {!selectMode && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[11px] font-semibold text-white truncate">{m.customerName ?? m.customerPhone}</p>
                          <p className="text-[10px] text-white/70">{m.createdAt ? getRelativeTime(m.createdAt) : ''}</p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Pagination page={page} totalPages={totalPages} onChange={go}
            summary={total > 0 ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : undefined} />
        </>
      )}

      {/* ── CATALOGS TAB ── */}
      {tab === 'catalogs' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">Group product images into catalogs you can send to customers.</p>
            {canManage && (
              <button onClick={() => openCreate()}
                className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-100 rounded-lg px-3.5 py-2 hover:bg-emerald-200">
                <Plus className="h-4 w-4" /> New Catalog
              </button>
            )}
          </div>
          {catalogsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-52 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : catalogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Layers className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-700">No catalogs yet</p>
              <p className="text-xs text-gray-400">{canManage ? 'Create one, then add images from the Images tab' : 'Catalogs created by your team will appear here'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {catalogs.map((c: any) => (
                <div key={c.id} onClick={() => openDetail(c)}
                  className="group cursor-pointer rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md hover:border-emerald-300 transition-all">
                  <div className="aspect-[4/3] bg-gray-100 relative">
                    {c.coverUrl ? (
                      <img src={resolveUrl(c.coverUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center"><Layers className="h-8 w-8 text-gray-300" /></div>
                    )}
                    <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/60 text-white">
                      {c.itemCount} image{c.itemCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                      {canManage && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="h-6 w-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Edit className="h-3.5 w-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }} className="h-6 w-6 flex items-center justify-center rounded-md text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                    {c.info && <p className="text-xs text-gray-400 truncate mt-0.5">{c.info}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lightbox (images tab) ── */}
      {active && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}><X className="h-6 w-6" /></button>
          {lightbox! > 0 && <button className="absolute left-3 sm:left-6 text-white/70 hover:text-white" onClick={(e) => { e.stopPropagation(); setLightbox(lightbox! - 1); }}><ChevronLeft className="h-9 w-9" /></button>}
          {lightbox! < items.length - 1 && <button className="absolute right-3 sm:right-6 text-white/70 hover:text-white" onClick={(e) => { e.stopPropagation(); setLightbox(lightbox! + 1); }}><ChevronRight className="h-9 w-9" /></button>}
          <div className="max-w-4xl max-h-[88vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={resolveUrl(active.mediaUrl)} alt="" className="max-h-[78vh] max-w-full rounded-lg object-contain" />
            <div className="flex items-center flex-wrap justify-center gap-x-3 gap-y-1 text-sm text-white/90">
              <span className="font-semibold">{active.customerName ?? active.customerPhone}</span>
              <span className="text-white/40">·</span>
              <span className="text-white/70">{active.createdAt ? getRelativeTime(active.createdAt) : ''}</span>
              <a href={`/dashboard/conversations?id=${active.conversationId}`} className="ml-1 inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200"><ExternalLink className="h-3.5 w-3.5" /> Open chat</a>
              <a href={resolveUrl(active.mediaUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200"><Download className="h-3.5 w-3.5" /> Full size</a>
            </div>
          </div>
        </div>
      )}

      {/* ── Add-to-catalog picker ── */}
      {pickerOpen && createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-emerald-50">
              <h3 className="text-base font-bold text-emerald-700">Add {selected.size} image{selected.size === 1 ? '' : 's'} to…</h3>
              <button onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 max-h-[50vh] overflow-y-auto space-y-1.5">
              {canManage && (
                <button onClick={() => { setPickerOpen(false); openCreate(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-semibold">
                  <Plus className="h-4 w-4" /> Create new catalog
                </button>
              )}
              {catalogs.length === 0 && !canManage && <p className="text-sm text-gray-400 text-center py-6">No catalogs available.</p>}
              {catalogs.map((c: any) => (
                <button key={c.id} onClick={() => addSelectedToCatalog(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {c.coverUrl ? <img src={resolveUrl(c.coverUrl)} alt="" className="h-full w-full object-cover" /> : <Layers className="h-4 w-4 text-gray-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.itemCount} image{c.itemCount === 1 ? '' : 's'}</p>
                  </div>
                  <FolderPlus className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>, document.body)}

      {/* ── Catalog create/edit form ── */}
      {formOpen && createPortal(
        <div className="fixed inset-0 z-[151] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setFormOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-emerald-50">
              <h3 className="text-base font-bold text-emerald-700">{formEditing ? 'Edit Catalog' : 'New Catalog'}</h3>
              <button onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name <span className="text-red-400">*</span></label>
                <input value={formName} onChange={e => setFormName(e.target.value)} autoFocus placeholder="e.g. Summer Kurtis"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Info</label>
                <textarea value={formInfo} onChange={e => setFormInfo(e.target.value)} rows={3} placeholder="Short description (optional)"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50">
              <button onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={saveForm} disabled={formSaving} className="px-4 py-2 text-sm font-semibold bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50">
                {formSaving ? 'Saving…' : formEditing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>, document.body)}

      {/* ── Catalog detail ── */}
      {detail && createPortal(
        <div className="fixed inset-0 z-[150] flex flex-col bg-black/60 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="mt-auto sm:m-auto w-full sm:max-w-4xl sm:max-h-[88vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-emerald-50">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-emerald-700 truncate">{detail.name}</h3>
                {detail.info && <p className="text-xs text-gray-500 truncate">{detail.info}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canManage && (
                  <button onClick={addImagesFlow} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-lg px-3 py-1.5 hover:bg-emerald-200">
                    <Plus className="h-3.5 w-3.5" /> Add images
                  </button>
                )}
                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {detailLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />)}</div>
              ) : detail.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Layers className="h-9 w-9 text-gray-300 mb-2" />
                  <p className="text-sm font-semibold text-gray-700">No images in this catalog</p>
                  {canManage && <p className="text-xs text-gray-400">Use “Add images” to pick from the gallery</p>}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {detail.items.map((it: any) => (
                    <div key={it.id} className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                      <img src={resolveUrl(it.mediaUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {canManage && (
                        <button onClick={() => removeFromCatalog(it.id)} title="Remove"
                          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>, document.body)}

      {/* ── Delete confirm ── */}
      {deleteId !== null && createPortal(
        <div className="fixed inset-0 z-[152] flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Delete catalog?</h3>
            <p className="text-sm text-gray-500 mb-4">This removes the catalog and its image list. The original images stay in the gallery.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200">Delete</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
