import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Compatibility route for old bookmarks. New and existing cleaners always use
 * the canonical token flow so a second, disconnected HR record cannot exist.
 */
export default function CleanerOnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('staff_onboarding')
        .select('onboarding_token')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.onboarding_token) navigate(`/staff-onboarding/${data.onboarding_token}`, { replace: true });
      else setMissing(true);
    })();
    return () => { cancelled = true; };
  }, [navigate, user]);

  if (!user) return <Navigate to="/" replace />;
  if (missing) return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-5 text-center">
      <div className="max-w-sm rounded-2xl border bg-card p-6 shadow-lg">
        <h1 className="text-lg font-bold">Onboarding link needed</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Ask a Brightly admin to send or refresh your cleaner onboarding link.</p>
      </div>
    </div>
  );
  return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
}
