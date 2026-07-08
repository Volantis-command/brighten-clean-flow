import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, Send, Phone, Shield, Star, Clock, CalendarDays } from 'lucide-react';
import { TimeSelect } from '@/components/ui/time-select';
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
};

function isAirbnbType(cleanType: string): boolean {
  const t = (cleanType || '').toLowerCase();
  return t.includes('airbnb') || t.includes('short-stay') || t.includes('turnover');
}

/**
 * Build the "What's Included" list for a quote.
 * For Airbnb: only show extras the client opted into — no gimmies.
 * For Standard/Deep/EOL: keep the descriptive list (clients expect to see what they're paying for).
 */
function getInclusions(quote: any): string[] {
  const cleanType = quote?.clean_type || quote?.service_type || '';

  if (isAirbnbType(cleanType)) {
    const items: string[] = ['Full Airbnb turnover clean'];
    const cs = (quote?.consumables_selection || {}) as Record<string, any>;

    if (quote?.linen_required === true) items.push('Fresh linen supplied & made up');
    if (cs.amenities_kit === true) items.push('Guest amenities kit (shampoo, soap, etc.)');
    if (cs.wash_kit === true) items.push('Laundry / wash kit');
    if (cs.tea_coffee_kit === true) items.push('Tea & coffee restock');
    if (cs.include_photo_report === true) items.push('Photo report after every clean');

    return items;
  }

  // Non-Airbnb: keep the descriptive list
  const bedrooms = Number(quote?.bedrooms || 0);
  const key = Object.keys(INCLUSIONS).find((k) =>
    cleanType?.toLowerCase().includes(k.toLowerCase())
  );
  const items = INCLUSIONS[key || 'Standard Clean'] || INCLUSIONS['Standard Clean'];
  const base = items.map((item) => item.replace('{bedrooms}', String(bedrooms)));

  // Append selected add-ons (e.g. inside oven, carpet steam) if present
  const extras = Array.isArray(quote?.extras) ? quote.extras : [];
  for (const e of extras) {
    if (e?.name) base.push(String(e.name));
  }
  return base;
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
          <circle cx="10" cy="10" r="9" stroke="#4ADE80" strokeWidth="1.5" opacity="0.4" />
          <path
            d="M6 10.5L9 13.5L14 7.5"
            stroke="#4ADE80"
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
function SuccessScreen({ name, date, time, isAirbnb }: { name: string; date?: string; time?: string; isAirbnb?: boolean }) {
  const formattedDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: '#0B0F17' }}>
      <div className="text-center space-y-6 max-w-sm">
        {/* Animated green tick */}
        <div className="relative mx-auto w-24 h-24">
          <svg viewBox="0 0 96 96" className="w-24 h-24">
            <circle
              cx="48" cy="48" r="44"
              fill="none" stroke="#4ADE80" strokeWidth="3"
              strokeDasharray="276"
              strokeDashoffset="276"
              style={{ animation: 'drawCircle 0.8s ease forwards' }}
            />
            <path
              d="M28 50L42 64L68 34"
              fill="none" stroke="#4ADE80" strokeWidth="4"
              strokeLinecap="round" strokeLinejoin="round"
              className="animate-draw-tick"
            />
          </svg>
          <div className="absolute inset-0 rounded-full"
            style={{ boxShadow: '0 0 40px rgba(74,222,128,0.2)' }} />
        </div>

        <h1 className="text-3xl font-extrabold text-white animate-slide-up"
          style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
          {isAirbnb ? 'Quote Accepted!' : 'Booking Confirmed!'}
        </h1>

        {!isAirbnb && formattedDate && (
          <div className="rounded-2xl p-4 animate-slide-up" style={{
            background: 'rgba(19,25,32,0.8)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(74,222,128,0.2)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(74,222,128,0.04)',
            animationDelay: '0.15s',
          }}>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1">Your clean is scheduled for</p>
            <p className="text-white text-lg font-bold" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
              📅 {formattedDate}
            </p>
            {time && (
              <p className="text-white/60 text-sm mt-0.5">🕐 {time}</p>
            )}
          </div>
        )}

        <p className="text-white/60 text-base animate-slide-up" style={{ animationDelay: '0.2s' }}>
          {isAirbnb
            ? "We'll be in touch to set up your onboarding and connect your booking platform. Turnover cleans are scheduled per guest checkout."
            : "We'll be in touch within 24 hours to confirm your cleaner."}
        </p>
        <div className="pt-4 animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <a href="tel:0418878707"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold"
            style={{ background: '#1a2232', border: '1px solid rgba(74,222,128,0.18)', color: '#FEDB00' }}>
            <Phone className="w-4 h-4" />
            Questions? 0418 878 707
          </a>
        </div>
        <p className="text-white/30 text-sm pt-4" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
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
      style={{ background: '#0B0F17' }}>
      <div className="text-center space-y-5 max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
          style={{ background: '#131920', border: '1px solid rgba(74,222,128,0.18)' }}>
          <XCircle className="w-8 h-8 text-white/40" />
        </div>
        <h1 className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
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
      style={{ background: '#0B0F17' }}>
      <div className="text-center space-y-5 max-w-sm">
        <CheckCircle2 className="w-16 h-16 mx-auto text-[#4ADE80]" />
        <h1 className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
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
      style={{ background: '#0B0F17' }}>
      <div className="text-center space-y-5 max-w-sm">
        <XCircle className="w-16 h-16 mx-auto text-white/30" />
        <h1 className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
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
      style={{ background: '#0B0F17' }}>
      <div className="text-center space-y-5 max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
          style={{ background: '#131920' }}>
          <span className="text-2xl">🔗</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
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
      style={{ background: '#0B0F17' }}>
      <h1 className="text-3xl font-extrabold tracking-tight mb-4"
        style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", color: '#FEDB00' }}>
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

  // Interactive pricing
  const [linenOn, setLinenOn] = useState(true);
  const [consumablesOn, setConsumablesOn] = useState(true);

  // AI chat
  const [chatHistory, setChatHistory] = useState<{role: string; content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

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

  // For Airbnb the client never picks a date — cleans happen per guest
  // checkout via the host's booking platform. So Accept goes straight to
  // the accepted state and skips the date/time picker + per-clean job creation.
  const cleanTypeForFlow = quote?.clean_type || quote?.service_type || '';
  const isAirbnbQuote = (() => {
    const t = cleanTypeForFlow.toLowerCase();
    return t.includes('airbnb') || t.includes('short-stay') || t.includes('turnover');
  })();

  // ─── Step 1: Accept quote ───
  // Residential / Deep / EOL → show scheduling picker
  // Airbnb → accept straight away, no job created yet
  const handleAcceptClick = useCallback(async () => {
    if (!tcsAccepted) {
      toast.error('Please accept the Terms & Conditions first');
      return;
    }

    if (!isAirbnbQuote) {
      setShowScheduling(true);
      return;
    }

    // Airbnb path — accept without scheduling or job creation.
    if (!quote) return;
    setConfirming(true);
    try {
      await (supabase as any).from('quotes').update({
        status: 'accepted',
        quote_accepted_at: new Date().toISOString(),
        acceptance_method: 'quote_page',
        tcs_accepted: true,
        tcs_accepted_at: new Date().toISOString(),
        tcs_version: '2026-03',
      }).eq('quote_token', token);

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

      // Admin notification (non-blocking). No job_id because we don't
      // create a job here — Airbnb jobs come later via the booking platform.
      supabase.functions.invoke('send-quote-notification', {
        body: {
          type: 'quote_accepted',
          client_name: quote.client_name,
          clean_type: quote.clean_type,
          address: quote.property_address,
          total_inc_gst: quote.sell_price_inc_gst,
          airbnb_onboarding: true,
        },
      }).catch(() => {});

      setAccepted(true);
    } catch (e: any) {
      toast.error(e.message || 'Something went wrong. Please try again.');
    }
    setConfirming(false);
  }, [tcsAccepted, isAirbnbQuote, quote, token]);

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

  // AI chat — must be before early returns (Rules of Hooks)
  const handleChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    const userMsg = { role: 'user', content: msg };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('quote-ai-chat', {
        body: {
          quote_token: token,
          message: msg,
          history: chatHistory.slice(-6),
        },
      });
      if (error) throw error;
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch {
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Sorry, something went wrong. Call us on 0418 878 707." }]);
    }
    setChatLoading(false);
  }, [chatInput, chatLoading, chatHistory, token]);

  // ─── State screens ───
  if (loading) return <LoadingScreen />;
  if (notFound) return <NotFoundScreen />;
  if (accepted) return <SuccessScreen name={(quote?.client_name || '').split(' ')[0]} date={preferredDate} time={preferredTime} isAirbnb={isAirbnbQuote} />;
  if (declined) return <DeclinedScreen name={(quote?.client_name || '').split(' ')[0]} />;
  if (quote?.quote_accepted_at && quote?.status === 'accepted') return <AlreadyAcceptedScreen />;
  if (quote?.quote_declined_at || quote?.status === 'declined') return <AlreadyDeclinedScreen />;

  const firstName = (quote.client_name || '').split(' ')[0];
  const hours = quote.estimated_hours || quote.hours || null;
  const cleanType = quote.clean_type || quote.service_type || 'Clean';
  const inclusions = getInclusions(quote);

  // Interactive pricing — only active when cost components are stored on the quote
  const labourCostStored = Number(quote.labour_cost || 0);
  const linenCostStored  = Number(quote.linen_cost || 0);
  const consumablesCostStored = Number(quote.consumables_cost || 0);
  const gpPct = Number(quote.gp_percent || 0);
  const hasInteractive = (linenCostStored > 0 || consumablesCostStored > 0) && gpPct > 0;

  const adjustedCost = labourCostStored
    + (linenOn ? linenCostStored : 0)
    + (consumablesOn ? consumablesCostStored : 0);
  const adjustedSellExGst = hasInteractive && labourCostStored > 0
    ? adjustedCost / (1 - gpPct)
    : Number(quote.sell_price_ex_gst || 0);
  const adjustedSellIncGst = hasInteractive && labourCostStored > 0
    ? adjustedSellExGst * 1.1
    : Number(quote.sell_price_inc_gst || quote.price || 0);
  const price = adjustedSellIncGst;

  return (
    <div className="min-h-screen" style={{
      background: '#0B0F17',
      backgroundImage: 'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(74,222,128,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 30% at 80% 80%, rgba(254,219,0,0.04) 0%, transparent 60%)',
      color: '#F8FAFC',
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    }}>
      {/* ─── Header ─── */}
      <header className="pt-8 pb-2 px-6 text-center fade-in">
        <h1 className="text-2xl font-extrabold tracking-tight"
          style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", color: '#FEDB00' }}>
          Brightly<span className="text-white/30">.</span>
        </h1>
        <div className="mt-6 space-y-1">
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Your Quote is Ready</p>
          <p className="text-white text-xl font-extrabold" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
            Hi {firstName || 'there'} 👋
          </p>
        </div>
      </header>

      <div className="max-w-md mx-auto px-5 pb-12 space-y-6 mt-6">
        {/* ═══ PRICE CARD ═══ */}
        <div
          className="shimmer relative overflow-hidden rounded-3xl p-6 fade-in"
          style={{
            background: 'rgba(19,25,32,0.85)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(74,222,128,0.25)',
            boxShadow: '0 0 0 1px rgba(74,222,128,0.05), 0 0 40px rgba(74,222,128,0.08), 0 20px 60px rgba(0,0,0,0.5)',
            animationDelay: '0.15s',
          }}
        >

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
              style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
              ${price.toFixed(2)}
            </p>
            <p className="text-white/40 text-sm mt-1">inc GST</p>
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-center gap-6 mt-4 pt-4"
            style={{ borderTop: '1px solid rgba(74,222,128,0.15)' }}>
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
            background: 'rgba(19,25,32,0.8)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(74,222,128,0.15)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}>
            {inclusions.map((item, i) => (
              <CheckItem key={i} text={item} delay={400 + i * 120} />
            ))}
          </div>
        </div>

        {/* ═══ ADJUST YOUR QUOTE ═══ */}
        {hasInteractive && (
          <div className="space-y-3 fade-in" style={{ animationDelay: '0.35s' }}>
            <h2 className="text-sm font-bold text-white/40 uppercase tracking-widest flex items-center gap-2 px-1">
              <span style={{ color: '#4ADE80' }}>⚙</span> Adjust Your Quote
            </h2>
            <div className="rounded-2xl p-4 space-y-3" style={{
              background: 'rgba(19,25,32,0.8)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(74,222,128,0.15)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            }}>
              <p className="text-white/40 text-xs">Toggle items on or off — price updates live.</p>

              {linenCostStored > 0 && (
                <label className="flex items-center justify-between cursor-pointer py-1">
                  <div>
                    <div className="text-sm font-semibold text-white">Linen service</div>
                    <div className="text-xs text-white/40">Fresh sheets, towels & bath mats</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: '#4ADE80' }}>
                      +${linenCostStored.toFixed(2)}
                    </span>
                    <button
                      onClick={() => setLinenOn(v => !v)}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                      style={{ background: linenOn ? '#4ADE80' : 'rgba(74,222,128,0.12)' }}
                    >
                      <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                        style={{ transform: linenOn ? 'translateX(22px)' : 'translateX(2px)' }} />
                    </button>
                  </div>
                </label>
              )}

              {consumablesCostStored > 0 && (
                <label className="flex items-center justify-between cursor-pointer py-1">
                  <div>
                    <div className="text-sm font-semibold text-white">Consumables restock</div>
                    <div className="text-xs text-white/40">Soap, shampoo, toilet paper, coffee & tea</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: '#4ADE80' }}>
                      +${consumablesCostStored.toFixed(2)}
                    </span>
                    <button
                      onClick={() => setConsumablesOn(v => !v)}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                      style={{ background: consumablesOn ? '#4ADE80' : 'rgba(74,222,128,0.12)' }}
                    >
                      <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                        style={{ transform: consumablesOn ? 'translateX(22px)' : 'translateX(2px)' }} />
                    </button>
                  </div>
                </label>
              )}

              <div className="pt-2 mt-1" style={{ borderTop: '1px solid rgba(74,222,128,0.1)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Updated total</span>
                  <span className="text-xl font-extrabold" style={{ color: '#4ADE80', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
                    ${price.toFixed(2)} <span className="text-xs font-normal text-white/30">inc GST</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ SPECIAL NOTES ═══ */}
        {quote.notes && (
          <div className="rounded-2xl p-5 fade-in" style={{
            background: 'rgba(19,25,32,0.8)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(74,222,128,0.15)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
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
            background: 'rgba(19,25,32,0.8)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(74,222,128,0.2)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
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
              background: 'rgba(19,25,32,0.8)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(74,222,128,0.2)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}>
              <h3 className="text-white font-bold text-base flex items-center gap-2" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
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
                      background: '#1a2232',
                      border: '1px solid rgba(74,222,128,0.18)',
                      colorScheme: 'dark',
                    }}
                  />
                </div>

                <div>
                  <label className="text-white/50 text-xs font-bold uppercase tracking-wider block mb-1.5">Start Time</label>
                  <TimeSelect
                    value={preferredTime}
                    onChange={setPreferredTime}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white bg-white/[0.06] border border-white/10"
                    placeholder="Flexible — we'll confirm"
                  />
                  <p className="text-white/40 text-xs mt-1.5">Pick a specific start time — or leave it as Flexible and we'll confirm.</p>
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
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
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
                background: !tcsAccepted ? '#1f3d30' : 'linear-gradient(135deg, #3A7560, #2d6050)',
                color: '#fff',
                boxShadow: tcsAccepted ? '0 0 32px rgba(74,222,128,0.25), 0 8px 24px rgba(0,0,0,0.4)' : 'none',
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                if (tcsAccepted) e.currentTarget.style.boxShadow = '0 0 48px rgba(74,222,128,0.35), 0 8px 32px rgba(0,0,0,0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = tcsAccepted ? '0 0 32px rgba(74,222,128,0.25), 0 8px 24px rgba(0,0,0,0.4)' : 'none';
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

          {/* AI Chat Panel */}
          {showMessagePanel && (
            <div className="rounded-2xl slide-down overflow-hidden" style={{
              background: 'rgba(19,25,32,0.8)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(74,222,128,0.2)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(74,222,128,0.1)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: 'rgba(74,222,128,0.15)', color: '#4ADE80' }}>B</div>
                <div>
                  <div className="text-sm font-bold text-white">Brightly Assistant</div>
                  <div className="text-xs text-white/40">Usually replies instantly</div>
                </div>
              </div>

              {/* Chat bubbles */}
              <div className="px-4 py-3 space-y-3 min-h-[80px] max-h-64 overflow-y-auto" id="chat-scroll">
                {chatHistory.length === 0 && (
                  <p className="text-white/40 text-sm text-center py-2">Ask anything about this quote or our service.</p>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="rounded-2xl px-4 py-2.5 text-sm max-w-[85%] leading-relaxed"
                      style={msg.role === 'user' ? {
                        background: 'rgba(74,222,128,0.15)',
                        color: '#F8FAFC',
                        borderBottomRightRadius: '4px',
                      } : {
                        background: '#1a2232',
                        color: '#F8FAFC',
                        borderBottomLeftRadius: '4px',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-4 py-2.5 text-sm" style={{ background: '#1a2232', borderBottomLeftRadius: '4px' }}>
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Input row */}
              <div className="flex gap-2 px-4 py-3" style={{ borderTop: '1px solid rgba(74,222,128,0.1)' }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); } }}
                  placeholder="Ask a question..."
                  className="flex-1 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none"
                  style={{ background: '#1a2232', border: '1px solid rgba(74,222,128,0.18)' }}
                />
                <button
                  onClick={handleChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="rounded-xl px-3 py-2.5 flex items-center justify-center transition-all disabled:opacity-40"
                  style={{ background: '#4ADE80', color: '#0B0F17', minWidth: '42px' }}
                >
                  {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
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
                border: '1px solid rgba(74,222,128,0.15)',
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
                    background: '#1a2232',
                    color: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(74,222,128,0.18)',
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
          <p className="text-white/20 text-xs" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
            Brightly Cleaning — Premium Cleaning Services
          </p>
        </div>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
