import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Pencil, Clock, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface PassportEditorProps {
  token: string;
  propertyId: string;
  property: any;
}

// Allow-list mirrors the request-property-change edge function. Keep
// in sync. Each entry says what input to render.
type FieldDef = { key: string; label: string; type: 'short' | 'long' };
const FIELDS: FieldDef[] = [
  { key: 'access_method', label: 'Access method', type: 'short' },
  { key: 'access_code', label: 'Access code', type: 'short' },
  { key: 'alarm_code', label: 'Alarm code', type: 'short' },
  { key: 'garage_code', label: 'Garage code', type: 'short' },
  { key: 'parking_notes', label: 'Parking notes', type: 'long' },
  { key: 'special_instructions', label: 'Special instructions', type: 'long' },
  { key: 'preferences_notes', label: 'Preferences', type: 'long' },
];

export default function PassportEditor({ token, propertyId, property }: PassportEditorProps) {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Pending change requests for this property — used to show a "Pending
  // approval: <new value>" badge under any field with an open request.
  const { data: pending = [] } = useQuery({
    queryKey: ['passport-pending', propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('property_change_requests' as any)
        .select('id, field_name, new_value, created_at')
        .eq('property_id', propertyId)
        .eq('status', 'pending');
      return (data as any[]) || [];
    },
  });
  const pendingByField: Record<string, any> = {};
  (pending as any[]).forEach((p: any) => { pendingByField[p.field_name] = p; });

  const startEdit = (key: string) => {
    setEditingKey(key);
    setDraft(property?.[key] ?? '');
  };
  const cancelEdit = () => {
    setEditingKey(null);
    setDraft('');
  };

  const submitEdit = async () => {
    if (!editingKey) return;
    if ((property?.[editingKey] ?? '') === draft) {
      cancelEdit();
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-property-change', {
        body: { token, property_id: propertyId, field_name: editingKey, new_value: draft },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Change submitted — admin will review shortly.');
      cancelEdit();
      queryClient.invalidateQueries({ queryKey: ['passport-pending', propertyId] });
    } catch (e: any) {
      toast.error(e.message || 'Could not submit change.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {FIELDS.map((f) => {
        const value = property?.[f.key] ?? '';
        const pendingChange = pendingByField[f.key];
        const isEditing = editingKey === f.key;
        return (
          <div
            key={f.key}
            className="rounded-xl border border-border p-3"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {f.label}
              </span>
              {!isEditing && !pendingChange && (
                <button
                  onClick={() => startEdit(f.key)}
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                {f.type === 'long' ? (
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    className="text-sm"
                    autoFocus
                  />
                ) : (
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="text-sm"
                    autoFocus
                  />
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={submitEdit} disabled={submitting} className="gap-1">
                    <Check className="w-3.5 h-3.5" /> Submit for approval
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={submitting}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground whitespace-pre-line">
                {value || <span className="text-muted-foreground italic">Not set</span>}
              </p>
            )}

            {pendingChange && !isEditing && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-xs">
                <Clock className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-amber-800 dark:text-amber-200">
                  <p className="font-semibold">Pending admin approval:</p>
                  <p className="whitespace-pre-line">{pendingChange.new_value}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
