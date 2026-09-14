import { FilterRange } from '@/components/ui/chart-filter-dropdown';

// Event used to broadcast the Overview page-wide date range from the header filter
// (rendered in the shared header) to the Overview page. Mirrors the existing
// 'devRoleChanged' window-event pattern.
export const DASHBOARD_RANGE_EVENT = 'dashboardRangeChanged';

export interface DashboardRangeDetail {
  range: FilterRange;
  from: string; // yyyy-MM-dd (IST)
  to: string;   // yyyy-MM-dd (IST)
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Map a FilterRange to a "last N days" bucket, for day-based report APIs (Reports page).
export function rangeToDays(range: FilterRange, from?: string, to?: string): number {
  switch (range) {
    case 'Today': return 1;
    case 'This Week':
    case 'Last Week': return 7;
    case 'This Month':
    case 'Last Month': return 30;
    case 'Last 3 Months': return 90;
    case 'All Time': return 365;
    case 'Custom Range':
      if (from && to) {
        const d = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
        return Math.max(1, d);
      }
      return 7;
    default: return 7;
  }
}

// Map a FilterRange to the Performance page's coarse period keys (today | week | month).
export function rangeToPerfPeriod(range: FilterRange): 'today' | 'week' | 'month' {
  switch (range) {
    case 'Today': return 'today';
    case 'This Week':
    case 'Last Week': return 'week';
    default: return 'month'; // This/Last Month, Last 3 Months, All Time, Custom
  }
}

// Map a filter option to inclusive IST calendar dates (yyyy-MM-dd). The user's browser is IST,
// so local date parts == IST. Weeks start Monday.
export function rangeToDates(range: FilterRange, customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monOffset = (today.getDay() + 6) % 7; // days since Monday
  let from = today;
  let to = today;
  switch (range) {
    case 'This Week':
      from = new Date(today); from.setDate(today.getDate() - monOffset); break;
    case 'Last Week': {
      const thisMon = new Date(today); thisMon.setDate(today.getDate() - monOffset);
      from = new Date(thisMon); from.setDate(thisMon.getDate() - 7);
      to = new Date(thisMon); to.setDate(thisMon.getDate() - 1); break;
    }
    case 'This Month':
      from = new Date(today.getFullYear(), today.getMonth(), 1); break;
    case 'Last Month':
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0); break; // day 0 = last day of prev month
    case 'Last 3 Months':
      from = new Date(today.getFullYear(), today.getMonth() - 2, 1); break;
    case 'All Time':
      return { from: '2000-01-01', to: fmt(today) }; // wide-open lower bound covers all data
    case 'Custom Range':
      return { from: customFrom || fmt(today), to: customTo || fmt(today) };
    // 'Today' → from = to = today (defaults above)
  }
  return { from: fmt(from), to: fmt(to) };
}
