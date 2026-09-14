'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { quickRepliesApi } from '@/services/api';
import { Zap, Pencil, Trash2, X, Check } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { FAB } from '@/components/ui/fab';

const DEFAULT_CATEGORIES = ['General', 'Greeting', 'Order', 'Payment', 'Support', 'Closing'];

interface QuickReply {
  id: number;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
}

interface FormState {
  title: string;
  content: string;
  category: string;
  customCategory: string;
}

const emptyForm = (): FormState => ({ title: '', content: '', category: 'General', customCategory: '' });

export default function QuickRepliesPage() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState('');
  const { showToast } = useToast();
  const titleRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await quickRepliesApi.getAll();
      setReplies(res.data ?? []);
    } catch {
      showToast('Failed to load quick replies', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (showForm) setTimeout(() => titleRef.current?.focus(), 50);
  }, [showForm]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (r: QuickReply) => {
    setEditing(r);
    const isCustom = !DEFAULT_CATEGORIES.includes(r.category);
    setForm({
      title: r.title,
      content: r.content,
      category: isCustom ? '__custom__' : r.category,
      customCategory: isCustom ? r.category : '',
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const effectiveCategory = form.category === '__custom__' ? form.customCategory.trim() || 'General' : form.category;

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      showToast('Title and content are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { title: form.title.trim(), content: form.content.trim(), category: effectiveCategory };
      if (editing) {
        await quickRepliesApi.update(editing.id, payload);
        showToast('Quick reply updated', 'success');
      } else {
        await quickRepliesApi.create(payload);
        showToast('Quick reply created', 'success');
      }
      closeForm();
      load();
    } catch {
      showToast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await quickRepliesApi.delete(id);
      showToast('Deleted', 'success');
      setDeleteId(null);
      load();
    } catch {
      showToast('Failed to delete', 'error');
    }
  };

  // Group by category
  const grouped: Record<string, QuickReply[]> = {};
  replies
    .filter(r => !filterCat || r.category === filterCat)
    .forEach(r => {
      const cat = r.category ?? 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(r);
    });

  const allCategories = [...new Set(replies.map(r => r.category ?? 'General'))].sort();

  return (
    <div className="flex flex-col h-full min-h-0 bg-beige">
      {/* Category filter */}
      {allCategories.length > 1 && (
        <div className="bg-white border-b border-gray-100 px-6 py-2 flex gap-2 overflow-x-auto">
          <button onClick={() => setFilterCat('')}
            className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors ${!filterCat ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            All
          </button>
          {allCategories.map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat === filterCat ? '' : cat)}
              className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors ${filterCat === cat ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Zap className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">No quick replies yet</p>
            <button onClick={openCreate} className="mt-3 text-sm text-emerald-600 hover:text-emerald-800">
              Create your first one
            </button>
          </div>
        ) : (
          Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">{cat}</h3>
              <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                {items.map(r => (
                  <div key={r.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 group transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{r.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.content}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => openEdit(r)}
                        className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {deleteId === r.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(r.id)}
                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleteId(null)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteId(r.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Form modal (portaled to body so it sits above the app header) */}
      {showForm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[150] flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">{editing ? 'Edit Quick Reply' : 'New Quick Reply'}</h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Title *</label>
                <input ref={titleRef} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Order Confirmation"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white">
                  {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">Custom…</option>
                </select>
                {form.category === '__custom__' && (
                  <input value={form.customCategory} onChange={e => setForm(f => ({ ...f, customCategory: e.target.value }))}
                    placeholder="Enter category name"
                    className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Message Content *</label>
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Type the reply message…" rows={4}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                <p className="text-[11px] text-gray-400 mt-1">{form.content.length} characters</p>
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 text-sm py-2 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
              </button>
              <button onClick={closeForm}
                className="px-4 text-sm py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating add button — matches Sessions / Teams / Users */}
      <FAB onClick={openCreate} label="New Reply" />
    </div>
  );
}
