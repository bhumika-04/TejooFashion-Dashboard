'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Phone, MessageSquare, AlertTriangle, BarChart3,
  ChevronLeft, ChevronRight, ChevronDown,
  Settings, TrendingUp, UserRound, Zap, Images,
  Users, ShieldCheck, UsersRound, ClipboardList, Webhook, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

const MAIN_NAV = [
  { name: 'Overview',            href: '/dashboard/overview',      icon: LayoutDashboard, page: 'overview' },
  { name: 'Sessions',            href: '/dashboard/sessions',      icon: Phone,           page: 'sessions' },
  { name: 'Conversations',       href: '/dashboard/conversations', icon: MessageSquare,   page: 'conversations' },
  { name: 'Customers',           href: '/dashboard/customers',     icon: UserRound,       page: 'customers' },
  { name: 'Gallery',             href: '/dashboard/gallery',       icon: Images,          page: 'gallery' },
  { name: 'Escalations',         href: '/dashboard/escalations',   icon: AlertTriangle,   page: 'escalations' },
  { name: 'Reports & Analytics', href: '/dashboard/reports',       icon: BarChart3,       page: 'reports' },
  { name: 'Performance',         href: '/dashboard/performance',   icon: TrendingUp,      page: 'performance' },
  { name: 'Quick Replies',       href: '/dashboard/quick-replies', icon: Zap,             page: 'quick-replies' },
];

const SETTINGS_SUB = [
  { name: 'User Management',  href: '/dashboard/users',           icon: Users,         page: 'users' },
  { name: 'Role Management',  href: '/dashboard/role-management', icon: ShieldCheck,   page: 'role-management' },
  { name: 'Teams',            href: '/dashboard/teams',           icon: UsersRound,    page: 'teams' },
  // Audit Logs, Webhook Logs and System Health are developer-only — hidden from navigation,
  // reachable by direct URL only.
];

const SETTINGS_PAGES = new Set(SETTINGS_SUB.map(s => s.href));

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ fullName: string; role: string } | null>(null);
  const { canAccess, allowedPages } = usePermissions();

  // Auto-open settings dropdown if current page is a settings sub-page
  useEffect(() => {
    if (SETTINGS_PAGES.has(pathname)) setSettingsOpen(true);
  }, [pathname]);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem('user');
        if (raw) {
          const p = JSON.parse(raw);
          setCurrentUser({ fullName: p.fullName ?? p.FullName ?? '', role: p.role ?? p.Role ?? '' });
        }
      } catch { /* ignore */ }
    };
    read();
    window.addEventListener('devRoleChanged', read);
    return () => window.removeEventListener('devRoleChanged', read);
  }, []);

  const filteredMain = allowedPages === null ? MAIN_NAV : MAIN_NAV.filter(item => canAccess(item.page));
  const filteredSub  = allowedPages === null ? SETTINGS_SUB : SETTINGS_SUB.filter(item => canAccess(item.page));

  const isSettingsActive = SETTINGS_PAGES.has(pathname);

  const initials = currentUser?.fullName
    ? currentUser.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div className={cn(
      'hidden lg:flex h-screen flex-col bg-beige border-r border-beige-200 transition-all duration-300 ease-in-out flex-shrink-0',
      isCollapsed ? 'w-[68px]' : 'w-60'
    )}>
      {/* Brand wordmark — border matches the header separator (same height + colour) so the line is continuous */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-beige-200">
        {!isCollapsed && (
          <span className="animate-fade-in text-lg font-bold tracking-tight leading-none">
            <span className="text-emerald-700">Tejoo</span>
            <span className="text-gray-800"> Fashion</span>
          </span>
        )}
        <button
          onClick={() => setIsCollapsed(v => !v)}
          className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-all duration-150 text-gray-400 hover:text-gray-600 flex-shrink-0 ml-auto"
        >
          {isCollapsed
            ? <ChevronRight className="h-4 w-4 transition-transform duration-300" />
            : <ChevronLeft  className="h-4 w-4 transition-transform duration-300" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">

        {/* Main nav items */}
        {filteredMain.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={cn(
                'relative flex items-center rounded-xl transition-all duration-200 ease-in-out group overflow-hidden',
                isCollapsed ? 'justify-center px-0 py-3 mx-1' : 'px-3 py-2.5',
                isActive
                  ? 'bg-emerald-100 text-emerald-700 shadow-sm font-semibold'
                  : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-700'
              )}
            >
              {isActive && !isCollapsed && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-emerald-600" />
              )}
              <item.icon className={cn(
                'h-[17px] w-[17px] flex-shrink-0 transition-all duration-200',
                isActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-600 group-hover:scale-110'
              )} />
              {!isCollapsed && (
                <span className={cn(
                  'ml-3 text-[13px] transition-all duration-200',
                  isActive ? 'font-semibold text-emerald-700' : 'font-medium text-gray-500 group-hover:text-emerald-700'
                )}>
                  {item.name}
                </span>
              )}
            </Link>
          );
        })}

        {/* Settings dropdown */}
        {filteredSub.length > 0 && (
          <div>
            {/* Settings toggle button */}
            <button
              onClick={() => {
                if (isCollapsed) {
                  setIsCollapsed(false);
                  setSettingsOpen(true);
                } else {
                  setSettingsOpen(v => !v);
                }
              }}
              title={isCollapsed ? 'Settings' : undefined}
              className={cn(
                'w-full flex items-center rounded-xl transition-all duration-200 group',
                isCollapsed ? 'justify-center px-0 py-3 mx-1' : 'px-3 py-2.5',
                isSettingsActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-700'
              )}
            >
              <Settings className={cn(
                'h-[17px] w-[17px] flex-shrink-0 transition-all duration-200',
                isSettingsActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-600 group-hover:scale-110'
              )} />
              {!isCollapsed && (
                <>
                  <span className={cn(
                    'ml-3 text-[13px] font-medium flex-1 text-left transition-all duration-200',
                    isSettingsActive ? 'text-emerald-700 font-semibold' : 'text-gray-500 group-hover:text-emerald-700'
                  )}>
                    Settings
                  </span>
                  <ChevronDown className={cn(
                    'h-3.5 w-3.5 text-gray-400 transition-transform duration-200',
                    settingsOpen && 'rotate-180'
                  )} />
                </>
              )}
            </button>

            {/* Sub-items */}
            {settingsOpen && !isCollapsed && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
                {filteredSub.map((sub) => {
                  const isActive = pathname === sub.href;
                  return (
                    <Link
                      key={sub.name}
                      href={sub.href}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] transition-all duration-150 group',
                        isActive
                          ? 'bg-emerald-100 text-emerald-700 font-semibold'
                          : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 font-medium'
                      )}
                    >
                      <sub.icon className={cn(
                        'h-3.5 w-3.5 flex-shrink-0',
                        isActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-600'
                      )} />
                      {sub.name}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User avatar */}
      <div className="px-2 py-3 border-t border-gray-100">
        <div
          onClick={() => router.push('/dashboard/settings')}
          title="Profile & Settings"
          className={cn(
            'flex items-center rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all duration-200 cursor-pointer',
            isCollapsed ? 'justify-center p-2 mx-1' : 'gap-3 px-3 py-2.5'
          )}
        >
          <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 ring-2 ring-gray-100">
            <span className="text-xs font-bold text-slate-700">{initials}</span>
          </div>
          {!isCollapsed && currentUser && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 truncate">{currentUser.fullName}</p>
              <p className="text-[11px] text-gray-400">{currentUser.role}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
