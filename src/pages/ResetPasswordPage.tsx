// Landing page for the password-reset email link.
//
// Flow:
//   1. User clicks "Forgot password?" on /login → enters email
//   2. Supabase sends them an email with a reset link
//   3. Link points here — Supabase puts a recovery session in the URL
//      fragment, which the supabase-js client picks up automatically
//      (detectSessionInUrl is on by default)
//   4. We confirm there's a session, then prompt for a new password
//   5. updateUser sets the new password, we redirect to /dashboard

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // On mount, check whether Supabase put a recovery session into the URL
  // fragment. If not, the user landed here without a valid reset link.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setHasSession(!!data.session);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords don\u2019t match.');
      return;
    }
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    navigate('/dashboard', { replace: true });
  };

  // Until we know whether the recovery session is present, show a tiny
  // loader. Otherwise either show the form (session present) or an
  // "expired link" message (no session).
  if (hasSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary px-4">
        <p className="text-primary-foreground/70 text-sm">Loading…</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary px-4">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-10">
            <h1
              className="text-5xl font-extrabold text-primary-foreground tracking-tight"
              style={{ fontFamily: 'Nunito, sans-serif', fontSize: '48px' }}
            >
              Brightly<span className="text-accent">.</span>
            </h1>
          </div>
          <div className="bg-card rounded-2xl shadow-xl p-8" style={{ border: '1px solid rgba(254,219,0,0.15)' }}>
            <h2 className="text-xl font-extrabold text-center mb-3" style={{ color: '#F0FDF4' }}>
              Reset link expired
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              This password-reset link is no longer valid. Request a new one from the sign-in page.
            </p>
            <Button onClick={() => navigate('/login', { replace: true })} variant="accent" size="lg" className="w-full">
              Back to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <h1
            className="text-5xl font-extrabold text-primary-foreground tracking-tight"
            style={{ fontFamily: 'Nunito, sans-serif', fontSize: '48px' }}
          >
            Brightly<span className="text-accent">.</span>
          </h1>
        </div>

        <div className="bg-card rounded-2xl shadow-xl p-8" style={{ border: '1px solid rgba(254,219,0,0.15)' }}>
          <h2 className="text-2xl font-extrabold text-center mb-6" style={{ color: '#F0FDF4' }}>
            Set a new password
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-foreground font-semibold">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="h-14 rounded-2xl text-base"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-foreground font-semibold">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type it again"
                required
                minLength={8}
                className="h-14 rounded-2xl text-base"
              />
            </div>

            {error && (
              <p className="text-destructive text-sm font-semibold text-center">{error}</p>
            )}

            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Saving\u2026' : 'Save and sign in'}
            </Button>
          </form>
        </div>

        <p className="text-center text-primary-foreground/70 text-sm mt-6">
          Brightly &mdash; Cleaning Operations
        </p>
      </div>
    </div>
  );
}
