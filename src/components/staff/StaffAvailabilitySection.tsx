import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar, Trash2, Plus, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};
const SHIFTS = ['am', 'pm', 'evening'] as const;
const SHIFT_LABELS: Record<string, string> = { am: 'AM', pm: 'PM', evening: 'Eve' };

interface Props {
  staffId: string;
  staffName: string;
}

type WeeklyPattern = Record<string, string[]>; // { mon: ['am','pm'], tue: ['am'] }

function WeeklyAvailability({ staffId }: { staffId: string }) {
  const [pattern, setPattern] = useState<WeeklyPattern>({});
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    supabase
      .from('profiles')
      .select('weekly_availability')
      .eq('id', staffId)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('Failed to load availability:', error);
        const saved = data?.weekly_availability;
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
          // New format: { mon: ['am','pm'], ... }
          setPattern(saved as WeeklyPattern);
        } else if (Array.isArray(saved)) {
          // Legacy format: ['mon','tue',...] → convert to all-shifts
          const legacy: WeeklyPattern = {};
          (saved as string[]).forEach(d => { legacy[d] = ['am', 'pm', 'evening']; });
          setPattern(legacy);
        }
        setLoaded(true);
      });
  }, [staffId]);

  const saveAvailability = useCallback(async (updated: WeeklyPattern) => {
    setSaveStatus('saving');
    const { error } = await supabase
      .from('profiles')
      .update({ weekly_availability: updated })
      .eq('id', staffId);
    if (error) {
      setSaveStatus('error');
      toast.error('Failed to save availability');
    } else {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }, [staffId]);

  const toggleShift = useCallback((day: string, shift: string) => {
    setPattern(prev => {
      const dayShifts = prev[day] || [];
      const updated = dayShifts.includes(shift)
        ? dayShifts.filter(s => s !== shift)
        : [...dayShifts, shift];
      const newPattern = { ...prev };
      if (updated.length === 0) {
        delete newPattern[day];
      } else {
        newPattern[day] = updated;
      }
      saveAvailability(newPattern);
      return newPattern;
    });
  }, [saveAvailability]);

  const toggleFullDay = useCallback((day: string) => {
    setPattern(prev => {
      const newPattern = { ...prev };
      if (prev[day] && prev[day].length > 0) {
        delete newPattern[day];
      } else {
        newPattern[day] = ['am', 'pm', 'evening'];
      }
      saveAvailability(newPattern);
      return newPattern;
    });
  }, [saveAvailability]);

  if (!loaded) return <div className="h-12 animate-pulse bg-muted rounded-xl" />;

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-primary flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Weekly Availability
        </h3>
        {saveStatus === 'saved' && (
          <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
            <Check className="h-3 w-3" /> Saved ✓
          </span>
        )}
        {saveStatus === 'saving' && <span className="text-xs text-muted-foreground">Saving…</span>}
        {saveStatus === 'error' && <span className="text-xs text-destructive">Save failed</span>}
      </div>

      {/* Grid: Days × Shifts */}
      <div className="overflow-x-auto">
        <table className="w-full text-center">
          <thead>
            <tr>
              <th className="text-xs text-muted-foreground pb-2 w-16"></th>
              {DAYS.map(day => (
                <th key={day} className="text-xs font-bold text-foreground pb-2 cursor-pointer"
                  onClick={() => toggleFullDay(day)}>
                  {DAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SHIFTS.map(shift => (
              <tr key={shift}>
                <td className="text-xs font-semibold text-muted-foreground py-1 text-left">{SHIFT_LABELS[shift]}</td>
                {DAYS.map(day => {
                  const active = pattern[day]?.includes(shift);
                  return (
                    <td key={`${day}-${shift}`} className="py-1 px-0.5">
                      <button
                        type="button"
                        onClick={() => toggleShift(day, shift)}
                        className={cn(
                          'w-10 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer select-none',
                          active
                            ? 'bg-[#0C463D] text-white'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {active ? '✓' : '—'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Tap cells to toggle. Tap day header for full day.</p>
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
    });
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
              <div><Label>Start Date *</Label><Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} /></div>
              <div><Label>End Date *</Label><Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} /></div>
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

function DateExceptions({ staffId }: { staffId: string }) {
  const { data: exceptions = [] } = useQuery({
    queryKey: ['cleaner-availability', staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cleaner_availability')
        .select('*')
        .eq('user_id', staffId)
        .order('date', { ascending: true });
      return data || [];
    },
  });

  if (exceptions.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Date-Based Exceptions</h3>
      <div className="space-y-1">
        {exceptions.slice(0, 10).map((ex: any) => (
          <div key={ex.id} className="flex items-center justify-between text-sm">
            <span>{format(parseISO(ex.date), 'dd MMM yyyy')}</span>
            <Badge className={ex.available ? 'bg-brightly/10 text-brightly' : 'bg-red-100 text-red-800'}>
              {ex.available ? 'Available' : 'Unavailable'}
            </Badge>
          </div>
        ))}
      </div>
    </div>
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
      <DateExceptions staffId={staffId} />
      <LeaveSection staffId={staffId} staffName={staffName} />
    </div>
  );
}
