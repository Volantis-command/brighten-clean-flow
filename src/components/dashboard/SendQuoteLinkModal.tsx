import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Home, Palmtree, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type FormType = 'residential' | 'airbnb' | null;

export function SendQuoteLinkModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [phone, setPhone] = useState('');
  const [formType, setFormType] = useState<FormType>(null);
  const [sending, setSending] = useState(false);

  const canSend = phone.trim().length >= 8 && formType;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-quote-link-sms', {
        body: { phone: phone.trim(), form_type: formType },
      });
      if (error) throw error;
      toast.success('Quote link sent!');
      setPhone('');
      setFormType(null);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send SMS');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">Send Quote Link</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground">Client mobile number</label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="04xx xxx xxx"
              type="tel"
              inputMode="tel"
              className="h-12 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground">Form type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormType('residential')}
                className={cn(
                  'rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all min-h-[80px]',
                  formType === 'residential'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:border-primary/40'
                )}
              >
                <Home className="w-6 h-6" />
                <span className="text-sm font-bold text-center leading-tight">Residential Clean</span>
              </button>
              <button
                type="button"
                onClick={() => setFormType('airbnb')}
                className={cn(
                  'rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all min-h-[80px]',
                  formType === 'airbnb'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:border-primary/40'
                )}
              >
                <Palmtree className="w-6 h-6" />
                <span className="text-sm font-bold text-center leading-tight">Airbnb / Short Stay</span>
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl h-12" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-xl h-12 font-bold"
              style={{ backgroundColor: '#FEDB00', color: '#0C463D' }}
              onClick={handleSend}
              disabled={!canSend || sending}
            >
              {sending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Send Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
