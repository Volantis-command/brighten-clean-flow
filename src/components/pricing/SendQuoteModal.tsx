import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { getAppBaseUrl } from '@/lib/appUrl';
import { toast } from 'sonner';
import { Loader2, Send, Copy, Link2 } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  quote: any;
  onSent?: () => void;
};

export default function SendQuoteModal({ open, onClose, quote, onSent }: Props) {
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
      // Update quote with client info and status
      await (supabase as any).from('quotes').update({
        client_name: clientName || quote.client_name,
        client_phone: clientPhone,
        status: 'sent',
        quote_sent_at: new Date().toISOString(),
      }).eq('id', quote.id);

      // Send SMS via edge function
      const res = await supabase.functions.invoke('send-quote-notification', {
        body: {
          type: 'send_quote_sms',
          to: clientPhone,
          first_name: (clientName || quote.client_name || 'there').split(' ')[0],
          quote_url: quoteUrl,
        },
      });

      if (res.error) throw res.error;

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
          <DialogTitle className="text-xl font-extrabold text-[#0C463D]">Send Quote</DialogTitle>
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

          <p className="text-xs text-muted-foreground">
            SMS: "Hi [name], your Brightly Cleaning quote is ready. View and accept here: [url]. Valid for 48 hours."
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleCopyLink} className="gap-2">
            <Copy className="w-4 h-4" /> Copy Link
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2 bg-[#0C463D] hover:bg-[#0C463D]/90">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send via SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
