import { useState } from 'react';
import { usePricingSettings, useUpdatePricingSetting } from '@/hooks/usePricingSettings';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  labour: 'Labour',
  linen: 'Linen Rates (per item)',
  other: 'Other Settings',
};

export default function RateSettings() {
  const { data, isLoading } = usePricingSettings();
  const updateMut = useUpdatePricingSetting();
  const [edits, setEdits] = useState<Record<string, string>>({});

  if (isLoading || !data) return <p className="text-muted-foreground p-4">Loading rates…</p>;

  const grouped: Record<string, typeof data.rows> = {};
  data.rows.forEach((r) => {
    const cat = r.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  });

  const handleSave = async (row: typeof data.rows[0]) => {
    const val = edits[row.id];
    if (val === undefined) return;
    const num = parseFloat(val);
    if (isNaN(num)) { toast.error('Invalid number'); return; }
    try {
      await updateMut.mutateAsync({ id: row.id, value: num });
      toast.success(`Updated ${row.label || row.key}`);
      setEdits((p) => { const n = { ...p }; delete n[row.id]; return n; });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-yellow-50 border border-yellow-300 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-sm font-semibold text-yellow-800">
          Changing rates here affects all new quotes. Existing saved quotes are not updated.
        </p>
      </div>

      {['labour', 'linen', 'other'].map((cat) => (
        <div key={cat} className="bg-card rounded-2xl shadow-md p-5 space-y-3">
          <h3 className="font-extrabold text-foreground text-lg">{CATEGORY_LABELS[cat]}</h3>
          <div className="space-y-2">
            {(grouped[cat] || []).map((row) => {
              const edited = edits[row.id] !== undefined;
              const displayVal = edited ? edits[row.id] : String(row.value);
              const isPercent = row.key === 'default_gp_percent';
              return (
                <div key={row.id} className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">
                    {row.label || row.key}
                  </span>
                  <div className="flex items-center gap-2">
                    {!isPercent && <span className="text-muted-foreground text-sm">$</span>}
                    <input
                      type="number"
                      step={isPercent ? '0.01' : '0.01'}
                      value={displayVal}
                      onChange={(e) => setEdits((p) => ({ ...p, [row.id]: e.target.value }))}
                      className="w-24 h-10 rounded-xl border border-input bg-background px-3 text-sm text-right font-semibold"
                    />
                    {isPercent && <span className="text-muted-foreground text-sm">(%)</span>}
                    {edited && (
                      <Button size="sm" onClick={() => handleSave(row)} disabled={updateMut.isPending}>
                        Save
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
