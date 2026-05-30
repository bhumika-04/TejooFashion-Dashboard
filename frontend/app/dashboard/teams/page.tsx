'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { teamsApi, usersApi } from '@/services/api';
import { Users, Edit, Trash2, Eye, UserPlus, UserCheck } from 'lucide-react';
import { FAB } from '@/components/ui/fab';
import { KPICard } from '@/components/ui/kpi-card';
import { TeamModal, TeamFormData } from '@/components/modals/TeamModal';
import { TeamMembersModal } from '@/components/modals/TeamMembersModal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<Record<number, any[]>>({});
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [selectedTeamForMembers, setSelectedTeamForMembers] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<any>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadTeams();
    loadManagers();
  }, []);

  const loadTeams = async () => {
    try {
      const response = await teamsApi.getAll();
      setTeams(response.data);

      // Load members for each team
      const membersData: Record<number, any[]> = {};
      for (const team of response.data) {
        try {
          const membersResponse = await teamsApi.getMembers(team.id);
          membersData[team.id] = membersResponse.data;
        } catch {
          membersData[team.id] = [];
        }
      }
      setTeamMembers(membersData);
    } catch {
      showToast('Failed to load teams', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadManagers = async () => {
    try {
      const response = await usersApi.getAll();
      const managerUsers = response.data.filter(
        (user: any) => user.role === 'Manager' || user.role === 'HOD' || user.role === 'ADMIN'
      );
      setManagers(managerUsers);
    } catch {
      // silently ignore
    }
  };

  const getTeamMembers = (teamId: number) => {
    return teamMembers[teamId] || [];
  };

  const handleCreateTeam = () => {
    setSelectedTeam(null);
    setModalOpen(true);
  };

  const handleEditTeam = (team: any) => {
    setSelectedTeam(team);
    setModalOpen(true);
  };

  const handleManageMembers = (team: any) => {
    setSelectedTeamForMembers(team);
    setMembersModalOpen(true);
  };

  const handleViewHierarchy = (teamId: number) => {
    router.push(`/dashboard/teams/${teamId}/hierarchy`);
  };

  const handleSubmitTeam = async (data: TeamFormData) => {
    try {
      if (selectedTeam) {
        await teamsApi.update(selectedTeam.id, data);
        showToast('Team updated successfully', 'success');
      } else {
        await teamsApi.create(data);
        showToast('Team created successfully', 'success');
      }
      loadTeams();
    } catch (err) {
      showToast('Failed to save team', 'error');
      throw err;
    }
  };

  const handleDeleteClick = (team: any) => {
    setTeamToDelete(team);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!teamToDelete) return;
    try {
      await teamsApi.delete(teamToDelete.id);
      showToast('Team deleted successfully', 'success');
      loadTeams();
      setDeleteDialogOpen(false);
      setTeamToDelete(null);
    } catch {
      showToast('Failed to delete team', 'error');
    }
  };



  const activeTeams = teams.filter(t => t.isActive).length;
  const totalMembers = Object.values(teamMembers).reduce((sum, m) => sum + m.length, 0);
  const avgMembers = teams.length ? (totalMembers / teams.length).toFixed(1) : '0';

  const filteredTeams = teams;

  return (
    <div className="bg-white min-h-screen p-4 sm:p-6 lg:p-8">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 items-stretch">
        <KPICard index={0} title="Total Teams" value={teams.length} icon={Users}
          iconColor="text-indigo-600" iconBgColor="bg-indigo-100"
          trend={{ value: `${activeTeams} active`, isPositive: true, icon: UserCheck }} />
        <KPICard index={1} title="Active Teams" value={activeTeams} icon={UserCheck}
          iconColor="text-green-600" iconBgColor="bg-green-100"
          trend={{ value: `${teams.length - activeTeams} inactive`, isPositive: activeTeams >= teams.length - activeTeams, icon: UserCheck }} />
        <KPICard index={2} title="Total Members" value={totalMembers} icon={Users}
          iconColor="text-purple-600" iconBgColor="bg-purple-100"
          trend={{ value: `Across ${teams.length} teams`, isPositive: true, icon: Users }} />
        <KPICard index={3} title="Avg Team Size" value={avgMembers} icon={Users}
          iconColor="text-amber-600" iconBgColor="bg-amber-100"
          trend={{ value: `members per team`, isPositive: true, icon: Users }} />
      </div>


      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="skeleton h-8 w-8 rounded-full" />
                  <div className="skeleton h-4 w-28 rounded" />
                </div>
                <div className="skeleton h-5 w-14 rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-3/4 rounded" />
              </div>
              <div className="skeleton h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">No teams yet</h3>
          <p className="text-sm text-gray-400">Tap the + button to create your first team</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTeams.map((team, idx) => {
            const members = getTeamMembers(team.id);
            const delays = ['delay-75','delay-150','delay-225','delay-300','delay-375'];
            return (
              <div key={team.id} className={`group bg-white rounded-xl border border-gray-100 shadow-sm
                hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-out
                overflow-hidden flex flex-col animate-fade-up ${delays[idx % 5]}`}>

                {/* Header */}
                <div className="flex items-start justify-between p-4 border-b border-gray-50">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0
                      group-hover:scale-105 transition-transform duration-300">
                      <Users className="h-4 w-4 text-slate-600" />
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{team.name}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ml-2 ${
                    team.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${team.isActive ? 'bg-green-500 pulse-dot' : 'bg-gray-400'}`} />
                    {team.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Body */}
                <div className="p-4 flex-1 space-y-3">
                  {team.description && (
                    <p className="text-xs text-gray-400 line-clamp-2">{team.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Manager</p>
                      <p className="text-sm font-semibold text-gray-900">{team.managerName || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Members</p>
                      <div className="flex items-center gap-1.5 justify-end">
                        <p className="text-2xl font-bold text-gray-900">{members.length}</p>
                        {members.length > 0 && (
                          <button onClick={() => handleViewHierarchy(team.id)} title="View hierarchy"
                            className="p-1 rounded-lg bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all duration-150">
                            <Eye className="h-4 w-4 text-gray-600" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 flex gap-2">
                  <button onClick={() => handleManageMembers(team)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-semibold
                      bg-slate-800 text-white rounded-lg hover:bg-slate-700 active:scale-95 transition-all duration-150">
                    <UserPlus className="h-3.5 w-3.5" />
                    Members
                  </button>
                  <button onClick={() => handleEditTeam(team)} title="Edit"
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200
                      text-gray-500 hover:bg-gray-100 active:scale-95 transition-all duration-150">
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDeleteClick(team)} title="Delete"
                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-red-50
                      text-red-500 hover:bg-red-100 active:scale-95 transition-all duration-150">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Team Modal */}
      <TeamModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleSubmitTeam}
        team={selectedTeam}
        managers={managers}
      />

      {/* Team Members Modal */}
      {selectedTeamForMembers && (
        <TeamMembersModal
          open={membersModalOpen}
          onOpenChange={setMembersModalOpen}
          teamId={selectedTeamForMembers.id}
          teamName={selectedTeamForMembers.name}
          onMembersChanged={loadTeams}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Team"
        message={`Are you sure you want to delete "${teamToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Floating Action Button */}
      <FAB onClick={handleCreateTeam} label="Create Team" />
    </div>
  );
}
