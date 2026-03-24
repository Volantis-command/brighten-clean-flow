import { useState } from 'react';
import { usePricingSettings, useUpdatePricingSetting } from '@/hooks/usePricingSettings';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, Save, Loader2 } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

type RowDef = {
  key: string;
  label: string;
  prefix?: string;
  suffix?: string;
  readOnly?: boolean;
  step?: string;
};

const SECTIONS: { id: string; title: string; rows: RowDef[] }[] = [
  {
    id: 'labour',
    title: 'Labour',
    rows: [
      { key: 'cleaner_hourly_rate', label: 'Standard Hourly Rate', prefix: '$', step: '0.50' },
      { key: 'photo_reporting_fee', label: 'Photo Reporting Fee', prefix: '$', step: '1' },
      { key: 'residential_hourly_rate', label: 'Residential Hourly Rate', prefix: '$', step: '0.50' },
      { key: 'deep_clean_multiplier', label: 'Deep Clean Multiplier', suffix: '×', step: '0.1' },
    ],
  },
  {
    id: 'linen',
    title: 'Linen Rates (per item)',
    rows: [
      { key: 'linen_king_flat_sheet', label: 'King Flat Sheet', prefix: '$' },
      { key: 'linen_queen_flat_sheet', label: 'Queen/Double Flat Sheet', prefix: '$' },
      { key: 'linen_king_single_flat_sheet', label: 'King Single Flat Sheet', prefix: '$' },
      { key: 'linen_pillowcase', label: 'Pillowcase', prefix: '$' },
      { key: 'linen_bath_towel', label: 'Bath Towel', prefix: '$' },
      { key: 'linen_hand_towel', label: 'Hand Towel', prefix: '$' },
      { key: 'linen_face_washer', label: 'Face Washer', prefix: '$' },
      { key: 'linen_bath_mat', label: 'Bath Mat', prefix: '$' },
      { key: 'linen_tea_towel', label: 'Tea Towel', prefix: '$' },
      { key: 'linen_bag', label: 'Linen Bag', prefix: '$' },
    ],
  },
  {
    id: 'other',
    title: 'Other Settings',
    rows: [
      { key: 'default_gp_percent', label: 'Default GP %', suffix: '(decimal, e.g. 0.40 = 40%)', step: '0.01' },
      { key: 'gst_rate', label: 'GST Rate', suffix: '(10%)', readOnly: true },
      { key: 'consumable_amenities_kit', label: 'Amenities Kit', prefix: '$', step: '0.50' },
      { key: 'consumable_wash_kit', label: 'Wash Kit', prefix: '$', step: '0.50' },
      { key: 'consumable_tea_coffee_kit', label: 'Tea/Coffee Kit', prefix: '$', step: '0.50' },
    ],
  },
];

export default function RateSettings() {
  const { data, isLoading } = usePricingSettings();
  const updateMut = useUpdatePricingSetting();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (isLoading || !data) return <p className="text-muted-foreground p-4">Loading rates…</p>;

  const getVal = (key: string): string => {
    if (edits[key] !== undefined) return edits[key];
    if (key === 'gst_rate') return '0.10';
    return data.map[key] !== undefined ? String(data.map[key]) : '';
  };

  const getRowId = (key: string): string | null => {
    const row = data.rows.find((r) => r.key === key);
    return row?.id ?? null;
  };

  const isDirty = Object.keys(edits).length > 0;

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      for (const [key, val] of Object.entries(edits)) {
        if (key === 'gst_rate') continue;
        const num = parseFloat(val);
        if (isNaN(num)) { toast.error(`Invalid number for ${key}`); setSaving(false); return; }
        const id = getRowId(key);
        if (!id) continue;
        await updateMut.mutateAsync({ id, value: num });
      }
      setEdits({});
      toast.success('Rate settings saved');
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-yellow-50 border border-yellow-300 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-sm font-semibold text-yellow-800">
          Changing rates here affects all new quotes. Existing saved quotes are not updated.
        </p>
      </div>

      <Accordion type="multiple" defaultValue={['labour', 'linen', 'other']}>
        {SECTIONS.map((section) => (
          <AccordionItem key={section.id} value={section.id} className="bg-card rounded-2xl shadow-md mb-3 border-none">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <span className="font-extrabold text-foreground text-lg">{section.title}</span>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <div className="space-y-3">
                {section.rows.map((rowDef) => {
                  const val = getVal(rowDef.key);
                  return (
                    <div key={rowDef.key} className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">
                        {rowDef.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {rowDef.prefix && <span className="text-muted-foreground text-sm">{rowDef.prefix}</span>}
                        <input
                          type="number"
                          step={rowDef.step || '0.01'}
                          value={val}
                          readOnly={rowDef.readOnly}
                          onChange={(e) => {
                            if (rowDef.readOnly) return;
                            setEdits((p) => ({ ...p, [rowDef.key]: e.target.value }));
                          }}
                          className="w-24 h-10 rounded-xl border border-input bg-background px-3 text-sm text-right font-semibold disabled:opacity-50"
                          disabled={rowDef.readOnly}
                        />
                        {rowDef.suffix && <span className="text-muted-foreground text-xs">{rowDef.suffix}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Button
        onClick={handleSaveAll}
        disabled={!isDirty || saving}
        className="w-full bg-primary text-primary-foreground font-bold rounded-xl gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Rate Settings
      </Button>
    </div>
  );
}
