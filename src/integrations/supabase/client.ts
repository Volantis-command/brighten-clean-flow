import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// iOS Safari evicts localStorage for non-PWA web apps after 7 days of
// inactivity, silently logging everyone out. Cookies survive that eviction.
// We write to BOTH (cookie primary, localStorage backup) so the session
// is readable on all browsers and survives iOS Safari's purge.
const COOKIE_TTL = 400 * 24 * 60 * 60; // 400 days in seconds (browser max)

function readCookie(name: string): string | null {
  const m = document.cookie.match(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`);
  return m ? decodeURIComponent(m[1]) : null;
}

const persistentStorage = {
  getItem: (key: string): string | null =>
    readCookie(key) ?? localStorage.getItem(key),
  setItem: (key: string, value: string): void => {
    try { document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_TTL}; SameSite=Lax`; } catch {}
    try { localStorage.setItem(key, value); } catch {}
  },
  removeItem: (key: string): void => {
    document.cookie = `${key}=; path=/; max-age=0`;
    localStorage.removeItem(key);
  },
};

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: persistentStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});