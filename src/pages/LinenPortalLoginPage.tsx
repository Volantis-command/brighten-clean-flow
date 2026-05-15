import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Phone, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

type Step = 'phone' | 'code';

const BG = '#173A27';
const CARD = '#1F4A32';
const YELLOW = '#FEDB00';
const MUTED = 'rgba(255,255,255,0.55)';
const BORDER = 'rgba(255,255,255,0.12)';

export default function LinenPortalLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-linen-otp', {
        body: { phone: phone.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Code sent — check your phone.');
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
      const { data, error } = await supabase.functions.invoke('verify-linen-otp', {
        body: { phone: phone.trim(), code: code.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if (!(data as any)?.verified) throw new Error('Verification failed — try again.');

      // Store the verified phone as the linen portal session
      localStorage.setItem('linen_portal_phone', (data as any).phone || phone.trim());
      toast.success('Signed in.');
      navigate('/linen-portal/dashboard');
    } catch (e: any) {
      toast.error(e.message || 'Could not verify — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: BG }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <h1
            className="text-4xl font-extrabold tracking-tight"
            style={{ color: '#fff', fontFamily: 'Nunito, sans-serif' }}
          >
            Brightly<span style={{ color: YELLOW }}>.</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: MUTED }}>Linen Partner Portal</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7 shadow-xl"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}
        >
          {step === 'phone' ? (
            <form onSubmit={requestCode} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Sign in</h2>
                <p className="text-sm" style={{ color: MUTED }}>
                  We'll send a code to your registered phone number.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white block">Phone number</label>
                <div className="relative">
                  <Phone
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                    style={{ color: MUTED }}
                  />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0400 000 000"
                    required
                    className="w-full h-12 rounded-xl pl-10 pr-4 text-white text-sm font-medium outline-none focus:ring-2 focus:ring-offset-0"
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: `1px solid ${BORDER}`,
                      caretColor: YELLOW,
                    }}
                    onFocus={(e) => (e.target.style.borderColor = YELLOW)}
                    onBlur={(e) => (e.target.style.borderColor = BORDER)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !phone.trim()}
                className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                style={{ background: YELLOW, color: '#000' }}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-5">
              <button
                type="button"
                onClick={() => { setStep('phone'); setCode(''); }}
                className="flex items-center gap-1 text-sm mb-1 transition-opacity hover:opacity-70"
                style={{ color: MUTED }}
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>

              <div>
                <h2 className="text-xl font-bold text-white mb-1">Enter code</h2>
                <p className="text-sm" style={{ color: MUTED }}>
                  Sent to {phone}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white block">6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                  autoFocus
                  className="w-full h-12 rounded-xl px-4 text-white text-center text-2xl font-bold tracking-[0.3em] outline-none focus:ring-2 focus:ring-offset-0"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: `1px solid ${BORDER}`,
                    caretColor: YELLOW,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = YELLOW)}
                  onBlur={(e) => (e.target.style.borderColor = BORDER)}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || code.length < 6}
                className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                style={{ background: YELLOW, color: '#000' }}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
