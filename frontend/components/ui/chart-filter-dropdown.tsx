'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterRange =
  | 'Today'
  | 'This Week'
  | 'Last Week'
  | 'This Month'
  | 'Last Month'
  | 'Last 3 Months'
  | 'Custom Range';

const FILTER_OPTIONS: FilterRange[] = [
  'Today',
  'This Week',
  'Last Week',
  'This Month',
  'Last Month',
  'Last 3 Months',
  'Custom Range',
];

interface ChartFilterDropdownProps {
  value: FilterRange;
  onChange: (value: FilterRange, customFrom?: string, customTo?: string) => void;
}

export function ChartFilterDropdown({ value, onChange }: ChartFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (opt: FilterRange) => {
    if (opt === 'Custom Range') {
      setShowCustom(true);
      return;
    }
    onChange(opt);
    setOpen(false);
    setShowCustom(false);
  };

  const handleCustomApply = () => {
    if (!customFrom || !customTo) return;
    onChange('Custom Range', customFrom, customTo);
    setOpen(false);
    setShowCustom(false);
  };

  const displayLabel =
    value === 'Custom Range' && customFrom && customTo
      ? `${customFrom} → ${customTo}`
      : value;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(v => !v); setShowCustom(false); }}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 shadow-sm"
      >
        <Calendar className="h-3.5 w-3.5 text-gray-400" />
        <span>{displayLabel}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-gray-400 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {!showCustom ? (
            <div className="py-1">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'w-full text-left px-4 py-2 text-sm transition-colors',
                    value === opt
                      ? 'bg-indigo-700 text-white font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-800">Custom Range</span>
                <button onClick={() => setShowCustom(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-2 mb-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">To</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <button
                onClick={handleCustomApply}
                disabled={!customFrom || !customTo}
                className="w-full py-2 text-sm font-medium bg-indigo-700 text-white rounded-lg hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
