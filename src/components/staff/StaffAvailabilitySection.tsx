import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar, Trash2, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

interface Props {
  staffId: string;
  staffName: string;
}

function WeeklyAvailability({ staffId }: { staffId: string }) {
  const [days, setDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('weekly_availability')
      .eq('id', staffId)
      .single()
      .then(({ data }) => {
        const saved = (data as any)?.weekly_availability;
        if (Array.isArray(saved)) setDays(saved);
        setLoaded(true);
      });
  }, [staffId]);

  const toggleDay = (day: string) => {
    const updated = days.includes(day)
      ? days.filter(d => d !== day)
      : [...days, day];
    setDays(updated);

    supabase
      .from('profiles')
      .update({ weekly_availability: updated } as any)
      .eq('id', staffId)
      .then(({ error }) => {
        if (error) {
          toast.error('Failed to save');
          console.error('Availability save error:', error);
        } else {
          toast.success('Saved ✓', { duration: 1500 });
        }
      });
  };

  if (!loaded) return <div className="h-12 animate-pulse bg-muted rounded-xl" />;

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <h3 className="text-lg font-bold text-primary flex items-center gap-2">
        <Calendar className="h-5 w-5" /> Weekly Availability
      </h3>
      <div className="flex gap-2 flex-wrap">
        {DAYS.map(day => (
          <button
            key={day}
            type="button"
            onClick={() => toggleDay(day)}
            className={cn(
              'h-12 w-14 rounded-xl font-bold text-sm transition-colors cursor-pointer select-none',
              days.includes(day)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {DAY_LABELS[day]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Tap to toggle working days</p>
    </div>
  );
}

function LeaveSection({ staffId, staffName }: Props) {
  const queryClient = useQueryClient();
  const [addLeaveOpen, setAddLeaveOpen] = useState(false);
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('personal');
  const [leaveNotes, setLeaveNotes] = useState('');

  const { data: leaveEntries = [] } = useQuery({
    queryKey: ['staff-leave', staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_leave')
        .select('*')
        .eq('user_id', staffId)
        .order('start_date', { ascending: true });
      return data || [];
    },
  });

  const handleAddLeave = async () => {
    if (!leaveStart || !leaveEnd) { toast.error('Please select start and end dates.'); return; }
    const { error } = await supabase.from('staff_leave').insert({
      user_id: staffId,
      start_date: leaveStart,
      end_date: leaveEnd,
      reason: leaveReason,
      notes: leaveNotes || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Leave added');
    queryClient.invalidateQueries({ queryKey: ['staff-leave', staffId] });
    setAddLeaveOpen(false);
    setLeaveStart(''); setLeaveEnd(''); setLeaveReason('personal'); setLeaveNotes('');
  };

  const handleDeleteLeave = async (id: string) => {
    await supabase.from('staff_leave').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['staff-leave', staffId] });
    toast.success('Leave removed');
  };

  return (
    <>
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary">Leave</h3>
          <Button size="sm" type="button" onClick={() => setAddLeaveOpen(true)} className="gap-1 rounded-xl">
            <Plus className="h-4 w-4" /> Add Leave
          </Button>
        </div>

        {leaveEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leave scheduled.</p>
        ) : (
          <div className="space-y-2">
            {leaveEntries.map((leave: any) => (
              <div key={leave.id} className="flex items-center justify-between bg-muted rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {format(parseISO(leave.start_date), 'MMM d')} — {format(parseISO(leave.end_date), 'MMM d, yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{leave.reason}{leave.notes ? ` — ${leave.notes}` : ''}</p>
                </div>
                <Button variant="ghost" size="sm" type="button" onClick={() => handleDeleteLeave(leave.id)} className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addLeaveOpen} onOpenChange={setAddLeaveOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Leave for {staffName}</DialogTitle>
            <DialogDescription>Schedule time off for this team member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date *</Label>
                <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={leaveReason} onValueChange={setLeaveReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="holiday">Holiday</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={leaveNotes} onChange={(e) => setLeaveNotes(e.target.value)} placeholder="Any details…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setAddLeaveOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleAddLeave} className="bg-primary text-primary-foreground font-bold">Add Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConflictBadge({ staffId }: { staffId: string }) {
  const { data: conflictDays = 0 } = useQuery({
    queryKey: ['staff-conflicts-month', staffId],
    queryFn: async () => {
      const now = new Date();
      const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
      const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('jobs')
        .select('scheduled_date')
        .or(`cleaner_1_id.eq.${staffId},cleaner_2_id.eq.${staffId}`)
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
        .in('status', ['scheduled', 'in_progress']);
      if (!data) return 0;
      const dateCounts: Record<string, number> = {};
      data.forEach((j: any) => { dateCounts[j.scheduled_date] = (dateCounts[j.scheduled_date] || 0) + 1; });
      return Object.values(dateCounts).filter(c => c > 1).length;
    },
  });

  if (conflictDays === 0) return null;

  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-center gap-2">
      <Badge className="bg-destructive text-destructive-foreground">⚠️ {conflictDays} double-booked {conflictDays === 1 ? 'day' : 'days'}</Badge>
      <span className="text-sm text-muted-foreground">this month</span>
    </div>
  );
}

export function StaffAvailabilitySection({ staffId, staffName }: Props) {
  return (
    <div className="space-y-6">
      <ConflictBadge staffId={staffId} />
      <WeeklyAvailability staffId={staffId} />
      <LeaveSection staffId={staffId} staffName={staffName} />
    </div>
  );
}
