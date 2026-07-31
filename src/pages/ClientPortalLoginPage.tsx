// ============================================================================
// CLIENT LOGIN — phone OTP, real Supabase session
//
// Replaces the old "login" which simply wrote a client id into browser storage
// and trusted it. That was spoofable, and the matching server endpoint returned
// any client's portal to any caller. Clients now authenticate exactly the way
// staff do: mobile → SMS code → real session, verified server-side.
//
// Same edge functions as the staff login (request-login-otp / verify-login-otp)
// — they are role-agnostic and already understand the `client` role.
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Smartphone, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';

export default function ClientPortalLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Go straight through.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) navigate('/client-portal/dashboard', { replace: true });
    });
  }, [navigate]);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-login-otp', {
        body: { phone: phone.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Code sent — check your phone.');
      setStep('code');
    } catch (err: any) {
      toast.error(err.message || 'Could not send code. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-login-otp', {
        body: { phone: phone.trim(), code: code.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const tokenHash = (data as any)?.token_hash;
      if (!tokenHash) throw new Error('Verification failed — try again.');

      // type must be 'email' — this is a magic-link token hash, not an SMS OTP.
      // Getting this wrong locks everyone out (see the 16 Jul login outage).
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash, type: 'email',
      });
      if (verifyErr) throw verifyErr;

      navigate('/client-portal/dashboard', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Could not verify — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo className="h-10 w-auto mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Client Portal</p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={requestCode} className="space-y-4">
            <div className="text-center">
              <Smartphone className="w-8 h-8 text-primary mx-auto" />
              <h1 className="text-xl font-extrabold text-foreground mt-3">Sign in</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Enter the mobile number Brightly has on file and we'll text you a code.
              </p>
            </div>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0412 345 678"
              className="w-full h-14 rounded-2xl border border-border bg-card px-4 text-base font-semibold text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={submitting || !phone.trim()}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
              Send my code
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <div className="text-center">
              <ShieldCheck className="w-8 h-8 text-primary mx-auto" />
              <h1 className="text-xl font-extrabold text-foreground mt-3">Enter your code</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                We sent a 6-digit code to {phone}.
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="w-full h-16 rounded-2xl border border-border bg-card px-4 text-center text-2xl font-extrabold tracking-[0.3em] text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={submitting || code.length < 4}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setCode(''); }}
              className="flex w-full items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground"
            >
              <ArrowLeft className="w-4 h-4" /> Use a different number
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Trouble signing in? Call Brightly on 0418 878 707.
        </p>
      </div>
    </div>
  );
}
