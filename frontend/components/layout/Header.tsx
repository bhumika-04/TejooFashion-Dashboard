'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { OverviewRangeFilter } from '@/components/layout/OverviewRangeFilter';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard/overview': 'Overview',
  '/dashboard/sessions': 'Sessions',
  '/dashboard/conversations': 'Conversations',
  '/dashboard/customers': 'Customers',
  '/dashboard/gallery': 'Gallery',
  '/dashboard/system': 'System Health',
  '/dashboard/escalations': 'Escalations',
  '/dashboard/reports': 'Reports & Analytics',
  '/dashboard/teams': 'Teams',
  '/dashboard/users': 'Users',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/ai-prompts': 'AI Prompts',
  '/dashboard/settings': 'Settings',
  '/dashboard/performance': 'Performance',
  '/dashboard/role-management': 'Role Management',
  '/dashboard/audit-logs': 'Audit Logs',
  '/dashboard/webhook-logs': 'Webhook Logs',
  '/dashboard/quick-replies': 'Quick Replies',
  '/dashboard/search': 'Search',
};

interface CurrentUser {
  fullName: string;
  email: string;
  role: string;
  initials: string;
}

export default function Header() {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser>({ fullName: '—', email: '', role: '', initials: '?' });
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] ?? 'Dashboard';

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw);
        const fullName: string = parsed.fullName ?? parsed.FullName ?? '—';
        const email: string = parsed.email ?? parsed.Email ?? '';
        const role: string = parsed.role ?? parsed.Role ?? '';
        const initials = fullName
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        setCurrentUser({ fullName, email, role, initials });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setShowProfileMenu(false);
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    document.cookie = 'authToken=; path=/; max-age=0';
    router.push('/login');
  };

  return (
    <header className="hidden lg:flex relative z-40 h-16 items-center justify-between px-6 bg-beige/80 backdrop-blur-sm border-b border-beige-200 shadow-sm animate-fade-in">
      {/* Page title */}
      <h1 className="text-lg font-bold text-gray-900">{pageTitle}</h1>

      <div className="flex items-center gap-4">
        {/* Page-wide date filter (Overview / Reports / Performance) — each initialises to its own default */}
        {pathname === '/dashboard/overview' && <OverviewRangeFilter />}
        {pathname === '/dashboard/reports' && <OverviewRangeFilter initial="This Week" />}
        {pathname === '/dashboard/performance' && <OverviewRangeFilter initial="Today" />}

        {/* Notification Bell — real API, polling, mark-as-read */}
        <NotificationBell />

        {/* Profile — click opens Settings, dropdown still has Logout */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 active:scale-95 transition-all duration-200"
          >
            <div
              onClick={e => { e.stopPropagation(); router.push('/dashboard/settings'); }}
              className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center hover:ring-2 hover:ring-emerald-400 transition-all cursor-pointer"
              title="Profile Settings"
            >
              <span className="text-sm font-bold text-slate-700">{currentUser.initials}</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">{currentUser.fullName}</p>
              <p className="text-xs text-gray-500">{currentUser.role}</p>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-gray-600 transition-transform duration-200',
                showProfileMenu && 'rotate-180'
              )}
            />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">{currentUser.fullName}</p>
                <p className="text-xs text-gray-500">{currentUser.email}</p>
                {currentUser.role && (
                  <Badge className="mt-2 bg-gray-100 text-gray-700 text-xs">{currentUser.role}</Badge>
                )}
              </div>
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
