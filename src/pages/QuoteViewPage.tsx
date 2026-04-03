import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TermsModal } from '@/components/quote/TermsModal';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CONSUMABLE_KITS, PHOTO_REPORTING_FEE } from '@/lib/serviceTypes';
import { getAppBaseUrl } from '@/lib/appUrl';

export default function QuoteViewPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [tcsAccepted, setTcsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await (supabase as any)
        .from('quotes')
        .select('*')
        .eq('quote_token', token)
        .single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      if (data.quote_accepted_at) setAccepted(true);
      if (data.quote_declined_at) setDeclined(true);
      setQuote(data);
      setLoading(false);
    }
    load();
  }, [token]);

  const handleAccept = async () => {
    if (!quote || !tcsAccepted) return;
    setConfirming(true);
    try {
      // Update quote
      await (supabase as any).from('quotes').update({
        status: 'accepted',
        quote_accepted_at: new Date().toISOString(),
        tcs_accepted: true,
        tcs_accepted_at: new Date().toISOString(),
        acceptance_method: 'client_portal',
      }).eq('quote_token', token);

      // Create job
      const { data: jobData, error: jobErr } = await supabase.from('jobs').insert({
        scheduled_date: new Date().toISOString().split('T')[0],
        status: 'awaiting_quote',
        price_ex_gst: quote.sell_price_ex_gst,
        price_inc_gst: quote.sell_price_inc_gst,
        property_id: quote.property_id || null,
        linked_quote_id: quote.id,
        notes: `Quote accepted by ${quote.client_name || 'client'}\n${quote.clean_type || ''}\n${quote.property_address || ''}`.trim(),
        source: 'quote_accepted',
      }).select('id').single();
      if (jobErr) throw jobErr;

      // Notify admin
      try {
        await supabase.functions.invoke('send-quote-notification', {
          body: {
            type: 'quote_accepted',
            client_name: quote.client_name,
            clean_type: quote.clean_type,
            address: quote.property_address,
            job_id: jobData?.id,
          },
        });
      } catch { /* non-blocking */ }

      setAccepted(true);
    } catch (e: any) {
      toast.error(e.message || 'Failed to accept quote');
    }
    setConfirming(false);
  };

  const handleDecline = async () => {
    if (!quote) return;
    setDeclining(true);
    try {
      await (supabase as any).from('quotes').update({
        status: 'declined',
        quote_declined_at: new Date().toISOString(),
      }).eq('quote_token', token);

      // Notify admin
      try {
        await supabase.functions.invoke('send-quote-notification', {
          body: {
            type: 'quote_declined',
            client_name: quote.client_name,
            clean_type: quote.clean_type,
          },
        });
      } catch { /* non-blocking */ }

      setDeclined(true);
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    }
    setDeclining(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 animate-spin text-[#0C463D]" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0C463D] p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Quote Not Found</h1>
      <p className="text-white/70">This quote link is invalid or has expired.</p>
      <p className="text-white/50 text-sm mt-4">📞 0418 878 707</p>
    </div>
  );

  if (declined) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
      <XCircle className="w-16 h-16 text-muted-foreground mb-4" />
      <h1 className="text-2xl font-bold text-foreground mb-2">Quote Declined</h1>
      <p className="text-muted-foreground text-center max-w-md">
        No problem. Feel free to reach out if you'd like to reschedule.
      </p>
      <p className="text-muted-foreground font-bold mt-4">📞 0418 878 707</p>
    </div>
  );

  if (accepted) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
      <CheckCircle2 className="w-20 h-20 text-[#0C463D] mb-4" />
      <h1 className="text-2xl font-bold text-[#0C463D] mb-2">Booking request received! ✓</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Brendan will confirm your date and cleaner shortly. You'll receive a text when it's locked in.
      </p>
      <p className="text-[#0C463D] font-bold mt-6">— Brightly Cleaning 🌿</p>
    </div>
  );

  // Format dates
  const issuedDate = quote.created_at ? format(new Date(quote.created_at), 'd MMMM yyyy') : 'N/A';
  const validUntil = quote.created_at
    ? format(new Date(new Date(quote.created_at).getTime() + 48 * 60 * 60 * 1000), 'd MMMM yyyy, h:mm a')
    : '48 hours';
  const ref = quote.reference || `BCQ-${new Date().getFullYear()}-001`;

  // Build line items
  const lineItems: { label: string; detail: string; amount: number }[] = [];
  const cs = quote.consumables_selection && typeof quote.consumables_selection === 'object' ? quote.consumables_selection : {};

  // Labour
  if (quote.labour_cost && quote.labour_cost > 0) {
    const hrs = quote.hours || 0;
    lineItems.push({
      label: 'Labour',
      detail: hrs > 0 ? `${hrs} hrs` : '',
      amount: Number(quote.labour_cost),
    });
  }

  // Linen
  if (quote.linen_cost && quote.linen_cost > 0) {
    lineItems.push({
      label: 'Linen Pack',
      detail: `${quote.bedrooms || 0} bed${(quote.bedrooms || 0) !== 1 ? 's' : ''}`,
      amount: Number(quote.linen_cost),
    });
  }

  // Consumable kits from consumables_selection
  CONSUMABLE_KITS.forEach(kit => {
    if (cs[kit.key] === true) {
      lineItems.push({ label: kit.name, detail: '', amount: kit.price });
    }
  });

  // Photo report from consumables_selection
  if (cs.include_photo_report === true) {
    lineItems.push({ label: 'Photo Reporting', detail: 'Per clean', amount: PHOTO_REPORTING_FEE });
  }

  const subtotalExGst = Number(quote.sell_price_ex_gst || 0);
  const gst = Number(quote.gst || 0);
  const totalIncGst = Number(quote.sell_price_inc_gst || 0);

  return (
    <div className="min-h-screen bg-[#f5f5f3]">
      {/* Header bar */}
      <div className="bg-[#0C463D] text-white">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold tracking-tight">
              Brightly<span className="text-[#FEDB00]">.</span>
            </span>
          </div>
          <span className="text-xs font-semibold text-white/60">QUOTE</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Quote header */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-[#0C463D]">QUOTE</h1>
              <p className="text-sm font-mono text-muted-foreground mt-1">{ref}</p>
            </div>
            <div className="text-right text-sm text-muted-foreground space-y-1">
              <p>Date issued: <strong className="text-foreground">{issuedDate}</strong></p>
              <p>Valid for 48 hours</p>
            </div>
          </div>

          <div className="border-t pt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Prepared for</p>
              <p className="font-semibold text-foreground">{quote.client_name || 'Client'}</p>
              {quote.client_phone && <p className="text-muted-foreground">{quote.client_phone}</p>}
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Property</p>
              <p className="font-semibold text-foreground">{quote.property_name || quote.property_address || '—'}</p>
              {quote.property_address && quote.property_name && (
                <p className="text-muted-foreground">{quote.property_address}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Clean type</p>
              <p className="font-semibold text-foreground">{quote.clean_type || quote.service_type || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Rooms</p>
              <p className="font-semibold text-foreground">
                {quote.bedrooms || 0} bed · {quote.bathrooms || 0} bath
                {quote.sofa_beds > 0 && ` · ${quote.sofa_beds} sofa bed${quote.sofa_beds > 1 ? 's' : ''}`}
                {quote.balconies > 0 && ` · ${quote.balconies} balcon${quote.balconies > 1 ? 'ies' : 'y'}`}
              </p>
              {quote.outdoor_areas && <p className="text-muted-foreground">+ Outdoor areas</p>}
            </div>
          </div>

          {/* Bed Types */}
          {Array.isArray(quote.bed_types) && quote.bed_types.length > 0 && (
            <div className="text-sm">
              <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Bed Configuration</p>
              <div className="flex flex-wrap gap-2">
                {(quote.bed_types as string[]).map((bt, i) => (
                  <span key={i} className="bg-[#0C463D]/5 px-2 py-1 rounded text-xs font-semibold">
                    Bed {i + 1}: {bt}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Line items table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0C463D]/5 border-b">
                <th className="text-left px-6 py-3 font-bold text-[#0C463D]">Description</th>
                <th className="text-right px-6 py-3 font-bold text-[#0C463D]">Detail</th>
                <th className="text-right px-6 py-3 font-bold text-[#0C463D]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-6 py-3 font-semibold text-foreground">{item.label}</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{item.detail}</td>
                  <td className="px-6 py-3 text-right font-semibold text-foreground">${item.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td colSpan={2} className="px-6 py-2 text-right text-sm text-muted-foreground">Subtotal ex GST</td>
                <td className="px-6 py-2 text-right font-semibold">${subtotalExGst.toFixed(2)}</td>
              </tr>
              <tr>
                <td colSpan={2} className="px-6 py-2 text-right text-sm text-muted-foreground">GST (10%)</td>
                <td className="px-6 py-2 text-right font-semibold">${gst.toFixed(2)}</td>
              </tr>
              <tr className="bg-[#0C463D]/5">
                <td colSpan={2} className="px-6 py-4 text-right text-lg font-extrabold text-[#0C463D]">TOTAL inc GST</td>
                <td className="px-6 py-4 text-right text-2xl font-extrabold text-[#0C463D]">${totalIncGst.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* T&Cs + Actions */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="tcs"
              checked={tcsAccepted}
              onCheckedChange={(v) => setTcsAccepted(v === true)}
              className="mt-0.5"
            />
            <label htmlFor="tcs" className="text-sm text-muted-foreground cursor-pointer">
              I have read and agree to{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setTermsOpen(true); }}
                className="text-[#0C463D] font-bold underline"
              >
                Brightly Cleaning's Terms & Conditions
              </button>
            </label>
          </div>

          <Button
            onClick={handleAccept}
            disabled={!tcsAccepted || confirming}
            className="w-full h-14 rounded-2xl text-lg font-extrabold bg-[#0C463D] hover:bg-[#0C463D]/90 text-white"
          >
            {confirming ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
            ACCEPT QUOTE
          </Button>

          <button
            onClick={handleDecline}
            disabled={declining}
            className="w-full text-center text-sm font-semibold text-muted-foreground hover:text-destructive transition-colors py-2"
          >
            {declining ? 'Declining...' : 'Decline this quote'}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-8 space-y-1">
          <p className="font-semibold">Brightly Cleaning</p>
          <p>brendan@brightly.cleaning | 0418 878 707</p>
          <p>Quote valid for 48 hours</p>
        </div>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
