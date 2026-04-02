import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { getAppBaseUrl } from '@/lib/appUrl';

const BASE_URL = getAppBaseUrl();

export default function SendQuoteRequestModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const sendMutation = useMutation({
    mutationFn: async () => {
      const link = `${BASE_URL}/quote`;

      // Send SMS with direct link to intake form
      await supabase.functions.invoke('send-quote-notification', {
        body: {
          type: 'send_link',
          to: phone,
          first_name: firstName,
          link,
        },
      });
    },
    onSuccess: () => {
      toast.success(`Quote request sent to ${phone} ✓`);
      queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      onOpenChange(false);
      setFirstName(''); setPhone(''); setEmail('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Send Quote Request</DialogTitle>
          <DialogDescription>Send a quote request form link to a potential client via SMS.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>First Name *</Label>
            <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" className="h-12 rounded-xl" />
          </div>
          <div>
            <Label>Mobile Number *</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0412 345 678" className="h-12 rounded-xl" />
          </div>
          <div>
            <Label>Email (optional)</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" className="h-12 rounded-xl" />
          </div>
          <div className="bg-muted rounded-xl p-3 text-sm">
            <p className="text-muted-foreground text-xs mb-1 font-semibold">SMS Preview:</p>
            <p className="text-foreground text-xs">Hi {firstName || '[name]'}, thanks for reaching out to Brightly Cleaning! Fill out your clean details here and we'll get a quote back to you ASAP: {BASE_URL}/quote/...</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!firstName || !phone || sendMutation.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold gap-2"
          >
            {sendMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Send className="w-4 h-4" /> Send SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
