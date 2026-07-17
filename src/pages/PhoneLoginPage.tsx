import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Phone, ArrowLeft, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';

type Step = 'phone' | 'code';

export default function PhoneLoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already logged in — skip the login page entirely.
  // Must be after all hook calls (Rules of Hooks).
  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

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
      toast.success("Code sent — check your phone.");
      setStep('code');
    } catch (e: any) {
      toast.error(e.message || 'Could not send code. Try again.');
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

      // Establish a real Supabase auth session from the magic link token.
      // AuthContext's onAuthStateChange picks this up automatically.
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'email',
      });
      if (verifyErr) throw verifyErr;

      toast.success('Signed in.');
      navigate('/dashboard');
    } catch (e: any) {
      toast.error(e.message || 'Could not verify — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    setStep('phone');
    setCode('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Logo className="h-12 w-auto" />
        </div>

        <div
          className="bg-card rounded-2xl shadow-xl p-8"
          style={{ border: '1px solid rgba(46,154,160,0.15)' }}
        >
          {step === 'phone' && (
            <>
              <h2 className="text-2xl font-extrabold text-center mb-2" style={{ color: '#243231' }}>
                Sign in
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Enter your phone — we'll text you a 6-digit code.
              </p>
              <form onSubmit={requestCode} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-foreground font-semibold">Phone number</Label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      autoFocus
                      placeholder="0420 219 101"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-14 rounded-2xl text-base pl-11"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={submitting || !phone.trim()}
                  className="w-full h-14 rounded-2xl text-base font-bold gap-2"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                  Send me a code
                </Button>
              </form>
            </>
          )}

          {step === 'code' && (
            <>
              <button onClick={back} className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
                <ArrowLeft className="w-3 h-3" /> Use a different number
              </button>
              <h2 className="text-2xl font-extrabold text-center mb-2" style={{ color: '#243231' }}>
                Enter your code
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-6">
                We texted a 6-digit code to <span className="font-semibold text-foreground">{phone}</span>.
              </p>
              <form onSubmit={verifyCode} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-foreground font-semibold">6-digit code</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="h-14 rounded-2xl text-2xl font-bold tracking-[0.5em] text-center"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting || code.length !== 6}
                  className="w-full h-14 rounded-2xl text-base font-bold gap-2"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  Sign in
                </Button>
                <button
                  type="button"
                  onClick={requestCode}
                  disabled={submitting}
                  className="w-full text-xs font-semibold text-primary hover:underline"
                >
                  Resend code
                </button>
              </form>
            </>
          )}

          <p className="text-[11px] text-muted-foreground text-center mt-6">
            Codes expire after 10 min. Sign-in lasts 7 days on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
