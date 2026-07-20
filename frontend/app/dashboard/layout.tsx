'use client';

import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import RouteGuard from '@/components/layout/RouteGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-white pt-14 lg:pt-0 pb-16 lg:pb-0 animate-fade-in">
          <RouteGuard>{children}</RouteGuard>
          <MobileBottomNav />
        </main>
      </div>
    </div>
  );
}
