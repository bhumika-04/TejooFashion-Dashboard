'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle } from 'lucide-react';

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

  const isValid = formData.name.trim() && formData.description.trim() && formData.assigneeTeam.trim();

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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={submitting}
                >
                  <option value="High">High</option>
                  <option value="Normal">Normal</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            {/* Conditions */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Condition Threshold
                </label>
                <Input
                  value={formData.conditionThreshold}
                  onChange={(e) => setFormData({ ...formData, conditionThreshold: e.target.value })}
                  placeholder="e.g., 70 for confidence below 70%"
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Numeric value for threshold-based rules
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Condition Keywords
                </label>
                <Input
                  value={formData.conditionKeywords}
                  onChange={(e) => setFormData({ ...formData, conditionKeywords: e.target.value })}
                  placeholder="e.g., urgent,complaint,refund"
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Comma-separated keywords to detect
                </p>
              </div>
            </div>

            {/* Assignment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assignee Team <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.assigneeTeam}
                onChange={(e) => setFormData({ ...formData, assigneeTeam: e.target.value })}
                placeholder="e.g., Senior Support Team"
                disabled={submitting}
              />
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
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.notifyEmail}
                    onChange={(e) => setFormData({ ...formData, notifyEmail: e.target.checked })}
                    className="rounded"
                    disabled={submitting}
                  />
                  <span className="text-sm text-gray-700">Email Notification</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.notifySMS}
                    onChange={(e) => setFormData({ ...formData, notifySMS: e.target.checked })}
                    className="rounded"
                    disabled={submitting}
                  />
                  <span className="text-sm text-gray-700">SMS Notification</span>
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
