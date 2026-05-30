import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// All timestamps are displayed in Kolkata/IST timezone (GMT+5:30)
const IST = 'Asia/Kolkata';

/**
 * Parse a date string from the backend as UTC.
 * Backend returns naive strings without Z — append Z to force UTC interpretation.
 */
function parseUTC(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  const s = date.trim();
  if (s.endsWith('Z') || s.includes('+') || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  return new Date(s + 'Z');
}

/** Exported for components that need the parsed Date object */
export function parseUTCDate(date: string | Date | null | undefined): Date | null {
  return parseUTC(date);
}

// Helper: extract date parts in IST using Intl
function istParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return parts as Record<string, string>;
}

/** DD-MM-YYYY, HH:mm  — always in IST */
export function formatDate(date: string | Date | null | undefined): string {
  const d = parseUTC(date);
  if (!d) return '—';
  const p = istParts(d);
  return `${p.day}-${p.month}-${p.year}, ${p.hour}:${p.minute}`;
}

/** DD-MM-YYYY (no time) — always in IST */
export function formatDateOnly(date: string | Date | null | undefined): string {
  const d = parseUTC(date);
  if (!d) return '—';
  const fmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: '2-digit', year: 'numeric' });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.day}-${parts.month}-${parts.year}`;
}

/** DD-MM — for chart axis labels in IST */
export function formatChartDate(date: string | Date | null | undefined): string {
  const d = parseUTC(date);
  if (!d) return '—';
  const fmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.day}-${parts.month}`;
}

/** HH:mm — always in IST */
export function formatTime(date: string | Date | null | undefined): string {
  const d = parseUTC(date);
  if (!d) return '—';
  const fmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.hour}:${parts.minute}`;
}

/** Indian number system: 10,00,000.58 */
export function formatNumber(value: number | null | undefined, decimals?: number): string {
  if (value == null || isNaN(value as number)) return '0';
  return (value as number).toLocaleString('en-IN', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 0,
  });
}

export function getRelativeTime(date: string | Date | null | undefined): string {
  const then = parseUTC(date);
  if (!then) return '—';
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);

  if (seconds < 60)     return 'just now';
  if (seconds < 3600)   return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(date);
}
