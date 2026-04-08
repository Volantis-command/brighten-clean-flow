import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function BusinessSection() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['business-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_settings' as any)
        .select('key, value');
      if (error) throw error;
      const map: Record<string, string> = {};
      ((data as any[]) || []).forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const [key, value] of Object.entries(form)) {
        await (supabase.from('business_settings' as any) as any)
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', key);
      }
    },
    onSuccess: () => {
      toast.success('Business settings saved');
      queryClient.invalidateQueries({ queryKey: ['business-settings'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-primary">Business Details</h2>

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-5">
        <div>
          <Label>Business Name</Label>
          <Input value={form.business_name || ''} onChange={(e) => update('business_name', e.target.value)} placeholder="Brightly Cleaning Co" />
        </div>
        <div>
          <Label>ABN</Label>
          <Input value={form.abn || ''} onChange={(e) => update('abn', e.target.value)} placeholder="12 345 678 901" />
        </div>
        <div>
          <Label>Business Address</Label>
          <Input value={form.business_address || ''} onChange={(e) => update('business_address', e.target.value)} placeholder="123 Main St, Brisbane QLD 4000" />
        </div>
        <div>
          <Label>Business Phone</Label>
          <Input value={form.business_phone || ''} onChange={(e) => update('business_phone', e.target.value)} placeholder="07 1234 5678" />
        </div>
        <div>
          <Label>Business Email</Label>
          <Input type="email" value={form.business_email || ''} onChange={(e) => update('business_email', e.target.value)} placeholder="hello@brightly.cleaning" />
        </div>
        <div>
          <Label>Logo URL</Label>
          <Input value={form.logo_url || ''} onChange={(e) => update('logo_url', e.target.value)} placeholder="https://..." />
          {form.logo_url && (
            <img src={form.logo_url} alt="Logo preview" className="mt-2 h-12 object-contain rounded-lg bg-secondary p-1" />
          )}
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="bg-primary text-primary-foreground font-bold rounded-xl gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Business Details
        </Button>
      </div>
    </div>
  );
}
