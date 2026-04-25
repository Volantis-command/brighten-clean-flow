import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


type Mode = 'sign_in' | 'sign_up' | 'forgot_password';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('sign_in');
  const [success, setSuccess] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'sign_up') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Account created! You can now sign in.');
        setMode('sign_in');
      }
    } else if (mode === 'forgot_password') {
      // Where Supabase should send the user after they click the reset
      // link in their email. Must be on the same origin as the app.
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        setError(error.message);
      } else {
        setSuccess(
          'If an account exists for that email, a reset link is on its way. Check your inbox.',
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(error.message);
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <h1 className="text-5xl font-extrabold text-primary-foreground tracking-tight" style={{ fontFamily: 'Nunito, sans-serif', fontSize: '48px' }}>
            Brightly<span className="text-accent">.</span>
          </h1>
        </div>

        <div className="bg-card rounded-2xl shadow-xl p-8" style={{ border: '1px solid rgba(254,219,0,0.15)' }}>
          <h1 className="text-2xl font-extrabold text-center mb-6" style={{ color: '#F0FDF4' }}>
            {mode === 'sign_up' ? 'Create Account'
              : mode === 'forgot_password' ? 'Reset password'
              : 'Welcome back'}
          </h1>

          {mode === 'forgot_password' && (
            <p className="text-sm text-muted-foreground text-center mb-5">
              Enter the email on your account. We&rsquo;ll send you a link to set a new password.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'sign_up' && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-foreground font-semibold">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  required
                  className="h-14 rounded-2xl text-base"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-semibold">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@brightly.com"
                required
                className="h-14 rounded-2xl text-base"
              />
            </div>

            {mode !== 'forgot_password' && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="password" className="text-foreground font-semibold">Password</Label>
                  {mode === 'sign_in' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot_password')}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-14 rounded-2xl text-base"
                />
              </div>
            )}

            {error && (
              <p className="text-destructive text-sm font-semibold text-center">{error}</p>
            )}
            {success && (
              <p className="text-primary text-sm font-semibold text-center">{success}</p>
            )}

            <Button
              type="submit"
              variant="accent"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading
                ? (mode === 'sign_up' ? 'Creating...'
                    : mode === 'forgot_password' ? 'Sending...'
                    : 'Signing in...')
                : (mode === 'sign_up' ? 'Create Account'
                    : mode === 'forgot_password' ? 'Send reset link'
                    : 'Sign In')}
            </Button>
          </form>

          {mode === 'forgot_password' ? (
            <button
              type="button"
              onClick={() => switchMode('sign_in')}
              className="w-full text-center text-sm text-muted-foreground mt-4 hover:text-primary transition-colors"
            >
              ← Back to sign in
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchMode(mode === 'sign_up' ? 'sign_in' : 'sign_up')}
              className="w-full text-center text-sm text-muted-foreground mt-4 hover:text-primary transition-colors"
            >
              {mode === 'sign_up' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          )}
        </div>

        <p className="text-center text-primary-foreground/70 text-sm mt-6">
          Brightly — Cleaning Operations
        </p>
      </div>
    </div>
  );
}