import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SendQuoteLinkModal({ open, onOpenChange }: Props) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      toast.error('Please enter a phone number');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-quote-link-sms', {
        body: { phone: trimmed, form_type: 'residential' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Quote link sent!');
      setPhone('');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send SMS');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send SMS Quote Link</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Phone Number</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0412 345 678"
              type="tel"
            />
          </div>
          <Button onClick={handleSend} disabled={sending} className="w-full gap-2 rounded-xl font-bold">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Quote Link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
