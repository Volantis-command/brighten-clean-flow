import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Loader2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';

type QuoteData = {
  id: string;
  client_name: string | null;
  client_phone: string | null;
  property_address: string | null;
  service_type: string | null;
  clean_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sell_price_inc_gst: number | null;
  discounted_price: number | null;
  status: string | null;
  quote_accepted_at: string | null;
  quote_declined_at: string | null;
  hours: number | null;
  notes: string | null;
  frequency: string | null;
  linen_required: boolean | null;
  bed_types: any;
  extras: any;
  consumables_selection: any;
};

const AIRBNB_TYPES = ['airbnb', 'airbnb / short-stay turnover', 'airbnb turnover', 'short-stay'];

function isAirbnbType(quote: QuoteData): boolean {
  const st = (quote.clean_type || quote.service_type || '').toLowerCase();
  return AIRBNB_TYPES.some(t => st.includes(t));
}

// Generate 30-minute time slots from 6:00 AM to 7:00 PM
const TIME_SLOTS: string[] = [];
for (let h = 6; h <= 19; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 19) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

function formatTimeLabel(t: string) {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export default function QuoteDetailView({ token }: { token: string }) {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Post-acceptance state
  const [phase, setPhase] = useState<'view' | 'booking' | 'airbnb_done' | 'booking_done' | 'declined'>('view');

  // Booking form state
  const [selectedDate, setSelectedDate] = useState(getTomorrow());
  const [selectedTime, setSelectedTime] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, client_name, client_phone, property_address, service_type, clean_type, bedrooms, bathrooms, sell_price_inc_gst, discounted_price, status, quote_accepted_at, quote_declined_at, hours, notes, frequency, linen_required, bed_types, extras, consumables_selection')
        .eq('quote_token', token)
        .maybeSingle();
      if (error || !data) setNotFound(true);
      else {
        setQuote(data as QuoteData);
        // Set initial phase based on existing status
        if (data.status === 'client_accepted' || data.status === 'accepted' || data.quote_accepted_at) {
          // Already accepted — check if airbnb
          if (isAirbnbType(data)) setPhase('airbnb_done');
          else setPhase('booking'); // Show booking form
        } else if (data.status === 'declined' || data.quote_declined_at) {
          setPhase('view'); // Show declined state in view
        }
      }
      setLoading(false);
    })();
  }, [token]);

  const sendAcceptanceNotification = async (quoteData: QuoteData) => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      await fetch(`https://${projectId}.supabase.co/functions/v1/send-quote-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'quote_accepted',
          client_name: quoteData.client_name,
          clean_type: quoteData.clean_type || quoteData.service_type,
          address: quoteData.property_address,
        }),
      });
    } catch { /* non-blocking */ }
  };

  const handleAccept = async () => {
    if (!quote) return;
    setSubmitting(true);
    try {
      await supabase.from('quotes').update({
        status: 'client_accepted',
        quote_accepted_at: new Date().toISOString(),
      } as any).eq('id', quote.id);

      await sendAcceptanceNotification(quote);

      if (isAirbnbType(quote)) {
        setPhase('airbnb_done');
      } else {
        setPhase('booking');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to accept');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!quote) return;
    setSubmitting(true);
    try {
      await supabase.from('quotes').update({
        status: 'declined',
        quote_declined_at: new Date().toISOString(),
      } as any).eq('id', quote.id);

      // Notify admin
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        await fetch(`https://${projectId}.supabase.co/functions/v1/send-quote-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'quote_declined',
            client_name: quote.client_name,
            clean_type: quote.clean_type || quote.service_type,
          }),
        });
      } catch { /* non-blocking */ }

      setPhase('declined');
    } catch (e: any) {
      toast.error(e.message || 'Failed to decline');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!quote) return;
    setBookingSubmitting(true);
    try {
      // Call edge function to create job (bypasses RLS)
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/create-booking-from-quote`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            quote_id: quote.id,
            preferred_date: selectedDate,
            preferred_time: selectedTime || '08:00',
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed with status ${response.status}`);
      }

      // Send booking SMS to admin (non-blocking)
      try {
        await fetch(`https://${projectId}.supabase.co/functions/v1/send-quote-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'quote_accepted',
            client_name: quote.client_name,
            clean_type: quote.clean_type || quote.service_type,
            address: quote.property_address,
          }),
        });
      } catch { /* non-blocking */ }

      setPhase('booking_done');
      toast.success('Booking confirmed!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to create booking');
    } finally {
      setBookingSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#4ADE80] animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold text-white mb-3">Quote Not Found</h1>
        <p className="text-white/50 mb-6">We couldn't find this quote. It may have expired or the link is incorrect.</p>
        <a href="/quote" className="h-14 px-8 rounded-xl bg-[#3A7560] text-white font-semibold flex items-center justify-center">
          Start a New Quote
        </a>
      </div>
    );
  }

  const price = quote?.discounted_price ?? quote?.sell_price_inc_gst;
  const serviceLabel = quote?.clean_type || quote?.service_type || 'Cleaning Service';
  const alreadyDeclined = quote?.status === 'declined' || !!quote?.quote_declined_at;

  // ── Booking Done ──
  if (phase === 'booking_done') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full p-6 mb-6 bg-[#3A7560]/20">
          <CheckCircle className="w-12 h-12 text-[#4ADE80]" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">You're Booked In!</h1>
        <p className="text-white/50 max-w-sm">We'll confirm your cleaner shortly. 😊</p>
        <p className="text-sm mt-8 text-white/40">📞 0418 878 707</p>
        <p className="text-xs mt-1 text-white/20">Brightly Cleaning 🌿</p>
      </div>
    );
  }

  // ── Airbnb Done ──
  if (phase === 'airbnb_done') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full p-6 mb-6 bg-[#3A7560]/20">
          <CheckCircle className="w-12 h-12 text-[#4ADE80]" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Quote Accepted!</h1>
        <p className="text-white/50 max-w-sm">
          We've added your property to our system. You'll be able to schedule cleans through your client portal, or we'll coordinate turnovers directly.
        </p>
        <p className="text-sm mt-8 text-white/40">📞 0418 878 707</p>
        <p className="text-xs mt-1 text-white/20">Brightly Cleaning 🌿</p>
      </div>
    );
  }

  // ── Declined confirmation ──
  if (phase === 'declined') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full p-6 mb-6 bg-white/10">
          <XCircle className="w-12 h-12 text-white/40" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Quote Declined</h1>
        <p className="text-white/50 max-w-sm">No worries — reach out anytime if you change your mind.</p>
        <p className="text-sm mt-8 text-white/40">📞 0418 878 707</p>
      </div>
    );
  }

  // ── Booking Form (post-acceptance for residential) ──
  if (phase === 'booking') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
        <header className="flex items-center justify-between max-w-2xl mx-auto w-full px-6 pt-6 mb-8">
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span style={{ color: '#FEDB00' }}>.</span>
          </h1>
        </header>

        <div className="flex-1 max-w-2xl mx-auto w-full px-6 pb-12">
          <div className="rounded-full p-4 mb-4 bg-[#3A7560]/20 w-fit mx-auto">
            <CalendarDays className="w-8 h-8 text-[#4ADE80]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1 text-center">Quote Accepted!</h2>
          <p className="text-base text-white/50 mb-8 text-center">Let's book your clean.</p>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-6">
            {/* Date picker */}
            <div>
              <label className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase block mb-2">
                When would you like the clean?
              </label>
              <input
                type="date"
                value={selectedDate}
                min={getTomorrow()}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full h-14 rounded-xl bg-white/5 border border-white/15 text-white px-4 text-base focus:outline-none focus:border-[#3A7560] transition-colors [color-scheme:dark]"
              />
            </div>

            {/* Time picker */}
            <div>
              <label className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase block mb-2">
                Preferred time?
              </label>
              <select
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full h-14 rounded-xl bg-white/5 border border-white/15 text-white px-4 text-base focus:outline-none focus:border-[#3A7560] transition-colors appearance-none [color-scheme:dark]"
              >
                <option value="" disabled className="bg-[#1a1a1a]">Select a time</option>
                {TIME_SLOTS.map(t => (
                  <option key={t} value={t} className="bg-[#1a1a1a]">{formatTimeLabel(t)}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleConfirmBooking}
            disabled={bookingSubmitting || !selectedDate || !selectedTime}
            className="w-full h-14 rounded-xl bg-[#3A7560] hover:bg-[#26503F] text-lg font-semibold text-white transition-all duration-200 shadow-lg shadow-[#3A7560]/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-6"
          >
            {bookingSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Booking'}
          </button>

          <p className="text-center text-sm text-white/40 mt-10">Questions? Call 0418 878 707</p>
          <p className="text-center text-xs text-white/20 mt-1">Brightly Cleaning 🌿</p>
        </div>
      </div>
    );
  }

  // ── Already declined (re-visit) ──
  if (alreadyDeclined) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full p-6 mb-6 bg-white/10">
          <XCircle className="w-12 h-12 text-white/40" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">This Quote Was Declined</h1>
        <p className="text-white/50 max-w-sm mb-6">Changed your mind? We'd love to help.</p>
        <button onClick={handleAccept} disabled={submitting} className="h-14 px-8 rounded-xl bg-[#3A7560] text-white font-semibold disabled:opacity-50 flex items-center gap-2">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Accept Quote'}
        </button>
        <p className="text-sm mt-8 text-white/40">📞 0418 878 707</p>
      </div>
    );
  }

  // ── Main quote view ──
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <header className="flex items-center justify-between max-w-2xl mx-auto w-full px-6 pt-6 mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span style={{ color: '#FEDB00' }}>.</span>
        </h1>
        <a href="/quote" className="text-[#4ADE80] text-sm font-medium">New Enquiry</a>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 pb-12">
        <h2 className="text-2xl font-bold text-white mb-1">Your Quote</h2>
        <p className="text-base text-white/50 mb-8">
          Hi{quote?.client_name ? ` ${quote.client_name.split(' ')[0]}` : ''}, here's your personalised quote from Brightly.
        </p>

        {/* Quote card */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-6 space-y-5">
          <div>
            <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Service</span>
            <p className="text-lg text-white font-semibold mt-1">{serviceLabel}</p>
          </div>

          {quote?.property_address && (
            <div>
              <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Property</span>
              <p className="text-base text-white mt-1">{quote.property_address}</p>
            </div>
          )}

          <div className="flex gap-8">
            {quote?.bedrooms != null && (
              <div>
                <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Bedrooms</span>
                <p className="text-base text-white mt-1">{quote.bedrooms}</p>
              </div>
            )}
            {quote?.bathrooms != null && (
              <div>
                <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Bathrooms</span>
                <p className="text-base text-white mt-1">{quote.bathrooms}</p>
              </div>
            )}
          </div>

          {/* Bed Configuration — Airbnb only */}
          {isAirbnbType(quote!) && quote?.bed_types && Array.isArray(quote.bed_types) && quote.bed_types.length > 0 && (
            <div>
              <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Bed Configuration</span>
              <div className="mt-1 space-y-0.5">
                {quote.bed_types.map((bt: string, i: number) => (
                  <p key={i} className="text-sm text-white/80">Bedroom {i + 1}: {bt}</p>
                ))}
              </div>
            </div>
          )}

          {/* Linen */}
          {isAirbnbType(quote!) && (
            <div>
              <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Linen Included</span>
              <p className="text-base text-white mt-1">{quote?.linen_required ? 'Yes ✓' : 'No'}</p>
            </div>
          )}

          {/* Consumable Kits — Airbnb only */}
          {isAirbnbType(quote!) && quote?.consumables_selection && (() => {
            const cs = quote.consumables_selection as Record<string, boolean>;
            const kits = [
              cs.amenities_kit && 'Amenities Kit',
              cs.wash_kit && 'Wash Kit',
              cs.tea_coffee_kit && 'Tea/Coffee Kit',
            ].filter(Boolean);
            return kits.length > 0 ? (
              <div>
                <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Consumable Kits</span>
                <div className="mt-1 space-y-0.5">
                  {kits.map((k, i) => <p key={i} className="text-sm text-white/80">✓ {k}</p>)}
                </div>
              </div>
            ) : null;
          })()}

          {/* Add-ons */}
          {quote?.extras && Array.isArray(quote.extras) && quote.extras.length > 0 && (
            <div>
              <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Add-ons Included</span>
              <div className="mt-1 space-y-0.5">
                {quote.extras.map((e: any, i: number) => (
                  <p key={i} className="text-sm text-white/80">✓ {e.name}{e.price ? ` — $${Number(e.price).toFixed(2)}` : ''}</p>
                ))}
              </div>
            </div>
          )}

          {/* Frequency */}
          {quote?.frequency && quote.frequency !== 'one-off' && (
            <div>
              <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Frequency</span>
              <p className="text-base text-white mt-1 capitalize">{quote.frequency} recurring</p>
            </div>
          )}

          {/* Estimated Hours */}
          {quote?.hours && (
            <div>
              <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Estimated Hours</span>
              <p className="text-base text-white mt-1">{quote.hours}h</p>
            </div>
          )}

          {/* Notes */}
          {quote?.notes && (
            <div>
              <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Notes</span>
              <p className="text-sm text-white/70 mt-1 whitespace-pre-line">{quote.notes}</p>
            </div>
          )}

          {/* Price */}
          {price ? (
            <div className="pt-4 border-t border-white/10">
              <span className="text-xs font-bold tracking-widest text-[#4ADE80] uppercase">Quoted Price (inc. GST)</span>
              <p className="text-3xl font-bold text-white mt-1">${Number(price).toFixed(2)}</p>
            </div>
          ) : (
            <div className="pt-4 border-t border-white/10">
              <p className="text-base text-white/50">We're preparing your quote — you'll receive an SMS when it's ready.</p>
            </div>
          )}
        </div>

        {/* Actions — only show if price is set */}
        {price ? (
          <div className="space-y-3 mt-8">
            <button
              onClick={handleAccept}
              disabled={submitting}
              className="w-full h-14 rounded-xl bg-[#3A7560] hover:bg-[#26503F] text-lg font-semibold text-white transition-all duration-200 shadow-lg shadow-[#3A7560]/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Accept Quote'}
            </button>
            <button
              onClick={handleDecline}
              disabled={submitting}
              className="w-full text-center text-sm text-white/50 underline hover:text-white/70 transition-colors py-2"
            >
              Decline
            </button>
          </div>
        ) : null}

        <p className="text-center text-sm text-white/40 mt-10">Questions? Call 0418 878 707</p>
        <p className="text-center text-xs text-white/20 mt-1">Brightly Cleaning 🌿</p>
      </div>
    </div>
  );
}
