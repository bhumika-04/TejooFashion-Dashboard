'use client';

import { useEffect, useState, useCallback } from 'react';
import { rolePermissionsApi } from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ShieldCheck } from 'lucide-react';

const ROLES = ['Admin', 'HOD', 'Manager', 'CRR', 'Agent'];

const PAGES: { key: string; label: string }[] = [
  { key: 'overview',        label: 'Overview' },
  { key: 'sessions',        label: 'Sessions' },
  { key: 'conversations',   label: 'Conversations' },
  { key: 'customers',       label: 'Customers' },
  { key: 'escalations',     label: 'Escalations' },
  { key: 'reports',         label: 'Reports & Analytics' },
  { key: 'performance',     label: 'Performance' },
  { key: 'teams',           label: 'Teams' },
  { key: 'users',           label: 'Users' },
  { key: 'role-management', label: 'Role Management' },
  { key: 'audit-logs',      label: 'Audit Logs' },
  { key: 'webhook-logs',    label: 'Webhook Logs' },
  { key: 'quick-replies',   label: 'Quick Replies' },
  { key: 'notifications',   label: 'Notifications' },
  { key: 'ai-prompts',      label: 'AI Prompts' },
  { key: 'settings',        label: 'Settings' },
];

type Matrix = Record<string, Record<string, boolean>>;

export default function RoleManagementPage() {
  const [matrix, setMatrix]     = useState<Matrix>({});
  const [original, setOriginal] = useState<Matrix>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rolePermissionsApi.getAll();
      const data: Matrix = res.data;
      const filled: Matrix = {};
      for (const role of ROLES) {
        filled[role] = {};
        for (const { key } of PAGES) {
          filled[role][key] = data[role]?.[key] ?? false;
        }
      }
      setMatrix(filled);
      setOriginal(JSON.parse(JSON.stringify(filled)));
      setDirty(false);
    } catch {
      showToast('Failed to load permissions', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const toggle = (role: string, page: string) => {
    if (role === 'Admin') return;
    setMatrix(prev => ({
      ...prev,
      [role]: { ...prev[role], [page]: !prev[role][page] },
    }));
    setDirty(true);
  };

  const handleCancel = () => {
    setMatrix(JSON.parse(JSON.stringify(original)));
    setDirty(false);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Save all non-Admin roles in parallel
      await Promise.all(
        ROLES.filter(r => r !== 'Admin').map(role =>
          rolePermissionsApi.bulkUpdate(role, matrix[role])
        )
      );
      setOriginal(JSON.parse(JSON.stringify(matrix)));
      setDirty(false);
      showToast('Permissions saved successfully', 'success');
    } catch {
      showToast('Failed to save permissions', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen p-4 sm:p-6 lg:p-8">
      <div>

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-8">
          <ShieldCheck className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Control which pages are visible to each user role. Changes take effect on the user&apos;s next page load.
            <strong> Admin</strong> always has full access and cannot be restricted.
          </p>
        </div>

        {/* Permission matrix */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-4 font-semibold text-gray-500 text-xs uppercase tracking-wide w-48">
                    Page
                  </th>
                  {ROLES.map(role => (
                    <th key={role} className="px-4 py-4 text-center min-w-[110px]">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="font-semibold text-gray-700 text-xs uppercase tracking-wide">{role}</span>
                        {role === 'Admin' && (
                          <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">Full access</Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {PAGES.map(({ key, label }) => (
                  <tr key={key} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-700">{label}</td>
                    {ROLES.map(role => {
                      const checked = matrix[role]?.[key] ?? false;
                      const isAdmin = role === 'Admin';
                      return (
                        <td key={role} className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => toggle(role, key)}
                            disabled={isAdmin}
                            className={`
                              w-10 h-6 rounded-full transition-colors duration-200 relative
                              ${checked ? 'bg-indigo-600' : 'bg-gray-200'}
                              ${isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}
                            `}
                            title={isAdmin ? 'Admin always has full access' : checked ? 'Click to revoke' : 'Click to grant'}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action buttons — bottom of content block */}
        <div className="flex justify-end gap-3 mt-6">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={saving || !dirty}
            className="px-5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveAll}
            disabled={saving || !dirty}
            className={`px-6 transition-all duration-200 ${
              dirty
                ? 'bg-indigo-700 hover:bg-indigo-800 text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
