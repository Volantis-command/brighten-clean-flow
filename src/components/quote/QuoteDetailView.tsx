import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

type QuoteData = {
  id: string;
  client_name: string | null;
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
};

export default function QuoteDetailView({ token }: { token: string }) {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [actionDone, setActionDone] = useState<'accepted' | 'declined' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, client_name, property_address, service_type, clean_type, bedrooms, bathrooms, sell_price_inc_gst, discounted_price, status, quote_accepted_at, quote_declined_at')
        .eq('quote_token', token)
        .maybeSingle();
      if (error || !data) setNotFound(true);
      else setQuote(data);
      setLoading(false);
    })();
  }, [token]);

  const handleAction = async (action: 'accepted' | 'declined') => {
    if (!quote) return;
    setSubmitting(true);
    const updates: Record<string, unknown> = {
      status: action === 'accepted' ? 'client_accepted' : 'declined',
    };
    if (action === 'accepted') updates.quote_accepted_at = new Date().toISOString();
    else updates.quote_declined_at = new Date().toISOString();

    await supabase.from('quotes').update(updates).eq('id', quote.id);
    setActionDone(action);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#2E5D4E] animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold text-white mb-3">Quote Not Found</h1>
        <p className="text-white/50 mb-6">We couldn't find this quote. It may have expired or the link is incorrect.</p>
        <a href="/quote" className="h-14 px-8 rounded-xl bg-[#2E5D4E] text-white font-semibold flex items-center justify-center">
          Start a New Quote
        </a>
      </div>
    );
  }

  const alreadyAccepted = quote?.status === 'client_accepted' || quote?.status === 'accepted' || !!quote?.quote_accepted_at;
  const alreadyDeclined = quote?.status === 'declined' || !!quote?.quote_declined_at;
  const price = quote?.discounted_price ?? quote?.sell_price_inc_gst;
  const serviceLabel = quote?.clean_type || quote?.service_type || 'Cleaning Service';

  // Post-action confirmation
  if (actionDone) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full p-6 mb-6 bg-[#2E5D4E]/20">
          {actionDone === 'accepted' ? (
            <CheckCircle className="w-12 h-12 text-[#2E5D4E]" />
          ) : (
            <XCircle className="w-12 h-12 text-white/40" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">
          {actionDone === 'accepted' ? 'Quote Accepted!' : 'Quote Declined'}
        </h1>
        <p className="text-white/50 max-w-sm">
          {actionDone === 'accepted'
            ? "We'll be in touch to confirm your first clean. 😊"
            : 'No worries — reach out anytime if you change your mind.'}
        </p>
        <p className="text-sm mt-8 text-white/40">📞 0418 878 707</p>
      </div>
    );
  }

  // Already accepted
  if (alreadyAccepted) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full p-6 mb-6 bg-[#2E5D4E]/20">
          <CheckCircle className="w-12 h-12 text-[#2E5D4E]" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">You've Already Accepted This Quote</h1>
        <p className="text-white/50 max-w-sm">We're getting everything ready for your clean. We'll be in touch soon!</p>
        <p className="text-sm mt-8 text-white/40">📞 0418 878 707</p>
      </div>
    );
  }

  // Already declined
  if (alreadyDeclined) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full p-6 mb-6 bg-white/10">
          <XCircle className="w-12 h-12 text-white/40" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">This Quote Was Declined</h1>
        <p className="text-white/50 max-w-sm mb-6">Changed your mind? We'd love to help.</p>
        <button onClick={() => handleAction('accepted')} className="h-14 px-8 rounded-xl bg-[#2E5D4E] text-white font-semibold">
          Accept Quote
        </button>
        <p className="text-sm mt-8 text-white/40">📞 0418 878 707</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <header className="flex items-center justify-between max-w-2xl mx-auto w-full px-6 pt-6 mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span style={{ color: '#FEDB00' }}>.</span>
        </h1>
        <a href="/quote" className="text-[#2E5D4E] text-sm font-medium">New Enquiry</a>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 pb-12">
        <h2 className="text-2xl font-bold text-white mb-1">Your Quote</h2>
        <p className="text-base text-white/50 mb-8">
          Hi{quote?.client_name ? ` ${quote.client_name.split(' ')[0]}` : ''}, here's your personalised quote from Brightly.
        </p>

        {/* Quote card */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-6 space-y-5">
          <div>
            <span className="text-xs font-bold tracking-widest text-[#2E5D4E] uppercase">Service</span>
            <p className="text-lg text-white font-semibold mt-1">{serviceLabel}</p>
          </div>

          {quote?.property_address && (
            <div>
              <span className="text-xs font-bold tracking-widest text-[#2E5D4E] uppercase">Property</span>
              <p className="text-base text-white mt-1">{quote.property_address}</p>
            </div>
          )}

          <div className="flex gap-8">
            {quote?.bedrooms != null && (
              <div>
                <span className="text-xs font-bold tracking-widest text-[#2E5D4E] uppercase">Bedrooms</span>
                <p className="text-base text-white mt-1">{quote.bedrooms}</p>
              </div>
            )}
            {quote?.bathrooms != null && (
              <div>
                <span className="text-xs font-bold tracking-widest text-[#2E5D4E] uppercase">Bathrooms</span>
                <p className="text-base text-white mt-1">{quote.bathrooms}</p>
              </div>
            )}
          </div>

          {/* Price */}
          {price ? (
            <div className="pt-4 border-t border-white/10">
              <span className="text-xs font-bold tracking-widest text-[#2E5D4E] uppercase">Quoted Price (inc. GST)</span>
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
              onClick={() => handleAction('accepted')}
              disabled={submitting}
              className="w-full h-14 rounded-xl bg-[#2E5D4E] hover:bg-[#26503F] text-lg font-semibold text-white transition-all duration-200 shadow-lg shadow-[#2E5D4E]/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Accept Quote'}
            </button>
            <button
              onClick={() => handleAction('declined')}
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
