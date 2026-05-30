'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FABProps {
  onClick: () => void;
  icon?: LucideIcon;
  label?: string;
  className?: string;
}

export function FAB({ onClick, icon: Icon, label, className }: FABProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'fixed bottom-6 right-6 z-40',
        'h-14 w-14 rounded-full bg-slate-800 text-white',
        'flex items-center justify-center',
        'hover:bg-slate-700 hover:scale-110 active:scale-95',
        'transition-all duration-200 ease-out',
        'focus:outline-none focus:ring-4 focus:ring-slate-300',
        'shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.28)]',
        'animate-fade-up',
        className
      )}
    >
      {Icon ? (
        <Icon className="h-6 w-6" strokeWidth={2.5} />
      ) : (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      )}
    </button>
  );
}
