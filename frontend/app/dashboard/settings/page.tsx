'use client';

import { useState, useEffect } from 'react';
import { User, Lock, Save, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { usersApi } from '@/services/api';

export default function SettingsPage() {
  const { showToast } = useToast();
  const [userId, setUserId] = useState<number | null>(null);

  const [profileData, setProfileData] = useState({ fullName: '', email: '', phone: '', role: '' });
  const [profileSaving, setProfileSaving] = useState(false);

  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false });

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
    <div className="bg-white min-h-screen p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Profile */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center">
              <User className="h-4 w-4 text-indigo-600" />
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
            <button onClick={handleProfileSave} disabled={profileSaving} className={btnCls('indigo')}>
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
    </div>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent focus:bg-white transition-all';

const btnCls = (color: 'indigo' | 'red') =>
  `flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 ${
    color === 'indigo' ? 'bg-indigo-700 hover:bg-indigo-800' : 'bg-red-600 hover:bg-red-700'
  }`;
