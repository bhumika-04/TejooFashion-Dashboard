'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Trash2, Users, Shield, Network, ChevronDown } from 'lucide-react';
import { teamsApi } from '@/services/api';
import { formatDateOnly } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { TeamTreeView } from '@/components/teams/TeamTreeView';

export interface TeamMembersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number;
  teamName: string;
  onMembersChanged?: () => void;
}

interface TeamMember {
  id: number;
  userId: number;
  fullName: string;
  email: string;
  roleInTeam: string;
  isActive: boolean;
  managerId: number | null;
  managerName: string | null;
  joinedAt: string;
}

interface AvailableUser {
  id: number;
  fullName: string;
  email: string;
  role: string;
}

export function TeamMembersModal({ open, onOpenChange, teamId, teamName, onMembersChanged }: TeamMembersModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRoleInTeam, setSelectedRoleInTeam] = useState<string>('CRR');
  const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'tree'>('list');
  const [userDropOpen, setUserDropOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const userDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      fetchMembers();
      fetchAvailableUsers();
    }
  }, [open, teamId]);

  // Close the user picker on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (userDropRef.current && !userDropRef.current.contains(e.target as Node)) setUserDropOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selectedUser = availableUsers.find(u => u.id === selectedUserId) || null;
  const filteredUsers = availableUsers.filter(u => {
    const q = userQuery.trim().toLowerCase();
    return !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const fetchMembers = async () => {
    try {
      const response = await teamsApi.getMembers(teamId);
      setMembers(response.data);
    } catch {
      showToast('Failed to load team members', 'error');
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const response = await teamsApi.getAvailableUsers(teamId);
      setAvailableUsers(response.data);
    } catch {
      showToast('Failed to load available users', 'error');
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) return;

    setLoading(true);
    try {
      await teamsApi.addMember(teamId, {
        userId: selectedUserId,
        roleInTeam: selectedRoleInTeam,
        managerId: selectedManagerId || undefined,
      });

      await fetchMembers();
      await fetchAvailableUsers();
      setShowAddForm(false);
      setSelectedUserId(null);
      setSelectedRoleInTeam('CRR');
      setSelectedManagerId(null);
      showToast('Member added successfully', 'success');
      onMembersChanged?.();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to add member', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateManager = async (memberId: number, newManagerId: number | null) => {
    setLoading(true);
    try {
      await teamsApi.updateMember(teamId, memberId, { managerId: newManagerId, updateManager: true });
      await fetchMembers();
      showToast('Manager updated successfully', 'success');
      onMembersChanged?.();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to update manager', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!confirm('Are you sure you want to remove this member from the team?')) return;

    setLoading(true);
    try {
      await teamsApi.removeMember(teamId, userId);
      await fetchMembers();
      await fetchAvailableUsers();
      showToast('Member removed successfully', 'success');
      onMembersChanged?.();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to remove member', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeColor = (roleInTeam: string) => {
    switch (roleInTeam) {
      case 'Admin':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'HOD':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Manager':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'CRR':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader onClose={() => onOpenChange(false)}>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Manage Members - {teamName}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {/* Tab Switcher */}
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'list'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-slate-600 border-transparent hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Member List
              </div>
            </button>
            <button
              onClick={() => setActiveTab('tree')}
              className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                activeTab === 'tree'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-slate-600 border-transparent hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                Hierarchy Tree
              </div>
            </button>
          </div>

          {activeTab === 'tree' ? (
            /* Tree View */
            <TeamTreeView members={members} teamName={teamName} />
          ) : (
            /* List View */
            <div className="space-y-6">
              {/* Add Member Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-blue-600" />
                  Add Team Member
                </h3>
                {!showAddForm && (
                  <Button
                    size="sm"
                    onClick={() => setShowAddForm(true)}
                    disabled={availableUsers.length === 0}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    Add Member
                  </Button>
                )}
              </div>

              {showAddForm && (
                <div className="space-y-3 bg-white p-4 rounded-md border border-slate-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select User <span className="text-red-500">*</span>
                    </label>
                    <div className="relative" ref={userDropRef}>
                      <button
                        type="button"
                        onClick={() => setUserDropOpen(o => !o)}
                        disabled={loading}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white text-left text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                      >
                        <span className={`truncate ${selectedUser ? 'text-gray-900' : 'text-gray-400'}`}>
                          {selectedUser ? `${selectedUser.fullName} · ${selectedUser.role}` : '-- Select User --'}
                        </span>
                        <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${userDropOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {userDropOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                          <div className="p-2 border-b border-gray-100">
                            <input
                              autoFocus
                              value={userQuery}
                              onChange={e => setUserQuery(e.target.value)}
                              placeholder="Search name, email or role…"
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                          </div>
                          <div className="max-h-56 overflow-y-auto py-1">
                            {filteredUsers.length === 0 ? (
                              <p className="px-3 py-2 text-sm text-gray-400">No matching users</p>
                            ) : filteredUsers.map(user => (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => { setSelectedUserId(user.id); setUserDropOpen(false); setUserQuery(''); }}
                                className={`w-full text-left px-3 py-2 transition-colors hover:bg-emerald-50 ${selectedUserId === user.id ? 'bg-emerald-50' : ''}`}
                              >
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {user.fullName} <span className="text-xs font-normal text-gray-400">({user.role})</span>
                                </p>
                                <p className="text-xs text-gray-400 truncate">{user.email}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Role in Team <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedRoleInTeam}
                      onChange={(e) => setSelectedRoleInTeam(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      disabled={loading}
                    >
                      <option value="CRR">CRR (Customer Relationship Representative)</option>
                      <option value="Manager">Manager</option>
                      <option value="HOD">HOD (Head of Department)</option>
                      <option value="Admin">Admin</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Select the role this user will have in this team
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reports To (Manager within this team)
                    </label>
                    <select
                      value={selectedManagerId || ''}
                      onChange={(e) => setSelectedManagerId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      disabled={loading}
                    >
                      <option value="">-- No Manager (Top Level) --</option>
                      {members
                        .filter((m) => ['Admin', 'HOD', 'Manager'].includes(m.roleInTeam))
                        .map((manager) => (
                          <option key={manager.userId} value={manager.userId}>
                            {manager.fullName} ({manager.roleInTeam})
                          </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Optional: Assign a reporting manager for this team member
                    </p>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddForm(false);
                        setSelectedUserId(null);
                        setSelectedRoleInTeam('CRR');
                        setSelectedManagerId(null);
                      }}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddMember}
                      disabled={loading || !selectedUserId}
                    >
                      {loading ? 'Adding...' : 'Add to Team'}
                    </Button>
                  </div>
                </div>
              )}

              {!showAddForm && availableUsers.length === 0 && (
                <p className="text-sm text-slate-600">
                  All active users are already members of this team.
                </p>
              )}
            </div>

            {/* Current Members List */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-600" />
                Current Members ({members.length})
              </h3>

              {members.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No members in this team yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-slate-900 truncate">{member.fullName}</p>
                          <Badge className={`flex-shrink-0 text-xs border ${getRoleBadgeColor(member.roleInTeam)}`}>
                            {member.roleInTeam}
                          </Badge>
                          {!member.isActive && (
                            <Badge className="flex-shrink-0 text-xs bg-red-100 text-red-800 border-red-300">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 truncate">{member.email}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                          <span className="flex-shrink-0">Joined: {formatDateOnly(member.joinedAt)}</span>
                          {member.managerName && (
                            <>
                              <span>•</span>
                              <span className="truncate">Reports to: {member.managerName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={member.managerId || ''}
                          onChange={(e) => handleUpdateManager(
                            member.id,
                            e.target.value ? Number(e.target.value) : null
                          )}
                          className="w-44 pl-2.5 pr-8 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          disabled={loading}
                          title="Reporting manager"
                        >
                          <option value="">No manager</option>
                          {members
                            .filter((m) => m.userId !== member.userId && ['Admin', 'HOD', 'Manager'].includes(m.roleInTeam))
                            .map((manager) => (
                              <option key={manager.userId} value={manager.userId}>
                                {manager.fullName}
                              </option>
                            ))}
                        </select>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveMember(member.userId)}
                          disabled={loading}
                          className="flex-shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
