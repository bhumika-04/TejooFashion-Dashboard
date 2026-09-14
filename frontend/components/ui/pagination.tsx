'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
  /** Optional summary text shown on the left, e.g. "Showing 1–20 of 915". */
  summary?: string;
}

// Numbered pagination with first/last always visible and an ellipsis window around the current page.
export function Pagination({ page, totalPages, onChange, className, summary }: PaginationProps) {
  if (totalPages <= 1) return summary ? (
    <div className={`flex items-center justify-between px-4 py-3 text-xs text-gray-500 ${className ?? ''}`}>
      <span>{summary}</span>
    </div>
  ) : null;

  const window = 1; // pages to show on each side of the current page
  const keep: number[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - window && p <= page + window)) keep.push(p);
  }
  const items: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of keep) {
    if (p - prev > 1) items.push('gap');
    items.push(p);
    prev = p;
  }

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-gray-100 ${className ?? ''}`}>
      <span className="text-xs text-gray-500 truncate">{summary ?? `Page ${page} of ${totalPages}`}</span>
      <div className="flex items-center gap-1 flex-wrap justify-center sm:justify-end">
        <button
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 text-gray-500"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {items.map((it, i) =>
          it === 'gap' ? (
            <span key={`gap-${i}`} className="px-1.5 text-gray-400 text-sm select-none">…</span>
          ) : (
            <button
              key={it}
              onClick={() => onChange(it)}
              className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                it === page ? 'bg-emerald-100 text-emerald-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {it}
            </button>
          )
        )}
        <button
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 text-gray-500"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
