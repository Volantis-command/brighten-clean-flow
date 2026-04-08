import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

const TEMPLATE_LABELS: Record<string, string> = {
  quote_sms: 'Quote SMS',
  booking_confirm: 'Booking Confirmation',
  cleaner_assigned_to_cleaner: 'Cleaner Assigned (to Cleaner)',
  cleaner_assigned_to_client: 'Cleaner Assigned (to Client)',
  review_request: 'Review Request',
  damage_alert_to_head_cleaner: 'Damage Alert (Head Cleaner)',
  damage_alert_to_client: 'Damage Alert (Client)',
  reminder_12hr_before: 'Reminder (12hr Before)',
  no_reply_followup_30day: 'No Reply Follow-up (30 Day)',
};

export default function SMSTemplatesSection() {
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['sms-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_templates' as any)
        .select('*');
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (templates) {
      const map: Record<string, string> = {};
      templates.forEach((t: any) => { map[t.key] = t.body; });
      setEdits(map);
    }
  }, [templates]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const t of (templates || []) as any[]) {
        if (edits[t.key] !== undefined && edits[t.key] !== t.body) {
          await (supabase.from('sms_templates' as any) as any)
            .update({ body: edits[t.key], updated_at: new Date().toISOString() })
            .eq('id', t.id);
        }
      }
    },
    onSuccess: () => {
      toast.success('SMS templates saved');
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
    },
    onError: () => toast.error('Failed to save templates'),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <MessageSquare className="w-5 h-5" /> SMS Templates
        </h2>
        <p className="text-sm text-muted-foreground">Edit SMS templates. Use merge variables in curly braces.</p>
      </div>

      {(templates || []).map((t: any) => {
        const vars = (t.variables || []) as string[];
        return (
          <div key={t.key} className="bg-card rounded-2xl shadow-sm border border-border p-5 space-y-3">
            <Label className="text-sm font-bold">{TEMPLATE_LABELS[t.key] || t.key}</Label>
            <Textarea
              value={edits[t.key] || ''}
              onChange={(e) => setEdits((p) => ({ ...p, [t.key]: e.target.value }))}
              rows={3}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-1">
              {vars.map((v: string) => (
                <Badge key={v} variant="secondary" className="text-xs font-mono cursor-pointer"
                  onClick={() => {
                    const current = edits[t.key] || '';
                    setEdits((p) => ({ ...p, [t.key]: current + `{${v}}` }));
                  }}
                >
                  {`{${v}}`}
                </Badge>
              ))}
            </div>
          </div>
        );
      })}

      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="w-full bg-primary text-primary-foreground font-bold rounded-xl gap-2"
      >
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save All Templates
      </Button>
    </div>
  );
}
