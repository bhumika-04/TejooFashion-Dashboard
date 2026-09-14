'use client';

import { useEffect, useState } from 'react';
import { tagsApi } from '@/services/api';
import { Tag as TagIcon, Plus, Edit, Trash2, Check, X, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const COLORS = ['#10B981', '#0EA5E9', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#3B82F6', '#64748B'];

interface TagRow { id: number; name: string; color: string; description?: string | null; }

export default function AutoTagManager() {
  const { showToast } = useToast();
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TagRow | null>(null);   // row being edited (or the new-row draft)
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try { const r = await tagsApi.getAll('conversation'); setTags(r.data ?? []); }
    catch { showToast('Failed to load tags', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startNew = () => setEditing({ id: 0, name: '', color: COLORS[0], description: '' });

  const save = async () => {
    if (!editing || !editing.name.trim()) { showToast('Enter a tag name', 'error'); return; }
    setSaving(true);
    try {
      if (editing.id > 0) {
        await tagsApi.update(editing.id, { name: editing.name.trim(), color: editing.color, description: editing.description ?? undefined });
        showToast('Tag updated', 'success');
      } else {
        await tagsApi.create(editing.name.trim(), editing.color, 'conversation', editing.description ?? undefined);
        showToast('Tag created', 'success');
      }
      setEditing(null); load();
    } catch { showToast('Failed to save tag', 'error'); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (deleteId === null) return;
    try { await tagsApi.delete(deleteId); showToast('Tag deleted', 'success'); setDeleteId(null); load(); }
    catch { showToast('Failed to delete tag', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-violet-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-gray-600">
          These conversation tags form the taxonomy the AI classifies chats into. Add a clear <b>description</b> for each
          so the AI knows when it applies. The AI auto-applies matching tags (marked ✨); an agent can change a
          conversation&apos;s tags at any time, which freezes the AI on that chat.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Conversation Tags ({tags.length})</p>
        <button onClick={startNew}
          className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-100 rounded-lg px-3.5 py-2 hover:bg-emerald-200">
          <Plus className="h-4 w-4" /> New Tag
        </button>
      </div>

      {/* New-row editor */}
      {editing && editing.id === 0 && <TagEditor draft={editing} setDraft={setEditing} save={save} saving={saving} onCancel={() => setEditing(null)} />}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : tags.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <TagIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No conversation tags yet. Add a few for the AI to classify into.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tags.map(t => editing && editing.id === t.id ? (
            <TagEditor key={t.id} draft={editing} setDraft={setEditing} save={save} saving={saving} onCancel={() => setEditing(null)} />
          ) : (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white">
              <span className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-400 truncate">{t.description || <span className="italic">No description — add one to improve AI accuracy</span>}</p>
              </div>
              <button onClick={() => setEditing({ ...t })} className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"><Edit className="h-3.5 w-3.5" /></button>
              <button onClick={() => setDeleteId(t.id)} className="h-8 w-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Delete tag?</h3>
            <p className="text-sm text-gray-500 mb-4">It will be removed from the taxonomy and from any conversations that carry it.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TagEditor({ draft, setDraft, save, saving, onCancel }: {
  draft: TagRow; setDraft: (t: TagRow) => void; save: () => void; saving: boolean; onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} autoFocus placeholder="Tag name (e.g. Bulk Order)"
          className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <div className="flex items-center gap-1.5">
          {COLORS.map(c => (
            <button key={c} onClick={() => setDraft({ ...draft, color: c })}
              className={`h-6 w-6 rounded-full ${draft.color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`} style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
      <textarea value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={2}
        placeholder="Description — when does this tag apply? (guides the AI, e.g. 'Customer asking for wholesale/bulk pricing')"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50">
          <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </div>
  );
}
