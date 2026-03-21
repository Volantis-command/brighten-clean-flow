import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function useXeroInvoiceSync() {
  const { role } = useAuth();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (role !== 'admin' || hasSynced.current) return;
    hasSynced.current = true;

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-sync-invoice-status`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});
  }, [role]);
}
