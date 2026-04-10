import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function StaffMagicAuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('No login token provided.');
      return;
    }

    (async () => {
      try {
        // Verify the token — anon can SELECT thanks to RLS policy
        const { data: tokenRow, error: tokenErr } = await supabase
          .from('staff_magic_tokens' as any)
          .select('*')
          .eq('token', token)
          .eq('used', false)
          .maybeSingle();

        if (tokenErr || !tokenRow) {
          setError('Invalid or expired login link.');
          return;
        }

        const row = tokenRow as any;
        // Use expires_at column (default: created_at + 15 min)
        if (new Date(row.expires_at) < new Date()) {
          setError('This login link has expired. Please ask your admin to send a new one.');
          return;
        }

        // Get the staff member's email (profiles has anon SELECT)
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', row.staff_id)
          .single();

        if (!profile?.email) {
          setError('Staff profile not found.');
          return;
        }

        // Mark token as used (anon can UPDATE thanks to RLS policy)
        await supabase
          .from('staff_magic_tokens' as any)
          .update({ used: true } as any)
          .eq('id', row.id);

        // Sign in with OTP (magic link style) - generate and auto-verify
        const { error: signInErr } = await supabase.auth.signInWithOtp({
          email: profile.email,
          options: { shouldCreateUser: false },
        });

        if (signInErr) {
          // Fallback: redirect to login with message
          setError('Could not sign in automatically. Please log in with your email.');
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        // Redirect to dashboard
        navigate('/dashboard');
      } catch (err: any) {
        setError(err.message || 'Something went wrong.');
      }
    })();
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {error ? (
          <>
            <p className="text-destructive font-bold text-lg">{error}</p>
            <button onClick={() => navigate('/login')} className="text-primary underline text-sm">
              Go to login
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Signing you in...</p>
          </>
        )}
      </div>
    </div>
  );
}
