import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { getAppBaseUrl } from '@/lib/appUrl';
import { toast } from 'sonner';
import { Loader2, Send, Copy, Link2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type Props = {
  open: boolean;
  onClose: () => void;
  quote: any;
  onSent?: () => void;
};

export default function SendQuoteModal({ open, onClose, quote, onSent }: Props) {
  const { user } = useAuth();
  const [clientName, setClientName] = useState(quote?.client_name || '');
  const [clientPhone, setClientPhone] = useState(quote?.client_phone || '');
  const [sending, setSending] = useState(false);

  const quoteToken = quote?.quote_token;
  const quoteUrl = quoteToken ? `${getAppBaseUrl()}/quote-view/${quoteToken}` : '';

  const handleSend = async () => {
    if (!clientPhone.trim()) { toast.error('Enter a mobile number'); return; }
    if (!quoteToken) { toast.error('Quote has no token'); return; }

    setSending(true);
    try {
      // 1. Update quote status to 'quote_sent'
      await (supabase as any).from('quotes').update({
        client_name: clientName || quote.client_name,
        client_phone: clientPhone,
        status: 'quote_sent',
        quote_sent_at: new Date().toISOString(),
      }).eq('id', quote.id);

      // 2. Send detailed SMS via edge function
      const firstName = (clientName || quote.client_name || 'there').split(' ')[0];
      const res = await supabase.functions.invoke('send-quote-notification', {
        body: {
          type: 'send_quote_detail_sms',
          to: clientPhone,
          first_name: firstName,
          property_address: quote.property_address || quote.property_name || '',
          clean_type: quote.clean_type || quote.service_type || 'Clean',
          bedrooms: quote.bedrooms || 0,
          bathrooms: quote.bathrooms || 0,
          total_inc_gst: quote.sell_price_inc_gst || quote.price || 0,
        },
      });

      if (res.error) throw res.error;

      // 3. Create admin notification for tracking
      if (user?.id) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          type: 'quote_sent',
          title: 'Quote sent — awaiting response',
          message: `Quote sent to ${clientName || 'client'} · ${quote.property_address || quote.property_name || ''}`,
          link: '/quoting',
        });
      }

      toast.success(`Quote sent to ${clientName || 'client'} ✓`);
      onSent?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send quote');
    }
    setSending(false);
  };

  const handleCopyLink = () => {
    if (!quoteUrl) { toast.error('No quote link available'); return; }
    navigator.clipboard.writeText(quoteUrl);
    toast.success('Quote link copied!');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-primary">Send Quote</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Client Name</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" />
          </div>
          <div>
            <Label>Mobile Number</Label>
            <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="0418 878 707" />
          </div>

          {quoteUrl && (
            <div className="bg-muted rounded-xl p-3">
              <p className="text-xs font-bold text-muted-foreground mb-1 flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Quote Link
              </p>
              <p className="text-xs break-all text-foreground font-mono">{quoteUrl}</p>
            </div>
          )}

          <div className="bg-muted/50 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-bold text-foreground">SMS Preview:</p>
            <p>Hi {(clientName || 'there').split(' ')[0]}, here's your quote from Brightly Cleaning ✨</p>
            <p>📍 {quote?.property_address || quote?.property_name || '[Address]'}</p>
            <p>🧹 {quote?.clean_type || quote?.service_type || '[Clean Type]'}</p>
            <p>🛏 {quote?.bedrooms || 0} bed · {quote?.bathrooms || 0} bath</p>
            <p>💰 Estimated total: ${Number(quote?.sell_price_inc_gst || quote?.price || 0).toFixed(2)}</p>
            <p>Reply YES to accept or NO to decline.</p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleCopyLink} className="gap-2">
            <Copy className="w-4 h-4" /> Copy Link
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2 bg-primary hover:bg-primary/90">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send via SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
