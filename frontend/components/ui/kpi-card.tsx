'use client';

import { LucideIcon, ArrowUpRight } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Theme = 'blue' | 'emerald' | 'purple' | 'green' | 'teal' | 'amber' | 'orange' | 'rose' | 'cyan';

const THEMES: Record<Theme, { bg: string; border: string; title: string; watermark: string; chip: string; chipText: string }> = {
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-100',    title: 'text-blue-600',    watermark: 'text-blue-200',    chip: 'bg-blue-100',    chipText: 'text-blue-600'    },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', title: 'text-emerald-600', watermark: 'text-emerald-200', chip: 'bg-emerald-100', chipText: 'text-emerald-600' },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-100',  title: 'text-purple-600',  watermark: 'text-purple-200',  chip: 'bg-purple-100',  chipText: 'text-purple-600'  },
  green:   { bg: 'bg-green-50',   border: 'border-green-100',   title: 'text-green-600',   watermark: 'text-green-200',   chip: 'bg-green-100',   chipText: 'text-green-600'   },
  teal:    { bg: 'bg-teal-50',    border: 'border-teal-100',    title: 'text-teal-600',    watermark: 'text-teal-200',    chip: 'bg-teal-100',    chipText: 'text-teal-600'    },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-100',   title: 'text-amber-600',   watermark: 'text-amber-200',   chip: 'bg-amber-100',   chipText: 'text-amber-600'   },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-100',  title: 'text-orange-600',  watermark: 'text-orange-200',  chip: 'bg-orange-100',  chipText: 'text-orange-600'  },
  rose:    { bg: 'bg-rose-50',    border: 'border-rose-100',    title: 'text-rose-600',    watermark: 'text-rose-200',    chip: 'bg-rose-100',    chipText: 'text-rose-600'    },
  cyan:    { bg: 'bg-cyan-50',    border: 'border-cyan-100',    title: 'text-cyan-600',    watermark: 'text-cyan-200',    chip: 'bg-cyan-100',    chipText: 'text-cyan-600'    },
};

// Animate the numeric part of a value (keeps surrounding text: %, s, ₹, /, etc.), easing from the
// previous value to the new one — so both first load and live refreshes feel smooth, not jumpy.
function useCountUp(value: string | number, durationMs = 900) {
  const str = String(value);
  const match = str.match(/-?[\d,]*\.?\d+/);
  const target = match ? parseFloat(match[0].replace(/,/g, '')) : null;
  const decimals = match ? (match[0].split('.')[1]?.length ?? 0) : 0;
  const [display, setDisplay] = useState<string>(target != null ? str.replace(match![0], (0).toFixed(decimals)) : str);
  const prevRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (target == null) { setDisplay(str); return; }
    const startVal = prevRef.current;
    prevRef.current = target;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const current = startVal + (target - startVal) * eased;
      const formatted = current.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      setDisplay(str.replace(match![0], formatted));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [str]);

  return { display, isZero: target === 0 };
}

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  theme?: Theme;
  // Legacy props kept for backward compat
  iconColor?: string;
  iconBgColor?: string;
  subtitle?: ReactNode;
  subtitleText?: string;
  trend?: {
    value: string;
    isPositive: boolean;
    icon: LucideIcon;
  };
  index?: number;
  href?: string;
  className?: string;
}

export function KPICard({
  title,
  value,
  icon: Icon,
  theme,
  iconColor,
  iconBgColor,
  trend,
  subtitle,
  subtitleText,
  index = 0,
  href,
  className,
}: KPICardProps) {
  const resolvedTheme: Theme = theme
    ?? (iconColor?.includes('blue')   ? 'blue'
      : iconColor?.includes('emerald') ? 'emerald'
      : iconColor?.includes('purple') ? 'purple'
      : iconColor?.includes('green')  ? 'green'
      : iconColor?.includes('teal')   ? 'teal'
      : iconColor?.includes('amber')  ? 'amber'
      : iconColor?.includes('orange') ? 'orange'
      : iconColor?.includes('rose')   ? 'rose'
      : iconColor?.includes('cyan')   ? 'cyan'
      : 'emerald');

  const t = THEMES[resolvedTheme];
  const delays = ['delay-75', 'delay-150', 'delay-225', 'delay-300', 'delay-375'];
  const delay = delays[index % delays.length];
  const { display, isZero } = useCountUp(value);

  const inner = (
    <div className={`group relative overflow-hidden rounded-2xl p-5 border ${t.bg} ${t.border}
      hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out
      flex flex-col h-full cursor-default animate-fade-up ${delay} ${!href ? className ?? '' : ''}`}>

      {/* Faint watermark icon — large, bottom-right */}
      <div className="absolute -bottom-3 -right-3 pointer-events-none">
        <Icon className={`h-24 w-24 ${t.watermark} opacity-60 group-hover:opacity-90 group-hover:scale-110 transition-all duration-500`} strokeWidth={1} />
      </div>

      {/* Top row: title + solid coloured icon chip */}
      <div className="flex items-start justify-between mb-2.5 relative z-10">
        <p className={`text-[11px] font-bold uppercase tracking-widest leading-tight pt-1.5 ${t.title}`}>
          {title}
        </p>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${t.chip} shadow-sm group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`h-[18px] w-[18px] ${t.chipText}`} strokeWidth={2.2} />
        </div>
      </div>

      {/* Big number (animated count-up) */}
      <p className={`text-3xl font-extrabold tabular-nums tracking-tight leading-none mb-1 relative z-10 ${isZero ? 'text-gray-400' : 'text-gray-900'}`}>
        {display}
      </p>

      {/* Subtitle / trend */}
      <div className="mt-auto relative z-10">
        {subtitleText && (
          <p className={`text-xs font-medium mt-1 ${t.title} opacity-70`}>{subtitleText}</p>
        )}
        {subtitle && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1">{subtitle}</div>
        )}
        {trend && (
          <p className={`flex items-center gap-1 text-xs font-semibold mt-1 ${trend.isPositive ? 'text-green-600' : 'text-red-500'}`}>
            <trend.icon className="h-3 w-3" />
            {trend.value}
          </p>
        )}
        {href && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold mt-1.5 ${t.title} opacity-0 group-hover:opacity-100 transition-opacity`}>
            View <ArrowUpRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );

  return href ? <Link href={href} className={`block h-full ${className ?? ''}`}>{inner}</Link> : inner;
}
