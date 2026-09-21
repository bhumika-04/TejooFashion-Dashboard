'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { systemApi } from '@/services/api';

// Admin-only banner: warns when the OpenAI account is out of credits, so AI features
// (reply suggestions, summaries, auto-tagging, voice transcription) are all failing.
// Polls /system/ai-status (Admin/HOD only — other roles get 403 and simply see nothing).
export function AiCreditWarning() {
  const [exhausted, setExhausted] = useState(false);
  const [since, setSince] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Only privileged roles manage billing — don't even poll for CRR/Agent.
  const isPrivileged = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      const role = (u.role ?? u.Role ?? '').toUpperCase();
      return ['ADMIN', 'HOD'].includes(role);
    } catch { return false; }
  })();

  useEffect(() => {
    if (!isPrivileged) return;
    let cancelled = false;

    const check = async () => {
      try {
        const r = await systemApi.getAiStatus();
        if (cancelled) return;
        const ex = !!r.data?.creditsExhausted;
        setExhausted(ex);
        setSince(r.data?.since ?? null);
        if (!ex) setDismissed(false); // recovered → allow the banner to show again next time
      } catch { /* 403 for non-privileged, or network — stay quiet */ }
    };

    check();
    const id = setInterval(check, 60_000); // re-check every minute
    return () => { cancelled = true; clearInterval(id); };
  }, [isPrivileged]);

  if (!isPrivileged || !exhausted || dismissed) return null;

  const sinceText = since
    ? new Date(since).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start sm:items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
      <div className="flex-1 min-w-0 text-sm text-amber-900">
        <span className="font-semibold">OpenAI account is out of credits.</span>{' '}
        AI reply suggestions, summaries, auto-tagging and voice-note transcription are paused until credits are topped up.{' '}
        <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer"
          className="font-semibold underline hover:text-amber-700 whitespace-nowrap">
          Add credits →
        </a>
        {sinceText && <span className="text-amber-700/80 ml-1">(since {sinceText})</span>}
      </div>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss"
        className="flex-shrink-0 text-amber-500 hover:text-amber-700 p-0.5">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
