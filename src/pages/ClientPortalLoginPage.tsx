import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, Mail, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type InputMode = 'phone' | 'email';

function detectInputType(value: string): 'phone' | 'email' | 'unknown' {
  const trimmed = value.trim();
  if (trimmed.includes('@')) return 'email';
  if (/^[\d\s+()-]{6,}$/.test(trimmed)) return 'phone';
  return 'unknown';
}

export default function ClientPortalLoginPage() {
  const [inputMode, setInputMode] = useState<InputMode>('phone');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const trimmed = value.trim();
      const detected = inputMode === 'phone' ? 'phone' : detectInputType(trimmed) === 'phone' ? 'phone' : 'email';

      const body: Record<string, string> = {};
      if (detected === 'phone') {
        body.phone = trimmed;
      } else {
        body.email = trimmed;
      }

      const { data, error: fnError } = await supabase.functions.invoke('client-magic-login', {
        body,
      });

      if (fnError) throw fnError;

      if (data?.error === 'not_found') {
        setError("We don't have an account with that " + (detected === 'phone' ? 'number' : 'email') + ". Contact us to get set up.");
      } else if (data?.success) {
        setSent(true);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <h1
            className="text-5xl font-extrabold text-primary tracking-tight"
            style={{ fontFamily: 'Nunito, sans-serif' }}
          >
            Brightly<span className="text-accent">.</span>
          </h1>
        </div>

        <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle className="w-12 h-12 text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">Check your SMS</h2>
              <p className="text-muted-foreground text-sm">
                We've sent a login link to your phone. Check your SMS.
              </p>
              <Button
                variant="outline"
                className="mt-4 rounded-2xl"
                onClick={() => { setSent(false); setValue(''); }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-foreground text-center mb-2">
                Welcome back.
              </h2>
              <p className="text-muted-foreground text-sm text-center mb-6">
                View your bookings.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-input" className="text-foreground font-semibold">
                    {inputMode === 'phone' ? 'Mobile number' : 'Email address'}
                  </Label>
                  <div className="relative">
                    {inputMode === 'phone' ? (
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    ) : (
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    )}
                    <Input
                      id="login-input"
                      type={inputMode === 'phone' ? 'tel' : 'email'}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder={inputMode === 'phone' ? '0412 345 678' : 'you@example.com'}
                      required
                      className="h-14 rounded-2xl text-base pl-11"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-destructive text-sm font-semibold text-center">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full h-14 rounded-2xl text-base font-bold"
                  disabled={loading}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                  ) : (
                    'Send me a login link'
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setInputMode(inputMode === 'phone' ? 'email' : 'phone');
                    setValue('');
                    setError('');
                  }}
                  className="w-full text-center text-sm text-primary font-semibold hover:underline"
                >
                  {inputMode === 'phone' ? 'Use email instead' : 'Use phone number instead'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-muted-foreground text-xs mt-6">
          Powered by Brightly — Turnover Cleaning Operations
        </p>
      </div>
    </div>
  );
}
