'use client';

import { useEffect, useState } from 'react';
import { rolePermissionsApi } from '@/services/api';

// Cache so we don't re-fetch on every page render within the same session
let permissionsCache: Record<string, string[]> = {};

export function usePermissions() {
  const [allowedPages, setAllowedPages] = useState<string[] | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const raw = localStorage.getItem('user');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const userRole: string = parsed.role ?? parsed.Role ?? '';
        setRole(userRole);

        // Admin always has full access — skip API call
        if (userRole === 'Admin') {
          setAllowedPages(['*']);
          return;
        }

        // Check cache first
        if (permissionsCache[userRole]) {
          setAllowedPages(permissionsCache[userRole]);
          return;
        }

        const res = await rolePermissionsApi.getPages(userRole);
        const pages: string[] = res.data;
        permissionsCache[userRole] = pages;
        if (!cancelled) setAllowedPages(pages);
      } catch {
        // If API fails, fall back to full access (graceful degradation)
        setAllowedPages(['*']);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const canAccess = (page: string): boolean => {
    if (allowedPages === null) return true; // still loading
    if (allowedPages.includes('*')) return true;
    return allowedPages.includes(page);
  };

  // Call this after a role-permission update to bust the cache
  const invalidateCache = () => {
    permissionsCache = {};
  };

  return { allowedPages, role, canAccess, invalidateCache };
}
