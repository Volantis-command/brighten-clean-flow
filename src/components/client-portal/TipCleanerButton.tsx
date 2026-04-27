import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface TipCleanerButtonProps {
  token: string;
  jobId: string;
  cleanerName: string | null;
}

const PRESETS = [500, 1000, 2000]; // cents — $5 / $10 / $20

export default function TipCleanerButton({ token, jobId, cleanerName }: TipCleanerButtonProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | 'custom' | null>(null);
  const [custom, setCustom] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const friendlyName = cleanerName || 'your cleaner';

  const checkout = async () => {
    let cents: number | null = null;
    if (selected === 'custom') {
      const n = Number(custom);
      if (Number.isFinite(n) && n >= 1 && n <= 500) cents = Math.round(n * 100);
    } else if (typeof selected === 'number') {
      cents = selected;
    }
    if (!cents) {
      toast.error('Pick an amount');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-tip-checkout', {
        body: {
          token,
          job_id: jobId,
          amount_cents: cents,
          success_url: window.location.href,
          cancel_url: window.location.href,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.checkout_url;
      if (url) window.location.href = url;
    } catch (e: any) {
      toast.error(e.message || 'Could not start tip — try again.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-pink-300 text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-500/10"
        onClick={() => setOpen(true)}
      >
        <Heart className="w-4 h-4" /> Tip {friendlyName.split(' ')[0]}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
        <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-500" /> Tip {friendlyName}
            </DialogTitle>
            <DialogDescription>
              100% goes to the cleaner. Secure payment via Stripe.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelected(c)}
                className={`rounded-xl border-2 p-4 text-center transition-all ${
                  selected === c ? 'border-pink-500 bg-pink-50 dark:bg-pink-500/10 text-pink-700' : 'border-border hover:border-pink-300'
                }`}
              >
                <p className="text-xl font-extrabold">${c / 100}</p>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSelected('custom')}
            className={`rounded-xl border-2 p-3 text-left transition-all ${
              selected === 'custom' ? 'border-pink-500 bg-pink-50 dark:bg-pink-500/10' : 'border-border hover:border-pink-300'
            }`}
          >
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Other amount (AUD)</p>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-foreground">$</span>
              <Input
                type="number"
                min={1}
                max={500}
                value={custom}
                onChange={(e) => { setSelected('custom'); setCustom(e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                placeholder="0.00"
                className="h-9"
              />
            </div>
          </button>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={checkout} disabled={submitting || selected === null} className="gap-1 bg-pink-600 hover:bg-pink-700">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
              Continue to payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
