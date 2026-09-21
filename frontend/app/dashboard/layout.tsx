'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import RouteGuard from '@/components/layout/RouteGuard';
import { AiCreditWarning } from '@/components/layout/AiCreditWarning';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Conversations hides the mobile top header for a full-height chat, so drop the top padding
  // that reserves space for it (mobile only; lg keeps its own layout).
  const noMobileTopBar = pathname === '/dashboard/conversations';

  return (
    <div className="flex h-screen overflow-hidden bg-beige">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <AiCreditWarning />
        <main className={`flex-1 overflow-y-auto overflow-x-hidden bg-beige ${noMobileTopBar ? 'pt-0' : 'pt-14'} lg:pt-0 pb-16 lg:pb-0 animate-fade-in`}>
          <RouteGuard>{children}</RouteGuard>
          <MobileBottomNav />
        </main>
      </div>
    </div>
  );
}
