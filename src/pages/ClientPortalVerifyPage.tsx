import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
// Public client-facing page — always read as anon, never the admin's session.
import { supabasePublic as supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';

export default function ClientPortalVerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('No token provided.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('client-verify-token', {
          body: { token },
        });

        if (fnError) throw fnError;

        if (data?.error) {
          if (data.error === 'expired' || data.error === 'used') {
            setError('This link has expired. Request a new one.');
          } else {
            setError('Invalid link. Please request a new one.');
          }
          setLoading(false);
          return;
        }

        if (data?.success && data?.client) {
          localStorage.setItem('brightly_client_id', data.client.id);
          localStorage.setItem('brightly_client_name', data.client.name || '');
          localStorage.setItem('brightly_client_type', data.client.type || 'profile');
          navigate('/client-portal/dashboard', { replace: true });
        } else {
          setError('Something went wrong. Please try again.');
          setLoading(false);
        }
      } catch {
        setError('Something went wrong. Please try again.');
        setLoading(false);
      }
    })();
  }, [token, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Verifying your link…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex flex-col items-center mb-8">
          <h1
            className="text-5xl font-extrabold text-primary tracking-tight"
            style={{ fontFamily: 'Nunito, sans-serif' }}
          >
            <Logo variant="cream" className="h-9 w-auto inline-block" />
          </h1>
        </div>

        <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8 space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-lg font-bold text-foreground">{error}</h2>
          <Button asChild className="rounded-2xl">
            <Link to="/client-portal">Request a new link</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
