'use client';

import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="flex flex-col items-center text-center animate-fade-in">
        <p className="text-8xl font-black text-gray-100 select-none leading-none mb-2">404</p>
        <div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4 -mt-2">
          <LayoutDashboard className="h-7 w-7 text-indigo-400" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">Page not found</h1>
        <p className="text-sm text-gray-400 mb-6 max-w-xs">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/dashboard/overview"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold
            bg-indigo-700 text-white rounded-lg hover:bg-indigo-800 active:scale-95 transition-all duration-150"
        >
          <LayoutDashboard className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
