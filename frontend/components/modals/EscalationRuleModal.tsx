'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle } from 'lucide-react';
import { teamsApi, usersApi } from '@/services/api';

const ESCALATION_ROLES = ['MANAGER', 'HOD', 'ADMIN'];

// What each rule type needs and how it fires — shown under the type picker.
const TYPE_HELP: Record<string, string> = {
  Custom: 'Fires when a customer message contains any of the keywords (whole words or phrases).',
  NegativeSentiment: 'Fires on the keywords below, or — if left empty — on the built-in complaint / angry words list.',
  PaymentIntent: 'Fires on the keywords below, or — if left empty — when the AI classifies the message as a payment or credit query.',
  LowConfidence: 'Fires when the AI drafts a reply with confidence below the threshold (numbers using AI Suggest or Auto mode).',
};

interface EscalationRuleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: any;
  onSubmit: (data: any) => Promise<void>;
}

export default function EscalationRuleModal({ open, onOpenChange, rule, onSubmit }: EscalationRuleModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    ruleType: 'Custom',
    priority: 'Normal',
    isActive: true,
    conditionThreshold: '',
    conditionKeywords: '',
    assigneeTeam: '',
    assigneeUserId: null as number | null,
    notifyDashboard: true,
    notifyEmail: false,
    notifySMS: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [teams, setTeams] = useState<{ id: number; name: string; managerName?: string }[]>([]);
  const [people, setPeople] = useState<{ id: number; fullName: string; role: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    teamsApi.getAll(true).then(r => setTeams(r.data ?? [])).catch(() => {});
    usersApi.getAll(true)
      .then(r => setPeople((r.data ?? []).filter((u: any) => ESCALATION_ROLES.includes((u.role ?? '').toUpperCase()))))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (rule) {
      setFormData({
        name: rule.name || '',
        description: rule.description || '',
        ruleType: rule.ruleType || 'Custom',
        priority: rule.priority || 'Normal',
        isActive: rule.isActive ?? true,
        conditionThreshold: rule.conditionThreshold || '',
        conditionKeywords: rule.conditionKeywords || '',
        assigneeTeam: rule.assigneeTeam || '',
        assigneeUserId: rule.assigneeUserId || null,
        notifyDashboard: rule.notifyDashboard ?? true,
        notifyEmail: rule.notifyEmail ?? false,
        notifySMS: rule.notifySMS ?? false,
      });
    } else {
      // Reset for new rule
      setFormData({
        name: '',
        description: '',
        ruleType: 'Custom',
        priority: 'Normal',
        isActive: true,
        conditionThreshold: '',
        conditionKeywords: '',
        assigneeTeam: '',
        assigneeUserId: null,
        notifyDashboard: true,
        notifyEmail: false,
        notifySMS: false,
      });
    }
  }, [rule, open]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch {
      // parent handles error via toast
    } finally {
      setSubmitting(false);
    }
  };

  const isLowConfidence = formData.ruleType === 'LowConfidence';
  const threshold = Number(formData.conditionThreshold);
  const hasKeywords = formData.conditionKeywords.split(',').some(k => k.trim());
  const isValid = !!formData.name.trim() && !!formData.description.trim()
    && (!isLowConfidence || (threshold > 0 && threshold <= 100))
    && (formData.ruleType !== 'Custom' || hasKeywords);
  // Keep a saved team name selectable even if that team was renamed/removed since.
  const teamMissing = !!formData.assigneeTeam && !teams.some(t => t.name === formData.assigneeTeam);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader onClose={() => onOpenChange(false)}>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-purple-600" />
            {rule ? 'Edit Escalation Rule' : 'Create Escalation Rule'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {/* Basic Info */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rule Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., High Value Customer Detected"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what triggers this rule"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={submitting}
              />
            </div>

            {/* Rule Type and Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rule Type
                </label>
                <select
                  value={formData.ruleType}
                  onChange={(e) => setFormData({ ...formData, ruleType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={submitting}
                >
                  <option value="LowConfidence">Low Confidence</option>
                  <option value="NegativeSentiment">Negative Sentiment</option>
                  <option value="PaymentIntent">Payment Intent</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={submitting}
                >
                  <option value="High">High</option>
                  <option value="Normal">Normal</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <p className="text-xs text-gray-500 -mt-2">{TYPE_HELP[formData.ruleType] ?? TYPE_HELP.Custom}</p>

            {/* Conditions */}
            {isLowConfidence ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Escalate when AI confidence is below (%) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number" min={1} max={100}
                  value={formData.conditionThreshold}
                  onChange={(e) => setFormData({ ...formData, conditionThreshold: e.target.value })}
                  placeholder="e.g., 50"
                  disabled={submitting}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Keywords {formData.ruleType === 'Custom' && <span className="text-red-500">*</span>}
                </label>
                <Input
                  value={formData.conditionKeywords}
                  onChange={(e) => setFormData({ ...formData, conditionKeywords: e.target.value })}
                  placeholder="e.g., urgent,complaint,refund"
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Comma-separated words or phrases, matched as whole words (&quot;return&quot; won&apos;t match &quot;returned&quot;). Avoid very common words like &quot;today&quot;.
                </p>
              </div>
            )}

            {/* Assignment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Escalate to team</label>
                <select
                  value={formData.assigneeTeam}
                  onChange={(e) => setFormData({ ...formData, assigneeTeam: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={submitting}
                >
                  <option value="">Chat owner&apos;s own manager</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.name}>{t.name}{t.managerName ? ` — ${t.managerName}` : ''}</option>
                  ))}
                  {teamMissing && <option value={formData.assigneeTeam}>{formData.assigneeTeam} (not found)</option>}
                </select>
                <p className="text-xs text-gray-500 mt-1">Goes to that team&apos;s manager (or HOD).</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Or a specific person</label>
                <select
                  value={formData.assigneeUserId ?? ''}
                  onChange={(e) => setFormData({ ...formData, assigneeUserId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={submitting}
                >
                  <option value="">— none —</option>
                  {people.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">Overrides the team when set.</p>
              </div>
            </div>

            {/* Notification Channels */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Notification Channels
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.notifyDashboard}
                    onChange={(e) => setFormData({ ...formData, notifyDashboard: e.target.checked })}
                    className="rounded"
                    disabled={submitting}
                  />
                  <span className="text-sm text-gray-700">Dashboard Notification</span>
                </label>
                {/* No email/SMS sender is configured on the server yet, so these can't be switched on. */}
                <label className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                  <input type="checkbox" checked={false} disabled className="rounded" />
                  <span className="text-sm text-gray-700">Email Notification <span className="text-xs text-gray-500">(not set up)</span></span>
                </label>
                <label className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                  <input type="checkbox" checked={false} disabled className="rounded" />
                  <span className="text-sm text-gray-700">SMS Notification <span className="text-xs text-gray-500">(not set up)</span></span>
                </label>
              </div>
            </div>

            {/* Active Status */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded"
                  disabled={submitting}
                />
                <span className="text-sm font-medium text-gray-700">Rule is Active</span>
              </label>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !isValid}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {submitting ? 'Saving...' : rule ? 'Update Rule' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
