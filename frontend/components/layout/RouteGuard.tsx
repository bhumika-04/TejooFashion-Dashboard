'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';

// Pages that are always accessible regardless of role
const PUBLIC_DASHBOARD_PATHS = ['/dashboard/settings', '/dashboard/notifications'];

// Extract the page key from a pathname, e.g. '/dashboard/audit-logs' → 'audit-logs'
function pageKeyFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/([^/]+)/);
  return match ? match[1] : null;
}

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { allowedPages, canAccess } = usePermissions();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Wait until permissions are loaded
    if (allowedPages === null) return;

    // Full access
    if (allowedPages.includes('*')) { setChecked(true); return; }

    // Always-accessible paths
    if (PUBLIC_DASHBOARD_PATHS.some(p => pathname.startsWith(p))) { setChecked(true); return; }

    const pageKey = pageKeyFromPath(pathname);
    if (!pageKey || canAccess(pageKey)) {
      setChecked(true);
    } else {
      // No access — redirect to overview
      router.replace('/dashboard/overview');
    }
  }, [allowedPages, pathname]);

  // While checking, show nothing (avoids flash of forbidden content)
  if (!checked) return null;

  return <>{children}</>;
}
