import { LucideIcon, ArrowUpRight } from 'lucide-react';
import { ReactNode } from 'react';
import Link from 'next/link';

type Theme = 'blue' | 'indigo' | 'purple' | 'green' | 'teal' | 'amber' | 'orange' | 'rose' | 'cyan';

const THEMES: Record<Theme, { bg: string; border: string; title: string; watermark: string }> = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   title: 'text-blue-600',   watermark: 'text-blue-200'   },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', title: 'text-indigo-600', watermark: 'text-indigo-200' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-100', title: 'text-purple-600', watermark: 'text-purple-200' },
  green:  { bg: 'bg-green-50',  border: 'border-green-100',  title: 'text-green-600',  watermark: 'text-green-200'  },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-100',   title: 'text-teal-600',   watermark: 'text-teal-200'   },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  title: 'text-amber-600',  watermark: 'text-amber-200'  },
  orange: { bg: 'bg-orange-50', border: 'border-orange-100', title: 'text-orange-600', watermark: 'text-orange-200' },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-100',   title: 'text-rose-600',   watermark: 'text-rose-200'   },
  cyan:   { bg: 'bg-cyan-50',   border: 'border-cyan-100',   title: 'text-cyan-600',   watermark: 'text-cyan-200'   },
};

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
}: KPICardProps) {
  // Pick theme from explicit prop or derive from iconColor class
  const resolvedTheme: Theme = theme
    ?? (iconColor?.includes('blue')   ? 'blue'
      : iconColor?.includes('indigo') ? 'indigo'
      : iconColor?.includes('purple') ? 'purple'
      : iconColor?.includes('green')  ? 'green'
      : iconColor?.includes('teal')   ? 'teal'
      : iconColor?.includes('amber')  ? 'amber'
      : iconColor?.includes('orange') ? 'orange'
      : iconColor?.includes('rose')   ? 'rose'
      : iconColor?.includes('cyan')   ? 'cyan'
      : 'indigo');

  const t = THEMES[resolvedTheme];
  const delays = ['delay-75', 'delay-150', 'delay-225', 'delay-300', 'delay-375'];
  const delay = delays[index % delays.length];

  const inner = (
    <div className={`relative overflow-hidden rounded-2xl p-5 border ${t.bg} ${t.border}
      hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ease-out
      flex flex-col h-full cursor-default animate-fade-up ${delay}`}>

      {/* Watermark icon — large, bottom-right */}
      <div className="absolute -bottom-3 -right-3 pointer-events-none">
        <Icon className={`h-24 w-24 ${t.watermark}`} strokeWidth={1} />
      </div>

      {/* Top row: title + optional arrow */}
      <div className="flex items-start justify-between mb-2 relative z-10">
        <p className={`text-[11px] font-bold uppercase tracking-widest leading-tight ${t.title}`}>
          {title}
        </p>
        {href && (
          <div className={`h-6 w-6 rounded-full flex items-center justify-center ${t.bg} border ${t.border} flex-shrink-0`}>
            <ArrowUpRight className={`h-3.5 w-3.5 ${t.title}`} />
          </div>
        )}
      </div>

      {/* Big number */}
      <p className="text-3xl font-extrabold text-gray-900 tabular-nums tracking-tight leading-none mb-1 relative z-10">
        {value}
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
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}
