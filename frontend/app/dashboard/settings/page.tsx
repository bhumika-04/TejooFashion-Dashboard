'use client';

import { useState, useEffect } from 'react';
import { User, Lock, Save, Eye, EyeOff, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { usersApi, settingsApi } from '@/services/api';

export default function SettingsPage() {
  const { showToast } = useToast();
  const [userId, setUserId] = useState<number | null>(null);

  const [profileData, setProfileData] = useState({ fullName: '', email: '', phone: '', role: '' });
  const [profileSaving, setProfileSaving] = useState(false);

  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false });

  const isAdmin = (profileData.role ?? '').toUpperCase() === 'ADMIN';
  const [retention, setRetention] = useState<{ enabled: boolean; days: number }>({ enabled: false, days: 30 });
  const [retentionSaving, setRetentionSaving] = useState(false);
  useEffect(() => {
    settingsApi.getRetention()
      .then(r => setRetention({ enabled: !!r.data.enabled, days: r.data.days ?? 30 }))
      .catch(() => {});
  }, []);
  const handleRetentionSave = async () => {
    setRetentionSaving(true);
    try { await settingsApi.updateRetention(retention.enabled, retention.days); showToast('Retention settings saved', 'success'); }
    catch { showToast('Failed to save retention settings', 'error'); }
    finally { setRetentionSaving(false); }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return;
    const user = JSON.parse(storedUser);
    setUserId(user.id);
    usersApi.getById(user.id)
      .then(res => {
        const u = res.data;
        setProfileData({ fullName: u.fullName || '', email: u.email || '', phone: u.phone || '', role: u.role || '' });
      })
      .catch(() => {
        setProfileData({ fullName: user.fullName || '', email: user.email || '', phone: user.phone || '', role: user.role || '' });
      });
  }, []);

  const handleProfileSave = async () => {
    if (!userId) return;
    setProfileSaving(true);
    try {
      await usersApi.updateProfile(userId, { fullName: profileData.fullName, email: profileData.email, phone: profileData.phone });
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...user, ...profileData }));
      showToast('Profile updated successfully', 'success');
    } catch { showToast('Failed to update profile', 'error'); }
    finally { setProfileSaving(false); }
  };

  const handlePasswordSave = async () => {
    if (!userId) return;
    if (passwordData.newPassword !== passwordData.confirmPassword) { showToast('Passwords do not match', 'error'); return; }
    if (passwordData.newPassword.length < 6) { showToast('Minimum 6 characters required', 'error'); return; }
    setPasswordSaving(true);
    try {
      await usersApi.changePassword(userId, { currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword });
      showToast('Password updated successfully', 'success');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) { showToast(err.response?.data?.error || 'Failed to update password', 'error'); }
    finally { setPasswordSaving(false); }
  };

  return (
    <div className="bg-beige min-h-screen p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Profile */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center">
              <User className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Profile Settings</p>
              <p className="text-xs text-gray-400">Update your personal information</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {[
              { label: 'Full Name', key: 'fullName', type: 'text',  placeholder: 'Your full name',           required: true },
              { label: 'Email',     key: 'email',    type: 'email', placeholder: 'you@tejoofashions.co.in',  required: true },
              { label: 'Phone',     key: 'phone',    type: 'tel',   placeholder: '+91 9876543210',           required: false },
            ].map(({ label, key, type, placeholder, required }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {label}{required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type={type}
                  value={profileData[key as keyof typeof profileData]}
                  onChange={e => setProfileData(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className={inputCls}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Role</label>
              <input disabled value={profileData.role} className={`${inputCls} bg-gray-100 cursor-not-allowed`} />
              <p className="text-xs text-gray-400 mt-1">Contact admin to change your role</p>
            </div>
            <button onClick={handleProfileSave} disabled={profileSaving} className={btnCls('emerald')}>
              <Save className="h-4 w-4" />
              {profileSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="h-8 w-8 rounded-full bg-red-50 flex items-center justify-center">
              <Lock className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Change Password</p>
              <p className="text-xs text-gray-400">Update your account password</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {([
              { key: 'currentPassword' as const, label: 'Current Password', show: 'current' as const },
              { key: 'newPassword'     as const, label: 'New Password',     show: 'new'     as const },
              { key: 'confirmPassword' as const, label: 'Confirm Password', show: 'confirm' as const },
            ]).map(({ key, label, show }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {label} <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPwd[show] ? 'text' : 'password'}
                    value={passwordData[key]}
                    onChange={e => setPasswordData(p => ({ ...p, [key]: e.target.value }))}
                    placeholder="••••••••"
                    className={`${inputCls} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(p => ({ ...p, [show]: !p[show] }))}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPwd[show] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {key === 'newPassword' && <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>}
              </div>
            ))}
            <button onClick={handlePasswordSave} disabled={passwordSaving} className={btnCls('red')}>
              <Lock className="h-4 w-4" />
              {passwordSaving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </div>

      </div>

      {/* Data Retention — admin only */}
      {isAdmin && (
        <div className="max-w-5xl mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center"><Clock className="h-4 w-4 text-amber-600" /></div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Data Retention</p>
              <p className="text-xs text-gray-400">Automatically delete old messages (an AI summary is kept)</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
              <div className="pr-4">
                <p className="font-semibold text-gray-900">Enable message purge</p>
                <p className="text-sm text-gray-500">Older messages are permanently deleted; the cumulative summary becomes the record. Off by default.</p>
              </div>
              <button onClick={() => setRetention(r => ({ ...r, enabled: !r.enabled }))}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${retention.enabled ? 'bg-red-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${retention.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Keep messages for</label>
              <input type="number" min={1} max={3650} value={retention.days}
                onChange={e => setRetention(r => ({ ...r, days: Number(e.target.value) }))}
                className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <span className="text-sm text-gray-500">days</span>
            </div>
            {retention.enabled && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                ⚠ This permanently deletes messages older than {retention.days} days, every day. It cannot be undone.
              </p>
            )}
            <button onClick={handleRetentionSave} disabled={retentionSaving} className={btnCls('emerald')}>
              <Save className="h-4 w-4" /> {retentionSaving ? 'Saving…' : 'Save Retention'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent focus:bg-white transition-all';

const btnCls = (color: 'emerald' | 'red') =>
  `flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
    color === 'emerald' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
  }`;
