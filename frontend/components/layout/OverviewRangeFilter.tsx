'use client';

import { useState } from 'react';
import { ChartFilterDropdown, FilterRange } from '@/components/ui/chart-filter-dropdown';
import { rangeToDates, DASHBOARD_RANGE_EVENT, DashboardRangeDetail } from '@/lib/dateRange';

// Page-wide date filter rendered in the shared header beside the notification bell (Overview,
// Reports, Performance). Broadcasts the selected range to the active page via a window event.
export function OverviewRangeFilter({ initial = 'Today' }: { initial?: FilterRange }) {
  const [range, setRange] = useState<FilterRange>(initial);

  const handleChange = (r: FilterRange, customFrom?: string, customTo?: string) => {
    setRange(r);
    const { from, to } = rangeToDates(r, customFrom, customTo);
    window.dispatchEvent(
      new CustomEvent<DashboardRangeDetail>(DASHBOARD_RANGE_EVENT, { detail: { range: r, from, to } })
    );
  };

  return <ChartFilterDropdown value={range} onChange={handleChange} />;
}
