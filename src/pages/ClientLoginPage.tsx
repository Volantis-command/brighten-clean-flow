import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function ClientLoginPage() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('client-magic-login', {
        body: { phone: phone.trim() },
      });

      if (fnError) throw fnError;

      if (data?.error === 'not_found') {
        setError("We couldn't find that number. Contact us at 0418 878 707");
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0A0F0E' }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <h1 className="text-5xl font-extrabold tracking-tight" style={{ fontFamily: 'Nunito, sans-serif', color: '#F0FDF4' }}>
            Brightly<span style={{ color: '#FEDB00' }}>.</span>
          </h1>
          <p className="text-sm mt-2 font-semibold" style={{ color: 'rgba(240,253,244,0.5)' }}>Client Portal</p>
        </div>

        <div className="rounded-2xl shadow-lg p-8" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle className="w-12 h-12 mx-auto" style={{ color: '#3A7560' }} />
              <h2 className="text-xl font-bold" style={{ color: '#F0FDF4' }}>Check your texts</h2>
              <p className="text-sm" style={{ color: 'rgba(240,253,244,0.5)' }}>
                We've sent you a login link via SMS. It expires in 1 hour.
              </p>
              <Button
                variant="outline"
                className="mt-4 rounded-2xl"
                onClick={() => { setSent(false); setPhone(''); }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-center mb-6" style={{ color: '#F0FDF4' }}>Welcome back</h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="font-semibold" style={{ color: '#F0FDF4' }}>Mobile number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'rgba(240,253,244,0.4)' }} />
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0412 345 678"
                      required
                      className="h-14 rounded-2xl text-base pl-11 bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.12)] text-[#F0FDF4] placeholder:text-[rgba(240,253,244,0.4)] focus:border-[#2E5D4E]"
                    />
                  </div>
                </div>
                {error && <p className="text-destructive text-sm font-semibold text-center">{error}</p>}
                <Button
                  type="submit"
                  className="w-full h-14 rounded-2xl text-base font-bold"
                  disabled={loading}
                  style={{ background: '#2E5D4E', color: '#FFFFFF' }}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                  ) : (
                    'Send me a login link'
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(240,253,244,0.3)' }}>
          Powered by Brightly — Turnover Cleaning Operations
        </p>
      </div>
    </div>
  );
}
