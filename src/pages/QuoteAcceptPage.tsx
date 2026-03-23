import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function QuoteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
      setLoading(false);
    }
    load();
  }, [token]);

  const handleConfirm = async () => {
    if (!quote) return;
    setConfirming(true);
    try {
      // Update quote_requests status
      await supabase.from('quote_requests').update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      }).eq('token', token);

      // Create a job
      await supabase.from('jobs').insert({
        scheduled_date: quote.preferred_date || new Date().toISOString().split('T')[0],
        scheduled_time: quote.preferred_time?.includes('Morning') ? '08:00' : quote.preferred_time?.includes('Afternoon') ? '13:00' : null,
        status: 'scheduled',
        price_ex_gst: quote.total_ex_gst,
        price_inc_gst: quote.total_inc_gst,
        notes: `Residential quote from ${quote.first_name} ${quote.last_name || ''}\n${quote.clean_type}\n${quote.address}\n${quote.extra_notes || ''}`.trim(),
      });

      // Notify admin
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
          </div>
        </div>

        <Button onClick={handleConfirm} disabled={confirming} className="w-full h-14 rounded-2xl text-lg font-bold bg-[#0C463D] hover:bg-[#0C463D]/90 text-white">
          {confirming ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
          Confirm Booking
        </Button>

        <p className="text-center text-xs text-gray-400 pb-4">Powered by Brightly</p>
      </div>
    </div>
  );
}
