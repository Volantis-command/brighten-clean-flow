import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, Send, Phone, Shield, Star, Clock, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { TermsModal } from '@/components/quote/TermsModal';

/* ─── What's Included by clean type ─── */
const INCLUSIONS: Record<string, string[]> = {
  'Standard Clean': [
    'Kitchen deep wipe-down',
    'All bathrooms cleaned',
    '{bedrooms} bedrooms',
    'Vacuuming & mopping all floors',
    'Surface wipe-downs throughout',
    'Bin emptying',
    'Mirrors & glass polished',
  ],
  'Deep Clean': [
    'Everything in a Standard Clean',
    'Inside oven cleaning',
    'Inside fridge cleaning',
    'Window sills & tracks',
    'Skirting boards wiped',
    'Light switches & door handles',
    'Inside cupboards wiped',
  ],
  'End of Lease': [
    'Everything in a Deep Clean',
    'Wall spot cleaning',
    'Carpet steam clean (if selected)',
    'Full garage (if applicable)',
    'Bond clean standard',
  ],
  'Airbnb Turnover': [
    'Fresh linen made up',
    'Towel folds',
    'Bathroom stock replenishment',
    'Kitchen reset',
    'Rubbish removal',
    'Property inspection check',
  ],
};

function getInclusions(cleanType: string, bedrooms: number): string[] {
  // Find best match
  const key = Object.keys(INCLUSIONS).find((k) =>
    cleanType?.toLowerCase().includes(k.toLowerCase())
  );
  const items = INCLUSIONS[key || 'Standard Clean'] || INCLUSIONS['Standard Clean'];
  return items.map((item) => item.replace('{bedrooms}', String(bedrooms || 0)));
}

/* ─── Animated checkmark item ─── */
function CheckItem({ text, delay }: { text: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className="flex items-start gap-3 transition-all duration-500"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(-12px)',
      }}
    >
      <div className="mt-0.5 shrink-0">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="#3A7560" strokeWidth="1.5" opacity="0.3" />
          <path
            d="M6 10.5L9 13.5L14 7.5"
            stroke="#3A7560"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 20,
              strokeDashoffset: visible ? 0 : 20,
              transition: `stroke-dashoffset 0.5s ease ${delay + 200}ms`,
            }}
          />
        </svg>
      </div>
      <span className="text-sm text-white/80">{text}</span>
    </div>
  );
}

/* ─── Success screen after accept ─── */
function SuccessScreen({ name, date, time }: { name: string; date?: string; time?: string }) {
  const formattedDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: '#0A0F0E' }}>
      <div className="text-center space-y-6 max-w-sm">
        {/* Animated green tick */}
        <div className="relative mx-auto w-24 h-24">
          <svg viewBox="0 0 96 96" className="w-24 h-24">
            <circle
              cx="48" cy="48" r="44"
              fill="none" stroke="#3A7560" strokeWidth="3"
              strokeDasharray="276"
              strokeDashoffset="276"
              style={{ animation: 'drawCircle 0.8s ease forwards' }}
            />
            <path
              d="M28 50L42 64L68 34"
              fill="none" stroke="#3A7560" strokeWidth="4"
              strokeLinecap="round" strokeLinejoin="round"
              className="animate-draw-tick"
            />
          </svg>
          <div className="absolute inset-0 rounded-full"
            style={{ boxShadow: '0 0 40px rgba(46, 93, 78, 0.3)' }} />
        </div>

        <h1 className="text-3xl font-extrabold text-white animate-slide-up"
          style={{ fontFamily: 'Nunito, sans-serif' }}>
          Booking Confirmed!
        </h1>

        {formattedDate && (
          <div className="rounded-2xl p-4 animate-slide-up" style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            animationDelay: '0.15s',
          }}>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1">Your clean is scheduled for</p>
            <p className="text-white text-lg font-bold" style={{ fontFamily: 'Nunito, sans-serif' }}>
              📅 {formattedDate}
            </p>
            {time && (
              <p className="text-white/60 text-sm mt-0.5">🕐 {time}</p>
            )}
          </div>
        )}

        <p className="text-white/60 text-base animate-slide-up" style={{ animationDelay: '0.2s' }}>
          We'll be in touch within 24 hours to confirm your cleaner.
        </p>
        <div className="pt-4 animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <a href="tel:0418878707"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FEDB00' }}>
            <Phone className="w-4 h-4" />
            Questions? 0418 878 707
          </a>
        </div>
        <p className="text-white/30 text-sm pt-4" style={{ fontFamily: 'Nunito, sans-serif' }}>
          — Brightly Cleaning 🌿
        </p>
      </div>
    </div>
  );
}

/* ─── Declined screen ─── */
function DeclinedScreen({ name }: { name: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: '#0A0F0E' }}>
      <div className="text-center space-y-5 max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <XCircle className="w-8 h-8 text-white/40" />
        </div>
        <h1 className="text-2xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          No worries at all{name ? `, ${name}` : ''}.
        </h1>
        <p className="text-white/50 text-sm">
          If you change your mind, just call us on <strong className="text-white/70">0418 878 707</strong>.
        </p>
        <p className="text-white/50 text-sm">
          We hope to work with you in the future. 🌿
        </p>
      </div>
    </div>
  );
}

/* ─── Already accepted screen ─── */
function AlreadyAcceptedScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: '#0A0F0E' }}>
      <div className="text-center space-y-5 max-w-sm">
        <CheckCircle2 className="w-16 h-16 mx-auto text-[#4ADE80]" />
        <h1 className="text-2xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          This quote has already been accepted.
        </h1>
        <p className="text-white/50">We'll see you soon!</p>
        <a href="tel:0418878707" className="text-[#FEDB00] font-bold text-sm">
          Questions? 0418 878 707
        </a>
      </div>
    </div>
  );
}

/* ─── Already declined screen ─── */
function AlreadyDeclinedScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: '#0A0F0E' }}>
      <div className="text-center space-y-5 max-w-sm">
        <XCircle className="w-16 h-16 mx-auto text-white/30" />
        <h1 className="text-2xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          This quote is no longer active.
        </h1>
        <p className="text-white/50 text-sm">
          Call <strong className="text-white/70">0418 878 707</strong> if you'd like a new quote.
        </p>
      </div>
    </div>
  );
}

/* ─── Not found / expired screen ─── */
function NotFoundScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: '#0A0F0E' }}>
      <div className="text-center space-y-5 max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          <span className="text-2xl">🔗</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Quote link expired or invalid
        </h1>
        <p className="text-white/50 text-sm">
          Call <strong className="text-white/70">0418 878 707</strong> for assistance.
        </p>
      </div>
    </div>
  );
}

/* ─── Loading screen ─── */
function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: '#0A0F0E' }}>
      <h1 className="text-3xl font-extrabold tracking-tight mb-4"
        style={{ fontFamily: 'Nunito, sans-serif', color: '#FEDB00' }}>
        Brightly<span className="text-white/40">.</span>
      </h1>
      <Loader2 className="w-6 h-6 animate-spin text-white/30" />
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */

export default function QuoteViewPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  // Flow states
  const [confirming, setConfirming] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [showMessagePanel, setShowMessagePanel] = useState(false);
  const [message, setMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  // T&C + scheduling states
  const [tcsAccepted, setTcsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [showScheduling, setShowScheduling] = useState(false);
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');

  // Min date = tomorrow
  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  // Load quote
  useEffect(() => {
    async function load() {
      if (!token) { setNotFound(true); setLoading(false); return; }
      const { data, error } = await (supabase as any)
        .from('quotes')
        .select('*')
        .eq('quote_token', token)
        .single();

      if (error || !data) { setNotFound(true); setLoading(false); return; }

      setQuote(data);
      setLoading(false);

      // Pre-fill the preferred date/time the client picked during intake so they
      // can see & confirm their original preference instead of starting from
      // scratch. Accepts either a HH:MM time or a legacy morning/midday/afternoon
      // label — converts to a HH:MM value.
      if (data?.preferred_date) setPreferredDate(data.preferred_date);
      if (data?.preferred_time) {
        const raw = String(data.preferred_time).trim();
        if (/^\d{1,2}:\d{2}/.test(raw)) {
          setPreferredTime(raw.slice(0, 5));
        } else {
          const lower = raw.toLowerCase();
          if (lower.startsWith('morning')) setPreferredTime('09:00');
          else if (lower.startsWith('midday')) setPreferredTime('12:00');
          else if (lower.startsWith('afternoon')) setPreferredTime('14:00');
          else if (lower.startsWith('evening')) setPreferredTime('17:00');
        }
      }

      // Fire-and-forget: mark as viewed
      (supabase as any).from('quotes')
        .update({ quote_viewed_at: new Date().toISOString() })
        .eq('quote_token', token)
        .is('quote_viewed_at', null)
        .then(() => {});
    }
    load();
  }, [token]);

  // ─── Step 1: Accept quote (show scheduling) ───
  const handleAcceptClick = useCallback(() => {
    if (!tcsAccepted) {
      toast.error('Please accept the Terms & Conditions first');
      return;
    }
    setShowScheduling(true);
  }, [tcsAccepted]);

  // ─── Step 2: Confirm booking with date/time ───
  const handleConfirmBooking = useCallback(async () => {
    if (!quote || !preferredDate) return;
    setConfirming(true);
    try {
      // 1. Update quote status
      await (supabase as any).from('quotes').update({
        status: 'accepted',
        quote_accepted_at: new Date().toISOString(),
        acceptance_method: 'quote_page',
        tcs_accepted: true,
        tcs_accepted_at: new Date().toISOString(),
        tcs_version: '2026-03',
      }).eq('quote_token', token);

      // 2. Update quote_requests if linked
      if (quote.lead_id) {
        await (supabase as any).from('quote_requests')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('id', quote.lead_id);
      }
      if (quote.client_phone) {
        await (supabase as any).from('quote_requests')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('phone', quote.client_phone)
          .in('status', ['quote_sent', 'form_submitted', 'awaiting_quote', 'new_enquiry']);
      }

      // 3. Create job via edge function (bypasses RLS)
      const { data: bookingResult, error: bookingError } = await supabase.functions.invoke(
        'create-booking-from-quote',
        {
          body: {
            quote_id: quote.id,
            preferred_date: preferredDate,
            preferred_time: preferredTime || null,
            source: 'quote_accepted',
            client_name: quote.client_name,
            tcs_accepted: true,
            tcs_version: '2026-03',
          },
        }
      );
      if (bookingError) throw new Error('Failed to create booking');
      const jobId = bookingResult?.job_id;

      // 4. Notify admin (non-blocking)
      supabase.functions.invoke('send-quote-notification', {
        body: {
          type: 'quote_accepted',
          client_name: quote.client_name,
          clean_type: quote.clean_type,
          address: quote.property_address,
          total_inc_gst: quote.sell_price_inc_gst,
          job_id: jobId,
        },
      }).catch(() => {});

      setAccepted(true);
    } catch (e: any) {
      toast.error(e.message || 'Something went wrong. Please try again.');
    }
    setConfirming(false);
  }, [quote, token, preferredDate, preferredTime]);

  // ─── Decline flow ───
  const handleDecline = useCallback(async () => {
    if (!quote) return;
    setDeclining(true);
    try {
      await (supabase as any).from('quotes').update({
        status: 'declined',
        quote_declined_at: new Date().toISOString(),
      }).eq('quote_token', token);

      if (quote.lead_id) {
        await (supabase as any).from('quote_requests')
          .update({ status: 'declined' })
          .eq('id', quote.lead_id);
      }

      // Notify admin (non-blocking)
      supabase.functions.invoke('send-quote-notification', {
        body: {
          type: 'quote_declined',
          client_name: quote.client_name,
          clean_type: quote.clean_type,
          address: quote.property_address,
        },
      }).catch(() => {});

      setDeclined(true);
    } catch (e: any) {
      toast.error(e.message || 'Something went wrong.');
    }
    setDeclining(false);
  }, [quote, token]);

  // ─── Send message flow ───
  const handleSendMessage = useCallback(async () => {
    if (!quote || !message.trim()) return;
    setSendingMessage(true);
    try {
      // Insert into quote_messages
      await (supabase as any).from('quote_messages').insert({
        quote_id: quote.id,
        quote_token: token,
        client_name: quote.client_name,
        client_phone: quote.client_phone,
        message: message.trim(),
        direction: 'inbound',
      });

      // Notify admin (non-blocking)
      supabase.functions.invoke('send-quote-notification', {
        body: {
          type: 'quote_question',
          client_name: quote.client_name,
          client_phone: quote.client_phone,
          message: message.trim(),
          address: quote.property_address,
        },
      }).catch(() => {});

      setMessageSent(true);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send message.');
    }
    setSendingMessage(false);
  }, [quote, message, token]);

  // ─── State screens ───
  if (loading) return <LoadingScreen />;
  if (notFound) return <NotFoundScreen />;
  if (accepted) return <SuccessScreen name={(quote?.client_name || '').split(' ')[0]} date={preferredDate} time={preferredTime} />;
  if (declined) return <DeclinedScreen name={(quote?.client_name || '').split(' ')[0]} />;
  if (quote?.quote_accepted_at && quote?.status === 'accepted') return <AlreadyAcceptedScreen />;
  if (quote?.quote_declined_at || quote?.status === 'declined') return <AlreadyDeclinedScreen />;

  const firstName = (quote.client_name || '').split(' ')[0];
  const price = Number(quote.sell_price_inc_gst || quote.price || 0);
  const hours = quote.estimated_hours || quote.hours || null;
  const cleanType = quote.clean_type || quote.service_type || 'Clean';
  const inclusions = getInclusions(cleanType, quote.bedrooms || 0);

  return (
    <div className="min-h-screen" style={{
      background: '#0A0F0E',
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(254, 219, 0, 0.04) 0%, transparent 50%)',
    }}>
      {/* ─── Header ─── */}
      <header className="pt-8 pb-2 px-6 text-center fade-in">
        <h1 className="text-2xl font-extrabold tracking-tight"
          style={{ fontFamily: 'Nunito, sans-serif', color: '#FEDB00' }}>
          Brightly<span className="text-white/30">.</span>
        </h1>
        <div className="mt-6 space-y-1">
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Your Quote is Ready</p>
          <p className="text-white text-xl font-extrabold" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Hi {firstName || 'there'} 👋
          </p>
        </div>
      </header>

      <div className="max-w-md mx-auto px-5 pb-12 space-y-6 mt-6">
        {/* ═══ GLASS PRICE CARD ═══ */}
        <div
          className="relative overflow-hidden rounded-3xl p-6 fade-in"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            boxShadow: '0 0 40px rgba(254, 219, 0, 0.12), 0 8px 32px rgba(0, 0, 0, 0.4)',
            animationDelay: '0.15s',
          }}
        >
          {/* Shimmer overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.03) 50%, transparent 60%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 6s ease-in-out infinite',
          }} />

          {/* Service badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className="px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: 'rgba(254, 219, 0, 0.15)', color: '#FEDB00' }}>
              {cleanType}
            </span>
          </div>

          {/* Address */}
          {(quote.property_address || quote.property_name) && (
            <p className="text-white/60 text-sm mb-5">
              📍 {quote.property_address || quote.property_name}
            </p>
          )}

          {/* THE PRICE */}
          <div className="text-center py-4">
            <p className="text-5xl font-extrabold text-white tracking-tight count-up"
              style={{ fontFamily: 'Nunito, sans-serif' }}>
              ${price.toFixed(2)}
            </p>
            <p className="text-white/40 text-sm mt-1">inc GST</p>
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-center gap-6 mt-4 pt-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {hours && (
              <div className="flex items-center gap-1.5 text-white/50 text-sm">
                <Clock className="w-4 h-4" />
                <span>~{hours} hrs</span>
              </div>
            )}
            {(quote.bedrooms > 0 || quote.bathrooms > 0) && (
              <div className="text-white/50 text-sm">
                {quote.bedrooms || 0}BR / {quote.bathrooms || 0}BA
              </div>
            )}
          </div>
        </div>

        {/* ═══ WHAT'S INCLUDED ═══ */}
        <div className="space-y-3 fade-in" style={{ animationDelay: '0.3s' }}>
          <h2 className="text-sm font-bold text-white/40 uppercase tracking-widest flex items-center gap-2 px-1">
            <span style={{ color: '#FEDB00' }}>✨</span> What's Included
          </h2>
          <div className="rounded-2xl p-5 space-y-3" style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {inclusions.map((item, i) => (
              <CheckItem key={i} text={item} delay={400 + i * 120} />
            ))}
          </div>
        </div>

        {/* ═══ SPECIAL NOTES ═══ */}
        {quote.notes && (
          <div className="rounded-2xl p-5 fade-in" style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            animationDelay: '0.4s',
          }}>
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
              Special notes from your request
            </p>
            <p className="text-sm text-white/70 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* ═══ TRUST BADGES ═══ */}
        <div className="flex items-center justify-center gap-6 py-2 fade-in"
          style={{ animationDelay: '0.5s' }}>
          <div className="flex items-center gap-1.5 text-white/40 text-xs">
            <Shield className="w-4 h-4" />
            <span>Fully Insured</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/40 text-xs">
            <CheckCircle2 className="w-4 h-4" />
            <span>Police Checked</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/40 text-xs">
            <Star className="w-4 h-4" />
            <span>5-Star Quality</span>
          </div>
        </div>

        {/* ═══ TERMS & CONDITIONS ═══ */}
        {!showScheduling && (
          <div className="rounded-2xl p-5 fade-in" style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            animationDelay: '0.6s',
          }}>
            <div className="flex items-start gap-3">
              <Checkbox
                id="tcs-quote"
                checked={tcsAccepted}
                onCheckedChange={(v) => setTcsAccepted(v === true)}
                className="mt-0.5 border-white/30 data-[state=checked]:bg-[#3A7560] data-[state=checked]:border-[#3A7560]"
              />
              <label htmlFor="tcs-quote" className="text-sm text-white/70 cursor-pointer">
                I have read and agree to the{' '}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setTermsOpen(true); }}
                  className="font-bold underline"
                  style={{ color: '#FEDB00' }}
                >
                  Terms & Conditions
                </button>
              </label>
            </div>
          </div>
        )}

        {/* ═══ ACTION BUTTONS ═══ */}
        <div className="space-y-3 pt-2 fade-in" style={{ animationDelay: '0.6s' }}>
          {/* SCHEDULING SECTION (shown after clicking Accept) */}
          {showScheduling ? (
            <div className="rounded-2xl p-5 space-y-4 slide-down" style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <h3 className="text-white font-bold text-base flex items-center gap-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                <CalendarDays className="w-5 h-5" style={{ color: '#FEDB00' }} />
                Choose Your Preferred Date & Time
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1.5">Date</label>
                  <input
                    type="date"
                    min={minDate}
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      colorScheme: 'dark',
                    }}
                  />
                </div>

                <div>
                  <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1.5">Start Time</label>
                  <input
                    type="time"
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      colorScheme: 'dark',
                    }}
                  />
                  <p className="text-white/40 text-xs mt-1.5">Pick a specific start time — or leave it blank if you're flexible and we'll confirm.</p>
                </div>
              </div>

              <button
                onClick={handleConfirmBooking}
                disabled={confirming || !preferredDate}
                className="w-full py-4 rounded-2xl text-lg font-extrabold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-40"
                style={{
                  background: confirming ? '#26503F' : '#3A7560',
                  color: '#fff',
                  boxShadow: '0 0 24px rgba(46, 93, 78, 0.3)',
                  fontFamily: 'Nunito, sans-serif',
                }}
              >
                {confirming ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Confirm Booking
                  </>
                )}
              </button>

              {!preferredDate && (
                <p className="text-center text-xs text-white/30">Please select a date to confirm</p>
              )}

              <button
                onClick={() => setShowScheduling(false)}
                className="w-full py-2 text-sm text-white/30 hover:text-white/50 transition-colors"
              >
                ← Go Back
              </button>
            </div>
          ) : (
            /* ACCEPT BUTTON */
            <button
              onClick={handleAcceptClick}
              disabled={!tcsAccepted}
              className="w-full py-4 rounded-2xl text-lg font-extrabold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-40"
              style={{
                background: !tcsAccepted ? '#26503F' : '#3A7560',
                color: '#fff',
                boxShadow: tcsAccepted ? '0 0 24px rgba(46, 93, 78, 0.3)' : 'none',
                fontFamily: 'Nunito, sans-serif',
              }}
              onMouseEnter={(e) => {
                if (tcsAccepted) e.currentTarget.style.boxShadow = '0 0 40px rgba(46, 93, 78, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = tcsAccepted ? '0 0 24px rgba(46, 93, 78, 0.3)' : 'none';
              }}
            >
              <CheckCircle2 className="w-5 h-5" />
              Accept This Quote
            </button>
          )}

          {/* MORE INFO */}
          <button
            onClick={() => { setShowMessagePanel(!showMessagePanel); setShowDeclineConfirm(false); }}
            className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2"
            style={{
              background: 'transparent',
              color: '#FEDB00',
              border: '1.5px solid rgba(254, 219, 0, 0.4)',
            }}
          >
            💬 I Have a Question
          </button>

          {/* Message Panel (inline expand) */}
          {showMessagePanel && (
            <div className="rounded-2xl p-5 space-y-3 slide-down" style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {messageSent ? (
                <div className="text-center py-4 space-y-2">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-[#4ADE80]" />
                  <p className="text-white font-bold">Thanks! We'll get back to you shortly.</p>
                  <p className="text-white/40 text-sm">Usually within a few hours.</p>
                </div>
              ) : (
                <>
                  <p className="text-white/60 text-sm">What would you like to know?</p>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your question here..."
                    rows={3}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sendingMessage || !message.trim()}
                    className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                    style={{
                      background: '#FEDB00',
                      color: '#0C463D',
                    }}
                  >
                    {sendingMessage ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Message
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {/* DECLINE */}
          {!showDeclineConfirm ? (
            <button
              onClick={() => { setShowDeclineConfirm(true); setShowMessagePanel(false); }}
              className="w-full py-3 rounded-2xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2"
              style={{
                background: 'transparent',
                color: 'rgba(255,255,255,0.3)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <XCircle className="w-4 h-4" />
              No Thanks
            </button>
          ) : (
            <div className="rounded-2xl p-5 space-y-4 slide-down" style={{
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}>
              <p className="text-white text-sm font-bold text-center">
                Are you sure? We'd hate to lose you.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeclineConfirm(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  Go Back
                </button>
                <button
                  onClick={handleDecline}
                  disabled={declining}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#EF4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {declining ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Decline'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="text-center pt-6 pb-4 space-y-2 fade-in" style={{ animationDelay: '0.7s' }}>
          <a href="tel:0418878707"
            className="inline-flex items-center gap-2 text-sm font-bold"
            style={{ color: '#FEDB00' }}>
            <Phone className="w-4 h-4" />
            Questions? 0418 878 707
          </a>
          <p className="text-white/20 text-xs" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Brightly Cleaning — Premium Cleaning Services
          </p>
        </div>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
