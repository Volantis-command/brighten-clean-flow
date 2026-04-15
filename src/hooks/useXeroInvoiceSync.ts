import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Admin-side defense in depth: while an admin tab is open, periodically poke
 * the xero-sync-invoice-status function so any payments that landed in Xero
 * surface in the UI without waiting for the next pg_cron tick (every 15 min).
 *
 * Also fires once on mount (the original behaviour) so the freshest data is
 * loaded the moment an admin opens the dashboard.
 *
 * The cron job is the source of truth — this is just for low-latency UX.
 */
const ACTIVE_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function useXeroInvoiceSync() {
  const { role } = useAuth();
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    if (role !== 'admin') return;

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-sync-invoice-status`;

    const fire = () => {
      lastRunRef.current = Date.now();
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {});
    };

    // Run immediately on mount
    fire();

    // Then refresh every 5 min while the tab is active
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fire();
    }, ACTIVE_REFRESH_MS);

    // Also fire when tab becomes visible after being hidden for a while
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunRef.current > ACTIVE_REFRESH_MS) {
        fire();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [role]);
}
