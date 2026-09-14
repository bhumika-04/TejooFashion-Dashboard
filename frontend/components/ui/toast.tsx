'use client';

import * as React from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  isLeaving?: boolean;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

// Keep only the most recent few toasts so a burst of messages can't flood the screen.
const MAX_VISIBLE_TOASTS = 4;
const TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const showToast = React.useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => {
      // Collapse an immediately-repeated identical message into a single toast
      const last = prev[prev.length - 1];
      if (last && last.message === message && last.type === type) return prev;
      // Cap the stack — drop the oldest when over the limit
      return [...prev, { id, message, type, isLeaving: false }].slice(-MAX_VISIBLE_TOASTS);
    });

    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isLeaving: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 200);
    }, TOAST_DURATION_MS);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isLeaving: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

interface ToastItemProps {
  toast: Toast;
  onClose: () => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-600" />,
    error: <AlertCircle className="h-5 w-5 text-red-600" />,
    info: <Info className="h-5 w-5 text-blue-600" />,
  };

  const styles = {
    success: 'bg-green-50 border-green-300',
    error: 'bg-red-50 border-red-300',
    info: 'bg-blue-50 border-blue-300',
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border-2 shadow-lg backdrop-blur-sm transition-all duration-200',
        styles[toast.type],
        toast.isLeaving
          ? 'opacity-0 translate-x-full scale-95'
          : 'opacity-100 translate-x-0 scale-100 animate-in slide-in-from-right'
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <p className="flex-1 text-sm font-medium text-gray-900 leading-relaxed">{toast.message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg p-1 transition-all duration-200 hover:scale-110 active:scale-95"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
