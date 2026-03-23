import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentsSection() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['app-settings-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['deposit_type', 'deposit_amount', 'deposit_label', 'stripe_publishable_key']);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((r) => { map[r.key] = r.value; });
      return map;
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    const entries = Object.entries(form);
    for (const [key, value] of entries) {
      const { error } = await supabase
        .from('app_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key);
      if (error) {
        // If row doesn't exist, insert it
        await supabase.from('app_settings').insert({ key, value });
      }
    }
    toast.success('Payment settings saved');
    queryClient.invalidateQueries({ queryKey: ['app-settings-payments'] });
    setSaving(false);
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Payment & Deposits
        </h2>
        <p className="text-sm text-muted-foreground">Configure Stripe and deposit collection for quote acceptance.</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-5">
        <div>
          <Label className="text-sm font-semibold">Stripe Publishable Key</Label>
          <Input
            value={form.stripe_publishable_key || ''}
            onChange={(e) => update('stripe_publishable_key', e.target.value)}
            placeholder="pk_live_... or pk_test_..."
            className="mt-1 font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground mt-1">Your Stripe publishable key (starts with pk_)</p>
        </div>

        <div>
          <Label className="text-sm font-semibold">Deposit Type</Label>
          <Select value={form.deposit_type || 'fixed'} onValueChange={(v) => update('deposit_type', v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-semibold">
            Deposit Amount {form.deposit_type === 'percentage' ? '(%)' : '($)'}
          </Label>
          <Input
            type="number"
            min="0"
            step={form.deposit_type === 'percentage' ? '1' : '0.01'}
            value={form.deposit_amount || '50'}
            onChange={(e) => update('deposit_amount', e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-sm font-semibold">Deposit Label (shown to client)</Label>
          <Input
            value={form.deposit_label || 'Booking deposit (deducted from final invoice)'}
            onChange={(e) => update('deposit_label', e.target.value)}
            className="mt-1"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-primary-foreground font-bold rounded-xl gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Payment Settings
        </Button>
      </div>
    </div>
  );
}
