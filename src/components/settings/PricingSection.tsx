import RateSettings from '@/components/pricing/RateSettings';
import { usePricingSettings, useUpdatePricingSetting } from '@/hooks/usePricingSettings';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

const EXTRA_KEYS = [
  { key: 'travel_zone_1_max_km', label: 'Zone 1 Max KM (free zone)', suffix: 'km' },
  { key: 'travel_zone_1_fee', label: 'Zone 1 Fee', prefix: '$' },
  { key: 'travel_zone_2_max_km', label: 'Zone 2 Max KM', suffix: 'km' },
  { key: 'travel_zone_2_fee', label: 'Zone 2 Fee', prefix: '$' },
  { key: 'travel_zone_3_fee', label: 'Zone 3 Fee (35km+)', prefix: '$' },
  { key: 'multi_property_discount_pct', label: 'Multi-Property Discount', suffix: '%' },
  { key: 'min_callout_hours', label: 'Minimum Call-Out Hours', suffix: 'hrs' },
  { key: 'client_quote_gp_pct', label: 'Client Self-Quote GP', suffix: '%' },
  { key: 'admin_gp_pct', label: 'Admin GP', suffix: '%' },
];

export default function PricingSection() {
  const { data, isLoading } = usePricingSettings();
  const updateMut = useUpdatePricingSetting();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const getVal = (key: string) => {
    if (edits[key] !== undefined) return edits[key];
    if (data?.map[key] !== undefined) return String(data.map[key]);
    return '';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, val] of Object.entries(edits)) {
        const num = parseFloat(val);
        if (isNaN(num)) { toast.error(`Invalid number for ${key}`); setSaving(false); return; }
        const row = data?.rows.find((r) => r.key === key);
        if (row) {
          await updateMut.mutateAsync({ id: row.id, value: num });
        }
      }
      setEdits({});
      toast.success('Pricing settings saved');
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-bold text-primary">Pricing & Rates</h2>

      <RateSettings />

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-5">
        <h3 className="font-bold text-foreground text-base">Travel Zones & GP Settings</h3>
        <p className="text-xs text-muted-foreground">Configure travel surcharges, discounts, and gross profit margins.</p>

        <div className="space-y-3">
          {EXTRA_KEYS.map((def) => (
            <div key={def.key} className="flex items-center gap-3">
              <span className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">{def.label}</span>
              <div className="flex items-center gap-2">
                {def.prefix && <span className="text-muted-foreground text-sm">{def.prefix}</span>}
                <input
                  type="number"
                  step="0.01"
                  value={getVal(def.key)}
                  onChange={(e) => setEdits((p) => ({ ...p, [def.key]: e.target.value }))}
                  className="w-24 h-10 rounded-xl border border-input bg-background px-3 text-sm text-right font-semibold"
                />
                {def.suffix && <span className="text-muted-foreground text-xs">{def.suffix}</span>}
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={handleSave}
          disabled={Object.keys(edits).length === 0 || saving}
          className="w-full bg-primary text-primary-foreground font-bold rounded-xl gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Pricing Settings
        </Button>
      </div>
    </div>
  );
}
