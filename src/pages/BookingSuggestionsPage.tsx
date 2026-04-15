import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Check, X, Calendar, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCleanersList } from '@/hooks/useCleanersList';
import { syncJobAssignment, initialJobStatusForAssignment } from '@/lib/jobAssignment';

const SOURCE_ICONS: Record<string, string> = {
  guesty: '🏠',
  airbnb_ical: '🔴',
  stayz_ical: '🟡',
  booking_ical: '🔵',
  manual_ical: '📅',
};

export default function BookingSuggestionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: cleaners = [] } = useCleanersList();
  const [approveModal, setApproveModal] = useState<any>(null);
  const [cleanerId, setCleanerId] = useState('');
  const [cleanTime, setCleanTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['booking-suggestions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_suggestions' as any)
        .select('*, properties(property_name, address, default_cleaner_id, price_turnover)')
        .eq('status', 'pending')
        .order('checkout_date', { ascending: true });
      return (data || []) as any[];
    },
  });

  const handleApprove = async () => {
    if (!approveModal || !user) return;
    setSubmitting(true);
    try {
      const prop = approveModal.properties as any;
      const finalCleanerId = cleanerId || prop?.default_cleaner_id || null;
      const { data: job, error: jobErr } = await supabase.from('jobs').insert({
        property_id: approveModal.property_id,
        scheduled_date: approveModal.suggested_clean_date,
        scheduled_time: cleanTime,
        cleaner_1_id: finalCleanerId,
        status: initialJobStatusForAssignment(finalCleanerId, null),
        price_ex_gst: prop?.price_turnover || null,
        source: approveModal.source,
        notes: approveModal.guest_name ? `Guest: ${approveModal.guest_name}` : null,
      } as any).select('id').single();
      if (jobErr) throw jobErr;

      await (supabase.from('booking_suggestions' as any) as any)
        .update({ status: 'converted', created_job_id: job.id, decided_at: new Date().toISOString(), decided_by: user.id })
        .eq('id', approveModal.id);

      // Sync acceptance + notify cleaner
      if (job?.id && finalCleanerId) {
        await syncJobAssignment(job.id, { sendSms: true });
      }

      toast.success('Booking approved — job created');
      queryClient.invalidateQueries({ queryKey: ['booking-suggestions'] });
      setApproveModal(null);
    } catch (err: any) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  const handleReject = async (id: string) => {
    if (!user) return;
    const { error } = await (supabase.from('booking_suggestions' as any) as any)
      .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: user.id })
      .eq('id', id);
    if (error) { toast.error('Failed to reject suggestion: ' + error.message); return; }
    toast.success('Suggestion rejected');
    queryClient.invalidateQueries({ queryKey: ['booking-suggestions'] });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-extrabold text-primary">Bookings to Approve</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : suggestions.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">
          No pending booking suggestions. All caught up! ✓
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s: any) => {
            const prop = s.properties as any;
            return (
              <div key={s.id} className="bg-card rounded-2xl shadow-md border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{SOURCE_ICONS[s.source] || '📅'}</span>
                      <p className="font-bold text-foreground truncate">{prop?.property_name || 'Unknown'}</p>
                    </div>
                    {prop?.address && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{prop.address}</p>}
                    {s.guest_name && <p className="text-xs text-muted-foreground">Guest: {s.guest_name}</p>}
                  </div>
                  <span className="text-xs font-bold uppercase text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{s.source}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Checkout: {s.checkout_date ? format(new Date(s.checkout_date + 'T00:00:00'), 'MMM d') : '—'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-primary font-bold">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Clean: {s.suggested_clean_date ? format(new Date(s.suggested_clean_date + 'T00:00:00'), 'MMM d') : '—'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1 bg-brightly hover:bg-brightly-hover text-white font-bold flex-1"
                    onClick={() => { setApproveModal(s); setCleanerId(prop?.default_cleaner_id || ''); setCleanTime(s.suggested_clean_time || '10:00'); }}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive font-bold flex-1"
                    onClick={() => handleReject(s.id)}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!approveModal} onOpenChange={() => setApproveModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Clean Time</Label>
              <Input type="time" value={cleanTime} onChange={(e) => setCleanTime(e.target.value)} />
            </div>
            <div>
              <Label>Assign Cleaner</Label>
              <Select value={cleanerId} onValueChange={setCleanerId}>
                <SelectTrigger><SelectValue placeholder="Select cleaner" /></SelectTrigger>
                <SelectContent>
                  {cleaners.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleApprove} disabled={submitting} className="w-full bg-brightly hover:bg-brightly-hover text-white font-bold">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Job
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
