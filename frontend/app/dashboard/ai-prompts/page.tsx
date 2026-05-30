'use client';

import { useEffect, useState } from 'react';
import { aiPromptsApi } from '@/services/api';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  Bot,
  Edit3,
  ToggleLeft,
  ToggleRight,
  Save,
  X,
  Info,
  Zap,
  RefreshCw,
} from 'lucide-react';

interface AiPrompt {
  id: number;
  promptKey: string;
  promptType: string;
  systemPrompt: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const PROMPT_KEY_META: Record<string, { label: string; desc: string; color: string }> = {
  router: {
    label: 'Router',
    desc: 'Classifies incoming messages and routes to the right specialist. Runs on every message.',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  general_query: {
    label: 'General Query',
    desc: 'Handles general questions about Tejoo Fashions that don\'t fit other categories.',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  order_status: {
    label: 'Order Status',
    desc: 'Responds to questions about order tracking, delivery, and shipment.',
    color: 'bg-green-100 text-green-700 border-green-200',
  },
  payment_query: {
    label: 'Payment Query',
    desc: 'Handles payment, refund, and billing related questions.',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  },
  product_inquiry: {
    label: 'Product Inquiry',
    desc: 'Answers questions about products, sizes, availability, and catalog.',
    color: 'bg-pink-100 text-pink-700 border-pink-200',
  },
  followup_query: {
    label: 'Follow-up',
    desc: 'Handles follow-up messages and conversations that need continuity.',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
};

export default function AiPromptsPage() {
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await aiPromptsApi.getAll();
      setPrompts(res.data);
    } catch {
      showToast('Failed to load prompts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (p: AiPrompt) => {
    setEditingId(p.id);
    setEditText(p.systemPrompt);
    setEditDesc(p.description ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditDesc('');
  };

  const handleSave = async (id: number) => {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      await aiPromptsApi.update(id, {
        systemPrompt: editText.trim(),
        description: editDesc.trim() || undefined,
      });
      setPrompts(prev => prev.map(p => p.id === id
        ? { ...p, systemPrompt: editText.trim(), description: editDesc.trim() || p.description, updatedAt: new Date().toISOString() }
        : p
      ));
      setEditingId(null);
      showToast('Prompt saved — AI will use new version immediately', 'success');
    } catch {
      showToast('Failed to save prompt', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p: AiPrompt) => {
    try {
      await aiPromptsApi.toggle(p.id, !p.isActive);
      setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
      showToast(`Prompt ${!p.isActive ? 'activated' : 'deactivated'}`, 'success');
    } catch {
      showToast('Failed to toggle prompt', 'error');
    }
  };

  const routerPrompts = prompts.filter(p => p.promptType === 'router');
  const specialistPrompts = prompts.filter(p => p.promptType === 'specialist');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
      {/* Refresh */}
      <div className="flex justify-end mb-6">
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-8">
        <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <strong>How it works:</strong> Every incoming WhatsApp message first goes through the <strong>Router</strong> prompt, which decides the customer's intent. Then the matching <strong>Specialist</strong> prompt generates the response. Deactivating a specialist falls back to the General Query prompt.
        </div>
      </div>

      {/* Router Prompt Section */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-800">Router Prompt</h2>
          <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">Runs on every message</Badge>
        </div>
        <div className="space-y-4">
          {routerPrompts.map(p => (
            <PromptCard
              key={p.id}
              prompt={p}
              isEditing={editingId === p.id}
              editText={editText}
              editDesc={editDesc}
              saving={saving}
              onEdit={() => startEdit(p)}
              onCancel={cancelEdit}
              onSave={() => handleSave(p.id)}
              onToggle={() => handleToggle(p)}
              onTextChange={setEditText}
              onDescChange={setEditDesc}
            />
          ))}
        </div>
      </section>

      {/* Specialist Prompts Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">Specialist Prompts</h2>
          <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">Used by intent</Badge>
        </div>
        <div className="space-y-4">
          {specialistPrompts.map(p => (
            <PromptCard
              key={p.id}
              prompt={p}
              isEditing={editingId === p.id}
              editText={editText}
              editDesc={editDesc}
              saving={saving}
              onEdit={() => startEdit(p)}
              onCancel={cancelEdit}
              onSave={() => handleSave(p.id)}
              onToggle={() => handleToggle(p)}
              onTextChange={setEditText}
              onDescChange={setEditDesc}
            />
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}

function PromptCard({
  prompt,
  isEditing,
  editText,
  editDesc,
  saving,
  onEdit,
  onCancel,
  onSave,
  onToggle,
  onTextChange,
  onDescChange,
}: {
  prompt: AiPrompt;
  isEditing: boolean;
  editText: string;
  editDesc: string;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onToggle: () => void;
  onTextChange: (v: string) => void;
  onDescChange: (v: string) => void;
}) {
  const meta = PROMPT_KEY_META[prompt.promptKey] ?? {
    label: prompt.promptKey,
    desc: '',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  return (
    <div className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-shadow duration-200 hover:shadow-md ${isEditing ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-100'} ${!prompt.isActive ? 'opacity-60' : ''}`}>
      {/* Card Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`text-xs font-semibold ${meta.color}`}>
            {meta.label}
          </Badge>
          <span className="text-xs text-gray-400 font-mono">{prompt.promptKey}</span>
          {!prompt.isActive && (
            <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
              Inactive
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <>
              <button
                onClick={onToggle}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title={prompt.isActive ? 'Deactivate' : 'Activate'}
              >
                {prompt.isActive
                  ? <ToggleRight className="h-5 w-5 text-green-500" />
                  : <ToggleLeft className="h-5 w-5 text-gray-400" />
                }
              </button>
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5 text-xs">
                <Edit3 className="h-3.5 w-3.5" />
                Edit
              </Button>
            </>
          )}
          {isEditing && (
            <>
              <Button size="sm" variant="outline" onClick={onCancel} className="gap-1.5 text-xs">
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={onSave}
                disabled={saving || !editText.trim()}
                className="gap-1.5 text-xs bg-indigo-700 hover:bg-indigo-800 text-white"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {meta.desc && (
        <div className="px-5 py-2.5 bg-gray-50/30 border-b border-gray-100">
          <p className="text-xs text-gray-500">{meta.desc}</p>
        </div>
      )}

      {/* Prompt Text */}
      <div className="px-5 py-4">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 block">
                Description (optional)
              </label>
              <input
                type="text"
                value={editDesc}
                onChange={e => onDescChange(e.target.value)}
                placeholder="Short description of what this prompt does"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 block">
                System Prompt
              </label>
              <textarea
                value={editText}
                onChange={e => onTextChange(e.target.value)}
                rows={12}
                className="w-full text-sm font-mono border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y leading-relaxed"
                placeholder="Enter the system prompt…"
              />
              <p className="text-xs text-gray-400 mt-1">{editText.length} characters</p>
            </div>
          </div>
        ) : (
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
            {prompt.systemPrompt || <span className="text-gray-400 italic">No prompt set</span>}
          </pre>
        )}
      </div>

      {/* Footer */}
      {!isEditing && (
        <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/30">
          <p className="text-xs text-gray-400">
            Last updated: {formatDate(prompt.updatedAt)}
          </p>
        </div>
      )}
    </div>
  );
}
