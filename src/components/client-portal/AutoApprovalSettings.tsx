import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface AutoApprovalSettingsProps {
  token: string;
  propertyId: string;
  property: any;
}

export default function AutoApprovalSettings({ token, propertyId, property }: AutoApprovalSettingsProps) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState<boolean>(!!property?.auto_confirm_turnovers);
  const [minHours, setMinHours] = useState<number>(property?.auto_confirm_min_hours ?? 0);
  const [maxPerDay, setMaxPerDay] = useState<number | ''>(property?.auto_confirm_max_per_day ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(!!property?.auto_confirm_turnovers);
    setMinHours(property?.auto_confirm_min_hours ?? 0);
    setMaxPerDay(property?.auto_confirm_max_per_day ?? '');
  }, [property?.auto_confirm_turnovers, property?.auto_confirm_min_hours, property?.auto_confirm_max_per_day]);

  // Only relevant for Airbnb / iCal-synced properties.
  const isApplicable = property?.client_type === 'airbnb' || !!property?.hostaway_listing_id || !!property?.ical_url;
  if (!isApplicable) return null;

  const save = async (overrides: Partial<{ enabled: boolean; minHours: number; maxPerDay: number | null }> = {}) => {
    const updates: Record<string, any> = {
      auto_confirm_turnovers: overrides.enabled ?? enabled,
      auto_confirm_min_hours: overrides.minHours ?? minHours,
      auto_confirm_max_per_day: overrides.maxPerDay !== undefined ? overrides.maxPerDay : (maxPerDay === '' ? null : maxPerDay),
    };
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-portal-property-settings', {
        body: { token, property_id: propertyId, updates },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Settings saved.');
      queryClient.invalidateQueries({ queryKey: ['magic-prop-detail', propertyId] });
    } catch (e: any) {
      toast.error(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Zap className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <p className="font-bold text-foreground">Auto-confirm turnovers</p>
            <p className="text-xs text-muted-foreground">
              When a guest checkout syncs in from Hostaway / iCal, skip the manual review step and confirm the clean automatically.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={saving}
          onCheckedChange={(v) => { setEnabled(v); save({ enabled: v }); }}
        />
      </div>

      {enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide">Minimum gap (hours)</Label>
            <p className="text-[11px] text-muted-foreground mb-1">
              Only auto-confirm if there's at least this much time between checkout and next check-in. Tighter = always flag.
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                value={minHours}
                onChange={(e) => setMinHours(Number(e.target.value))}
                className="h-9"
              />
              <button
                type="button"
                onClick={() => save({ minHours })}
                disabled={saving}
                className="text-xs font-bold text-primary hover:underline whitespace-nowrap"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide">Daily safety cap</Label>
            <p className="text-[11px] text-muted-foreground mb-1">
              If more than this many cleans get auto-created in a day, bail out. Leave blank for no cap.
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-9"
              />
              <button
                type="button"
                onClick={() => save()}
                disabled={saving}
                className="text-xs font-bold text-primary hover:underline whitespace-nowrap"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
