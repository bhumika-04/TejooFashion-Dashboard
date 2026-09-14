'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TeamFormData) => Promise<void>;
  team?: any;
  managers?: any[];
}

export interface TeamFormData {
  name: string;
  description: string;
  managerId: number | null;
}

export function TeamModal({ open, onOpenChange, onSubmit, team, managers = [] }: TeamModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<TeamFormData>({
    name: '',
    description: '',
    managerId: null,
  });

  useEffect(() => {
    if (team) {
      setFormData({
        name: team.name || '',
        description: team.description || '',
        managerId: team.managerId || null,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        managerId: null,
      });
    }
  }, [team, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch {
      // parent handles error via toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader onClose={() => onOpenChange(false)}>
          <DialogTitle>{team ? 'Edit Team' : 'Create New Team'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div className="space-y-4">
              {/* Team Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Name <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., WhatsApp Support Team A"
                  required
                  disabled={loading}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of team responsibilities..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={loading}
                />
              </div>

              {/* Manager */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Manager
                </label>
                <select
                  value={formData.managerId || ''}
                  onChange={(e) => setFormData({ ...formData, managerId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={loading}
                >
                  <option value="">-- Select Manager --</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.fullName}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Only users with Manager, HOD, or ADMIN role can be assigned</p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : team ? 'Update Team' : 'Create Team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
