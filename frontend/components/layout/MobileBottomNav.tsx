'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, Phone, MessageSquare, AlertTriangle,
  BarChart3, Users, UserCog, Menu, Settings, LogOut, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { NotificationBell } from '@/components/layout/NotificationBell';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard/overview': 'Dashboard',
  '/dashboard/sessions': 'Sessions',
  '/dashboard/conversations': 'Conversations',
  '/dashboard/escalations': 'Escalations',
  '/dashboard/reports': 'Reports & Analytics',
  '/dashboard/teams': 'Teams',
  '/dashboard/users': 'Users',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/ai-prompts': 'AI Prompts',
  '/dashboard/settings': 'Settings',
  '/dashboard/performance': 'Performance',
  '/dashboard/role-management': 'Role Management',
};

const primaryNavigation = [
  { name: 'Overview', href: '/dashboard/overview', icon: LayoutDashboard },
  { name: 'Sessions', href: '/dashboard/sessions', icon: Phone },
  { name: 'Chats', href: '/dashboard/conversations', icon: MessageSquare },
  { name: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
];

const secondaryNavigation = [
  { name: 'Escalations', href: '/dashboard/escalations', icon: AlertTriangle },
  { name: 'Teams', href: '/dashboard/teams', icon: Users },
  { name: 'Users', href: '/dashboard/users', icon: UserCog },
];

interface CurrentUser { fullName: string; role: string; initials: string; }

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [showMore, setShowMore] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser>({ fullName: '—', role: '', initials: '?' });
  const profileRef = useRef<HTMLDivElement>(null);
  const pageTitle = PAGE_TITLES[pathname] ?? 'Dashboard';

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw);
        const fullName: string = parsed.fullName ?? parsed.FullName ?? '—';
        const role: string = parsed.role ?? parsed.Role ?? '';
        const initials = fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
        setCurrentUser({ fullName, role, initials });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setShowProfile(false);
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    document.cookie = 'authToken=; path=/; max-age=0';
    router.push('/login');
  };

  return (
    <>
      {/* ── MOBILE HEADER (lg:hidden) ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 bg-white border-b border-gray-100 shadow-sm">
        <h1 className="text-sm font-bold text-gray-900 truncate">{pageTitle}</h1>

        <div className="flex items-center gap-1">
          <NotificationBell />

          {/* Profile button */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-all duration-150"
            >
              <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center">
                <span className="text-xs font-bold text-white">{currentUser.initials}</span>
              </div>
              <ChevronDown className={cn('h-3.5 w-3.5 text-gray-500 transition-transform duration-200', showProfile && 'rotate-180')} />
            </button>

            {showProfile && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">{currentUser.fullName}</p>
                  {currentUser.role && (
                    <Badge className="mt-1 bg-gray-100 text-gray-700 text-xs">{currentUser.role}</Badge>
                  )}
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setShowProfile(false); router.push('/dashboard/settings'); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
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

      {/* More Menu Overlay */}
      {showMore && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowMore(false)}
          />
          <div className="lg:hidden fixed bottom-16 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-2xl rounded-t-2xl animate-slide-up">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">More Options</h3>
                <button
                  onClick={() => setShowMore(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {secondaryNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setShowMore(false)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl transition-all',
                        isActive ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <item.icon className="h-6 w-6" />
                      <span className="text-xs font-medium text-center">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg">
        <div className="grid grid-cols-5 h-16">
          {primaryNavigation.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 transition-all relative',
                  isActive ? 'text-indigo-600' : 'text-gray-500 active:bg-gray-100'
                )}
              >
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-600 rounded-b-full" />
                )}
                <item.icon className={cn('h-5 w-5', isActive && 'scale-110')} />
                <span className="text-xs font-medium">{item.name}</span>
              </Link>
            );
          })}

          {/* More Button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 transition-all relative',
              showMore ? 'text-indigo-600' : 'text-gray-500 active:bg-gray-100'
            )}
          >
            {showMore && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-600 rounded-b-full" />
            )}
            <Menu className={cn('h-5 w-5', showMore && 'scale-110')} />
            <span className="text-xs font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Spacer — accounts for both top and bottom fixed bars on mobile */}
      <div className="lg:hidden h-16" />
    </>
  );
}
