'use client';

import { useEffect, useRef, useState } from 'react';
import { usersApi } from '@/services/api';
import { formatDateOnly } from '@/lib/utils';
import { UserCog, Edit, Trash2, Shield, Search, Download, Users, UserCheck, ChevronDown } from 'lucide-react';
import { FAB } from '@/components/ui/fab';
import { KPICard } from '@/components/ui/kpi-card';
import { UserModal, UserFormData } from '@/components/modals/UserModal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setShowRoleMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadUsers = async () => {
    try {
      const response = await usersApi.getAll();
      setUsers(response.data);
    } catch {
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setModalOpen(true);
  };

  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setModalOpen(true);
  };

  const handleSubmitUser = async (data: UserFormData) => {
    try {
      if (selectedUser) {
        await usersApi.update(selectedUser.id, data);
        showToast('User updated successfully', 'success');
      } else {
        await usersApi.create(data);
        showToast('User created successfully', 'success');
      }
      loadUsers();
    } catch (err) {
      showToast('Failed to save user', 'error');
      throw err;
    }
  };

  const handleDeleteClick = (user: any) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await usersApi.delete(userToDelete.id);
      showToast('User deleted successfully', 'success');
      loadUsers();
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    } catch {
      showToast('Failed to delete user', 'error');
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesRole = filterRole === 'all' || user.role.toLowerCase() === filterRole;
    const matchesSearch = (user.fullName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (user.email ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const activeUsers = users.filter(u => u.isActive).length;
  const inactiveUsers = users.filter(u => !u.isActive).length;
  const hodCount = users.filter(u => u.role === 'HOD').length;
  const managerCount = users.filter(u => u.role === 'Manager').length;
  const crrCount = users.filter(u => u.role === 'CRR').length;

  const handleExport = () => {
    const rows = [
      ['Name', 'Email', 'Role', 'Status'],
      ...filteredUsers.map(u => [u.fullName, u.email, u.role, u.isActive ? 'Active' : 'Inactive'])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'users.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'HOD':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'Manager':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'CRR':
        return 'bg-green-100 text-green-700 border-green-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="bg-white min-h-screen p-4 sm:p-6 lg:p-8">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6 items-stretch">
        <KPICard index={0} title="Total Users" value={users.length} icon={Users}
          iconColor="text-blue-600" iconBgColor="bg-blue-100"
          trend={{ value: `${activeUsers} active`, isPositive: true, icon: UserCheck }} />
        <KPICard index={1} title="Active Users" value={activeUsers} icon={UserCheck}
          iconColor="text-green-600" iconBgColor="bg-green-100"
          trend={{ value: `${inactiveUsers} inactive`, isPositive: activeUsers > inactiveUsers, icon: UserCheck }} />
        <KPICard index={2} title="HOD" value={hodCount} icon={Shield}
          iconColor="text-purple-600" iconBgColor="bg-purple-100"
          trend={{ value: `${((hodCount / users.length) * 100 || 0).toFixed(0)}% of total`, isPositive: true, icon: Shield }} />
        <KPICard index={3} title="Managers" value={managerCount} icon={Shield}
          iconColor="text-amber-600" iconBgColor="bg-amber-100"
          trend={{ value: `${((managerCount / users.length) * 100 || 0).toFixed(0)}% of total`, isPositive: true, icon: Shield }} />
        <KPICard index={4} title="CRR Agents" value={crrCount} icon={UserCog}
          iconColor="text-rose-600" iconBgColor="bg-rose-100"
          trend={{ value: `${((crrCount / users.length) * 100 || 0).toFixed(0)}% of total`, isPositive: true, icon: UserCog }} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        {/* Role Filter Dropdown */}
        <div className="relative" ref={roleMenuRef}>
          <button onClick={() => setShowRoleMenu(v => !v)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700
              hover:border-gray-300 hover:bg-gray-50 active:scale-95 transition-all duration-150 whitespace-nowrap shadow-sm">
            <Shield className="h-3.5 w-3.5 text-indigo-600" />
            {filterRole === 'all' ? `All (${users.length})` : filterRole === 'hod' ? `HOD (${hodCount})` : filterRole === 'manager' ? `Manager (${managerCount})` : `CRR (${crrCount})`}
            <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${showRoleMenu ? 'rotate-180' : ''}`} />
          </button>
          {showRoleMenu && (
            <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1">
              {[
                { key: 'all',     label: `All Users`,       count: users.length },
                { key: 'hod',     label: `HOD`,             count: hodCount },
                { key: 'manager', label: `Manager`,         count: managerCount },
                { key: 'crr',     label: `CRR`,             count: crrCount },
              ].map(({ key, label, count }) => (
                <button key={key} onClick={() => { setFilterRole(key); setShowRoleMenu(false); }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors duration-100 ${
                    filterRole === key ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  <span>{label}</span>
                  <span className="text-xs text-gray-400">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Export */}
        <button onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all whitespace-nowrap">
          <Download className="h-4 w-4 text-gray-400" />
          Export
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
            {['col-span-4','col-span-3','col-span-2','col-span-2','col-span-1'].map((c, i) => (
              <div key={i} className={`${c} skeleton h-4 rounded`} />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-12 gap-4 px-5 py-4 border-b border-gray-50 items-center">
              <div className="col-span-4 flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-full flex-shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="skeleton h-3.5 w-36 rounded" />
                  <div className="skeleton h-3 w-24 rounded" />
                </div>
              </div>
              <div className="col-span-3"><div className="skeleton h-3.5 w-40 rounded" /></div>
              <div className="col-span-2"><div className="skeleton h-6 w-16 rounded-full" /></div>
              <div className="col-span-2"><div className="skeleton h-6 w-16 rounded-full" /></div>
              <div className="col-span-1 flex justify-end gap-2">
                <div className="skeleton h-8 w-8 rounded-lg" />
                <div className="skeleton h-8 w-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <UserCog className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">No users found</h3>
          <p className="text-sm text-gray-400">
            {searchQuery ? 'Try adjusting your search or filters' : 'Tap the + button to add a user'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hidden lg:block animate-fade-up">
            <div className="grid grid-cols-12 gap-4 px-5 py-3.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div className="col-span-4">User</div>
              <div className="col-span-3">Email</div>
              <div className="col-span-2">Role</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>
            <div className="divide-y divide-gray-50">
              {filteredUsers.map((user) => (
                <div key={user.id}
                  className="grid grid-cols-12 gap-4 px-5 py-3.5 items-center
                    hover:bg-gray-50 hover:shadow-[inset_3px_0_0_#cbd5e1]
                    transition-all duration-150 group cursor-default">
                  {/* User */}
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-700 text-white flex items-center justify-center font-semibold text-xs flex-shrink-0
                      group-hover:scale-105 transition-transform duration-200">
                      {(user.fullName || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{user.fullName}</p>
                      <p className="text-xs text-gray-400">
                        Joined {formatDateOnly(user.createdAt)}
                      </p>
                    </div>
                  </div>
                  {/* Email */}
                  <div className="col-span-3">
                    <p className="text-sm text-gray-500 truncate">{user.email}</p>
                  </div>
                  {/* Role */}
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${getRoleBadgeColor(user.role)}`}>
                      <Shield className="h-3 w-3" />{user.role}
                    </span>
                  </div>
                  {/* Status */}
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      user.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? 'bg-green-500 pulse-dot' : 'bg-gray-400'}`} />
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {/* Actions */}
                  <div className="col-span-1 flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button onClick={() => handleEditUser(user)} title="Edit"
                      className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500
                        hover:bg-gray-100 hover:text-gray-800 active:scale-95 transition-all duration-150">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDeleteClick(user)} title="Delete"
                      className="h-8 w-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500
                        hover:bg-red-100 active:scale-95 transition-all duration-150">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredUsers.map((user, idx) => {
              const delays = ['delay-75','delay-150','delay-225','delay-300'];
              return (
              <div key={user.id} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4
                hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 animate-fade-up ${delays[idx % 4]}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-slate-700 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                      {(user.fullName || '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{user.fullName}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[150px]">{user.email}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full border ${
                    user.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${getRoleBadgeColor(user.role)}`}>
                    <Shield className="h-3 w-3" />{user.role}
                  </span>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleEditUser(user)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 active:scale-95 transition-all duration-150">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDeleteClick(user)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 active:scale-95 transition-all duration-150">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </>
      )}

      {/* User Modal */}
      <UserModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleSubmitUser}
        user={selectedUser}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Delete User"
        message={`Are you sure you want to delete "${userToDelete?.fullName}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Floating Action Button */}
      <FAB onClick={handleAddUser} label="Add User" />
    </div>
  );
}
