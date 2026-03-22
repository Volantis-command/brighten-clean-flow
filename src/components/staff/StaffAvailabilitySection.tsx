import { useState } from 'react';
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

export function StaffAvailabilitySection({ staffId, staffName }: Props) {
  const queryClient = useQueryClient();
  const [addLeaveOpen, setAddLeaveOpen] = useState(false);
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('personal');
  const [leaveNotes, setLeaveNotes] = useState('');

  // Weekly availability
  const { data: profile } = useQuery({
    queryKey: ['staff-availability', staffId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('weekly_availability').eq('id', staffId).single();
      return data;
    },
  });

  const availability: string[] = (profile as any)?.weekly_availability || ['mon', 'tue', 'wed', 'thu', 'fri'];

  const toggleDay = async (day: string) => {
    const updated = availability.includes(day)
      ? availability.filter(d => d !== day)
      : [...availability, day];
    await supabase.from('profiles').update({ weekly_availability: updated } as any).eq('id', staffId);
    queryClient.invalidateQueries({ queryKey: ['staff-availability', staffId] });
  };

  // Leave entries
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

  // Conflict check — double-booked days this month
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
    <div className="space-y-6">
      {/* Conflict badge */}
      {conflictDays > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-center gap-2">
          <Badge className="bg-destructive text-destructive-foreground">⚠️ {conflictDays} double-booked {conflictDays === 1 ? 'day' : 'days'}</Badge>
          <span className="text-sm text-muted-foreground">this month</span>
        </div>
      )}

      {/* Weekly availability */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
        <h3 className="text-lg font-bold text-primary flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Weekly Availability
        </h3>
        <div className="flex gap-2 flex-wrap">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={cn(
                'h-12 w-14 rounded-xl font-bold text-sm transition-colors',
                availability.includes(day)
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

      {/* Leave */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary">Leave</h3>
          <Button size="sm" onClick={() => setAddLeaveOpen(true)} className="gap-1 rounded-xl">
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
                <Button variant="ghost" size="sm" onClick={() => handleDeleteLeave(leave.id)} className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Leave Dialog */}
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
            <Button variant="outline" onClick={() => setAddLeaveOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLeave} className="bg-primary text-primary-foreground font-bold">Add Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
