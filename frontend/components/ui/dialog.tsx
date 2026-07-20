'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!isVisible && !open) return null;
  if (typeof document === 'undefined') return null;

  // Portaled to <body> so the overlay always sits above the app header/chrome
  // (the header has its own stacking layer; an in-page modal would render under it).
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Backdrop with fade animation */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0'
        )}
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog content with scale animation */}
      <div
        className={cn(
          'relative z-[151] w-full max-w-lg transform transition-all duration-200',
          open ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogContent({ children, className }: DialogContentProps) {
  return (
    <div className={cn('bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100', className)}>
      {children}
    </div>
  );
}

interface DialogHeaderProps {
  children: React.ReactNode;
  onClose?: () => void;
}

export function DialogHeader({ children, onClose }: DialogHeaderProps) {
  return (
    <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50">
      {children}
      {onClose && (
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 hover:bg-white/80 rounded-lg p-1.5 transition-all duration-200 hover:scale-110 active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogTitle({ children, className }: DialogTitleProps) {
  return <h2 className={className ?? "text-xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent"}>{children}</h2>;
}

interface DialogBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogBody({ children, className }: DialogBodyProps) {
  return <div className={cn('p-6 max-h-[calc(100vh-300px)] overflow-y-auto', className)}>{children}</div>;
}

interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div className={cn('flex justify-end gap-3 p-6 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-slate-50', className)}>
      {children}
    </div>
  );
}
