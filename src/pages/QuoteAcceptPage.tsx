import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2, Sparkles, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { TermsModal } from '@/components/quote/TermsModal';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Payment form component
function DepositPaymentForm({ 
  depositAmount, 
  depositLabel,
  onSuccess, 
  onError 
}: { 
  depositAmount: number;
  depositLabel: string;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setPaying(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      onError(error.message || 'Payment failed');
      setPaying(false);
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    } else {
      onError('Payment was not completed. Please try again.');
      setPaying(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="w-5 h-5 text-[#0C463D]" />
          <h2 className="text-lg font-bold text-[#0C463D]">Secure Deposit</h2>
        </div>
        <p className="text-sm text-gray-600">
          Almost done! A <strong>${depositAmount.toFixed(2)}</strong> deposit is required to secure your booking.
        </p>
        <p className="text-xs text-gray-400">{depositLabel}</p>

        <PaymentElement />

        <Button
          type="submit"
          disabled={!stripe || paying}
          className="w-full h-14 rounded-2xl text-lg font-bold bg-[#0C463D] hover:bg-[#0C463D]/90 text-white disabled:opacity-50"
        >
          {paying ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
          Pay ${depositAmount.toFixed(2)} Deposit
        </Button>
      </div>
    </form>
  );
}

export default function QuoteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [tcsAccepted, setTcsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [tcsVersion, setTcsVersion] = useState('v1.0');

  // Deposit state
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositLabel, setDepositLabel] = useState('Booking deposit (deducted from final invoice)');
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [stripePublishableKey, setStripePublishableKey] = useState('');

  const stripePromise = useMemo(() => {
    if (stripePublishableKey) return loadStripe(stripePublishableKey);
    return null;
  }, [stripePublishableKey]);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('quote_requests')
        .select('*')
        .eq('token', token)
        .single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      if (data.status === 'accepted') setAccepted(true);
      setQuote(data);

      // Get T&C version and deposit settings
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['tcs_version', 'deposit_type', 'deposit_amount', 'deposit_label', 'stripe_publishable_key']);

      const settingsMap: Record<string, string> = {};
      (appSettings || []).forEach((r: any) => { settingsMap[r.key] = r.value; });

      if (settingsMap.tcs_version) setTcsVersion(settingsMap.tcs_version);
      if (settingsMap.deposit_label) setDepositLabel(settingsMap.deposit_label);
      if (settingsMap.stripe_publishable_key) setStripePublishableKey(settingsMap.stripe_publishable_key);

      // Calculate deposit
      const depType = settingsMap.deposit_type || 'fixed';
      const depValue = parseFloat(settingsMap.deposit_amount || '50');
      if (depValue > 0 && settingsMap.stripe_publishable_key) {
        setDepositEnabled(true);
        if (depType === 'percentage') {
          const total = Number(data.total_inc_gst || 0);
          setDepositAmount(Math.round(total * depValue) / 100);
        } else {
          setDepositAmount(depValue);
        }
      }

      setLoading(false);
    }
    load();
  }, [token]);

  const completeBooking = async (paymentId?: string) => {
    if (!quote) return;
    setConfirming(true);
    try {
      const updateData: any = {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        tcs_accepted: true,
        tcs_accepted_at: new Date().toISOString(),
        tcs_version: tcsVersion,
      };
      if (paymentId) {
        updateData.deposit_paid = true;
        updateData.deposit_amount = depositAmount;
        updateData.deposit_paid_at = new Date().toISOString();
        updateData.stripe_payment_intent_id = paymentId;
      }
      await supabase.from('quote_requests').update(updateData).eq('token', token);

      const jobData: any = {
        scheduled_date: quote.preferred_date || new Date().toISOString().split('T')[0],
        scheduled_time: quote.preferred_time?.includes('Morning') ? '08:00' : quote.preferred_time?.includes('Afternoon') ? '13:00' : null,
        status: 'scheduled',
        price_ex_gst: quote.total_ex_gst,
        price_inc_gst: quote.total_inc_gst,
        notes: `Residential quote from ${quote.first_name} ${quote.last_name || ''}\n${quote.clean_type}\n${quote.address}\n${quote.extra_notes || ''}`.trim(),
      };
      if (paymentId) {
        jobData.deposit_paid = true;
        jobData.deposit_amount = depositAmount;
        jobData.deposit_paid_at = new Date().toISOString();
        jobData.stripe_payment_intent_id = paymentId;
      }
      await supabase.from('jobs').insert(jobData);

      try {
        await supabase.functions.invoke('send-quote-notification', {
          body: { type: 'accepted', token, first_name: quote.first_name, preferred_date: quote.preferred_date },
        });
      } catch { /* non-blocking */ }

      setAccepted(true);
      toast.success('Booking confirmed!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to confirm');
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirm = async () => {
    if (!quote) return;

    if (depositEnabled && !showPayment) {
      // Create payment intent then show payment form
      setConfirming(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-deposit-intent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, deposit_amount: depositAmount }),
          }
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setClientSecret(data.client_secret);
        setPaymentIntentId(data.payment_intent_id);
        setShowPayment(true);
      } catch (e: any) {
        toast.error(e.message || 'Failed to set up payment');
      } finally {
        setConfirming(false);
      }
      return;
    }

    // No deposit — confirm directly
    await completeBooking();
  };

  const handlePaymentSuccess = async (paymentId: string) => {
    await completeBooking(paymentId);
  };

  const handlePaymentError = (msg: string) => {
    toast.error(msg);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa]">
      <Loader2 className="w-8 h-8 animate-spin text-[#0C463D]" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#0C463D] mb-2">Quote Not Found</h1>
        <p className="text-gray-600">This quote link is invalid or has expired.</p>
      </div>
    </div>
  );

  if (accepted) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
        <CheckCircle2 className="w-16 h-16 text-[#0C463D] mx-auto" />
        <h1 className="text-2xl font-bold text-[#0C463D]">You're Booked!</h1>
        <p className="text-gray-600">We'll confirm your cleaner shortly.</p>
        {depositAmount > 0 && (
          <p className="text-sm text-gray-500">Deposit of ${depositAmount.toFixed(2)} received ✓</p>
        )}
        <p className="text-xs text-gray-400 mt-6">Powered by Brightly</p>
      </div>
    </div>
  );

  const addons = Array.isArray(quote.addons) ? quote.addons : [];

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-[#0C463D] text-white px-4 py-2 rounded-full text-sm font-bold">
            <Sparkles className="w-4 h-4 text-[#FEDB00]" /> Brightly Cleaning
          </div>
          <h1 className="text-2xl font-extrabold text-[#0C463D]">Your Quote</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Clean Type</span>
              <span className="font-semibold text-[#0C463D]">{quote.clean_type}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Address</span>
              <span className="font-semibold text-right max-w-[60%]">{quote.address}</span>
            </div>
            {quote.preferred_date && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date</span>
                <span className="font-semibold">{new Date(quote.preferred_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </div>
            )}
            {quote.estimated_hours && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Estimated hours</span>
                <span className="font-semibold">{quote.estimated_hours}h</span>
              </div>
            )}
          </div>

          {addons.length > 0 && (
            <div className="border-t pt-3 space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase">Add-ons</p>
              {addons.map((a: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{a.name}</span>
                  <span className="font-semibold">${Number(a.price).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3">
            {quote.total_ex_gst && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal (ex GST)</span>
                <span>${Number(quote.total_ex_gst).toFixed(2)}</span>
              </div>
            )}
            {quote.total_inc_gst && (
              <div className="flex justify-between text-lg font-bold text-[#0C463D] mt-1">
                <span>Total (inc GST)</span>
                <span>${Number(quote.total_inc_gst).toFixed(2)}</span>
              </div>
            )}
            {depositEnabled && depositAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>Deposit required today</span>
                <span className="font-semibold text-[#0C463D]">${depositAmount.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Terms & Conditions Checkbox */}
        {!showPayment && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-start gap-3">
              <Checkbox
                id="tcs"
                checked={tcsAccepted}
                onCheckedChange={(v) => setTcsAccepted(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="tcs" className="text-sm text-gray-700 cursor-pointer">
                I have read and agree to the{' '}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setTermsOpen(true); }}
                  className="text-[#0C463D] font-bold underline"
                >
                  Terms & Conditions
                </button>
              </label>
            </div>
          </div>
        )}

        {/* Payment Form (Stripe Elements) */}
        {showPayment && clientSecret && stripePromise ? (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
            <DepositPaymentForm
              depositAmount={depositAmount}
              depositLabel={depositLabel}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
            />
          </Elements>
        ) : (
          <>
            <Button
              onClick={handleConfirm}
              disabled={confirming || !tcsAccepted}
              className="w-full h-14 rounded-2xl text-lg font-bold bg-[#0C463D] hover:bg-[#0C463D]/90 text-white disabled:opacity-50"
            >
              {confirming ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              {depositEnabled ? 'Continue to Payment' : 'Confirm Booking'}
            </Button>

            {!tcsAccepted && (
              <p className="text-center text-xs text-gray-400">
                Please accept the Terms & Conditions to confirm your booking
              </p>
            )}
          </>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">Powered by Brightly</p>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
