import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_TERMS } from '@/components/quote/TermsModal';

export default function LegalSection() {
  const [terms, setTerms] = useState('');
  const [version, setVersion] = useState('v1.0');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['terms_and_conditions', 'tcs_version']);

      const map = Object.fromEntries((data || []).map(d => [d.key, d.value]));
      setTerms(map['terms_and_conditions'] || DEFAULT_TERMS);
      setVersion(map['tcs_version'] || 'v1.0');
      setLoading(false);
    }
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      for (const [key, value] of [['terms_and_conditions', terms], ['tcs_version', version]]) {
        const { data: existing } = await supabase
          .from('app_settings')
          .select('id')
          .eq('key', key)
          .maybeSingle();

        if (existing) {
          await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
        } else {
          await supabase.from('app_settings').insert({ key, value });
        }
      }
      toast.success('Terms & Conditions saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-2xl shadow-md p-6 space-y-4">
        <h3 className="font-bold text-lg text-foreground">Terms & Conditions</h3>
        <p className="text-sm text-muted-foreground">
          These terms are shown to clients when they accept a quote. Update the version number when you make changes.
        </p>

        <div className="max-w-xs">
          <Label className="text-xs font-semibold">Version</Label>
          <Input value={version} onChange={e => setVersion(e.target.value)} className="h-10 rounded-xl" placeholder="e.g. v1.0" />
        </div>

        <div>
          <Label className="text-xs font-semibold">Terms Text</Label>
          <Textarea
            value={terms}
            onChange={e => setTerms(e.target.value)}
            className="rounded-xl min-h-[400px] font-mono text-sm"
          />
        </div>

        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Terms
        </Button>
      </div>
    </div>
  );
}
