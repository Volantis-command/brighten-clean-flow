import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Check, Flag, Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, differenceInMinutes, parseISO } from 'date-fns';
import PayrollTab from '@/components/timeclock/PayrollTab';

export default function TimesheetsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();

  const [selectedCleaner, setSelectedCleaner] = useState<string>('all');
  const [periodStart, setPeriodStart] = useState(() => format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(() => format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [editEntry, setEditEntry] = useState<any>(null);
  const [editHours, setEditHours] = useState('');
  const [editReason, setEditReason] = useState('');

  // Fetch cleaners
  const { data: cleaners = [] } = useQuery({
    queryKey: ['cleaners-for-timesheet'],
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').in('role', ['cleaner', 'head_cleaner']);
      if (!roles?.length) return [];
      const ids = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, hourly_rate, employment_type, super_rate, pay_cycle').in('id', ids);
      return profiles || [];
    },
  });

  // Fetch time entries for period — try time_entries first, fallback to jobs clock_on/clock_off
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['timesheet-entries', periodStart, periodEnd, selectedCleaner],
    queryFn: async () => {
      // Try time_entries table first
      let query = supabase
        .from('time_entries' as any)
        .select('*, jobs(scheduled_date, properties(property_name), notes, status)')
        .gte('clock_in_time', `${periodStart}T00:00:00`)
        .lte('clock_in_time', `${periodEnd}T23:59:59`)
        .order('clock_in_time', { ascending: true });
      if (selectedCleaner !== 'all') {
        query = query.eq('user_id', selectedCleaner);
      }
      const { data: timeData, error: timeError } = await query;
      
      // If time_entries has data, use it
      if (!timeError && timeData && timeData.length > 0) return timeData;

      // Fallback: build entries from jobs table clock_on/clock_off
      let jobQuery = supabase
        .from('jobs')
        .select('id, clock_on, clock_off, status, scheduled_date, scheduled_time, duration_minutes, cleaner_1_id, cleaner_2_id, properties(property_name, address)')
        .not('clock_on', 'is', null)
        .gte('scheduled_date', periodStart)
        .lte('scheduled_date', periodEnd)
        .order('scheduled_date', { ascending: true });
      
      const { data: jobsData, error: jobsError } = await jobQuery;
      if (jobsError) throw jobsError;

      // Map jobs to timesheet-like entries
      const entries: any[] = [];
      (jobsData || []).forEach((job: any) => {
        const cleanerIds: string[] = [];
        if (job.cleaner_1_id) cleanerIds.push(job.cleaner_1_id);
        if (job.cleaner_2_id) cleanerIds.push(job.cleaner_2_id);
        
        // Filter by selected cleaner
        const relevantCleaners = selectedCleaner !== 'all' 
          ? cleanerIds.filter(id => id === selectedCleaner)
          : cleanerIds;

        relevantCleaners.forEach(cleanerId => {
          entries.push({
            id: `${job.id}-${cleanerId}`,
            job_id: job.id,
            user_id: cleanerId,
            clock_in_time: job.clock_on,
            clock_out_time: job.clock_off,
            total_minutes: job.duration_minutes || (job.clock_on && job.clock_off ? differenceInMinutes(new Date(job.clock_off), new Date(job.clock_on)) : null),
            jobs: {
              scheduled_date: job.scheduled_date,
              properties: job.properties,
              notes: null,
              status: job.status,
            },
            approved: job.status === 'completed',
            flagged: false,
          });
        });
      });
      return entries;
    },
  });

  const cleanerMap = useMemo(() => {
    const map: Record<string, any> = {};
    cleaners.forEach((c: any) => { map[c.id] = c; });
    return map;
  }, [cleaners]);

  const getHours = (entry: any) => {
    if (entry.manual_hours != null) return Number(entry.manual_hours);
    if (entry.total_minutes != null) return Number(entry.total_minutes) / 60;
    if (entry.clock_in_time && entry.clock_out_time) {
      return differenceInMinutes(new Date(entry.clock_out_time), new Date(entry.clock_in_time)) / 60;
    }
    return 0;
  };

  const getRate = (userId: string) => Number(cleanerMap[userId]?.hourly_rate || 0);

  // Group by cleaner
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    entries.forEach((e: any) => {
      if (!map[e.user_id]) map[e.user_id] = [];
      map[e.user_id].push(e);
    });
    return map;
  }, [entries]);

  const approveMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from('time_entries').update({
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
      }).eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet-entries'] });
      toast.success('Entry approved');
    },
  });

  const flagMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from('time_entries').update({ flagged: true } as any).eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet-entries'] });
      toast.success('Entry flagged for review');
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('time_entries').update({
        manual_hours: parseFloat(editHours),
        edit_reason: editReason,
      } as any).eq('id', editEntry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet-entries'] });
      toast.success('Hours updated');
      setEditEntry(null);
    },
  });

  const exportCSV = () => {
    const rows = [['Employee Name', 'Employee Type', 'Date', 'Job ID', 'Property', 'Clean Type', 'Start Time', 'End Time', 'Hours Worked', 'Hourly Rate', 'Gross Pay', 'Super Rate', 'Super Amount', 'Total Cost']];
    Object.entries(grouped).forEach(([userId, userEntries]) => {
      const cleaner = cleanerMap[userId];
      const rate = getRate(userId);
      const superRate = Number(cleaner?.super_rate || 11.5);
      const empType = cleaner?.employment_type || 'employee';
      userEntries.forEach((e: any) => {
        const hours = getHours(e);
        const gross = hours * rate;
        const superAmt = empType === 'employee' ? gross * (superRate / 100) : 0;
        rows.push([
          cleaner?.full_name || 'Unknown',
          empType,
          e.clock_in_time ? format(new Date(e.clock_in_time), 'yyyy-MM-dd') : '',
          e.job_id || '',
          (e as any).jobs?.properties?.property_name || '',
          '',
          e.clock_in_time ? format(new Date(e.clock_in_time), 'HH:mm') : '',
          e.clock_out_time ? format(new Date(e.clock_out_time), 'HH:mm') : '',
          hours.toFixed(2),
          rate.toFixed(2),
          gross.toFixed(2),
          `${superRate}%`,
          superAmt.toFixed(2),
          (gross + superAmt).toFixed(2),
        ]);
      });
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${periodStart}_${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Payroll CSV exported');
  };

  const shiftPeriod = (dir: number) => {
    const s = dir > 0 ? addWeeks(new Date(periodStart), 1) : subWeeks(new Date(periodStart), 1);
    const e = endOfWeek(s, { weekStartsOn: 1 });
    setPeriodStart(format(s, 'yyyy-MM-dd'));
    setPeriodEnd(format(e, 'yyyy-MM-dd'));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Timesheets</h1>
        <Button onClick={exportCSV} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
          <Download className="w-4 h-4" /> Export Payroll CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <Label className="text-xs">Cleaner</Label>
          <Select value={selectedCleaner} onValueChange={setSelectedCleaner}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cleaners</SelectItem>
              {cleaners.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.full_name || 'Unknown'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftPeriod(-1)}>← Prev</Button>
          <span className="text-sm font-bold text-foreground">
            {format(new Date(periodStart), 'MMM d')} – {format(new Date(periodEnd), 'MMM d, yyyy')}
          </span>
          <Button variant="outline" size="sm" onClick={() => shiftPeriod(1)}>Next →</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">No time entries for this period.</div>
      ) : (
        Object.entries(grouped).map(([userId, userEntries]) => {
          const cleaner = cleanerMap[userId];
          const rate = getRate(userId);
          const superRate = Number(cleaner?.super_rate || 11.5);
          const empType = cleaner?.employment_type || 'employee';
          let totalHours = 0;
          let totalPay = 0;

          return (
            <div key={userId} className="bg-card rounded-2xl shadow-md border border-border overflow-hidden">
              <div className="bg-primary/5 px-5 py-3 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground">{cleaner?.full_name || 'Unknown'}</h3>
                  <p className="text-xs text-muted-foreground">${rate.toFixed(2)}/hr · {empType === 'contractor' ? 'Contractor' : `Employee · ${superRate}% super`}</p>
                </div>
                <Badge variant="outline" className="text-xs">{cleaner?.pay_cycle || 'fortnightly'}</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-left px-4 py-2 font-medium">Property</th>
                      <th className="text-left px-4 py-2 font-medium">Start</th>
                      <th className="text-left px-4 py-2 font-medium">End</th>
                      <th className="text-right px-4 py-2 font-medium">Hours</th>
                      <th className="text-right px-4 py-2 font-medium">Pay</th>
                      <th className="text-center px-4 py-2 font-medium">Status</th>
                      <th className="text-right px-4 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userEntries.map((e: any) => {
                      const hours = getHours(e);
                      const pay = hours * rate;
                      totalHours += hours;
                      totalPay += pay;
                      return (
                        <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-4 py-2 font-medium">{e.clock_in_time ? format(new Date(e.clock_in_time), 'EEE, MMM d') : '—'}</td>
                          <td className="px-4 py-2">{(e as any).jobs?.properties?.property_name || '—'}</td>
                          <td className="px-4 py-2">{e.clock_in_time ? format(new Date(e.clock_in_time), 'h:mm a') : '—'}</td>
                          <td className="px-4 py-2">{e.clock_out_time ? format(new Date(e.clock_out_time), 'h:mm a') : <span className="text-accent font-bold">Active</span>}</td>
                          <td className="px-4 py-2 text-right font-mono">{hours.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right font-mono">${pay.toFixed(2)}</td>
                          <td className="px-4 py-2 text-center">
                            {e.flagged ? (
                              <Badge variant="destructive" className="text-[10px]">Flagged</Badge>
                            ) : e.approved ? (
                              <Badge className="bg-primary text-primary-foreground text-[10px]">Approved</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              {!e.approved && (
                                <Button variant="ghost" size="sm" onClick={() => approveMutation.mutate(e.id)} title="Approve">
                                  <Check className="w-4 h-4 text-primary" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => { setEditEntry(e); setEditHours(getHours(e).toFixed(2)); setEditReason(''); }} title="Edit hours">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {!e.flagged && (
                                <Button variant="ghost" size="sm" onClick={() => flagMutation.mutate(e.id)} title="Flag for review">
                                  <Flag className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 font-bold">
                      <td colSpan={4} className="px-4 py-2 text-right">Period Total:</td>
                      <td className="px-4 py-2 text-right font-mono">{totalHours.toFixed(2)}h</td>
                      <td className="px-4 py-2 text-right font-mono">${totalPay.toFixed(2)}</td>
                      <td colSpan={2} className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {empType === 'employee' && `+$${(totalPay * superRate / 100).toFixed(2)} super`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })
      )}

      {/* Edit Hours Dialog */}
      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Hours</DialogTitle>
            <DialogDescription>Manually adjust hours for this time entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Hours Worked</Label>
              <Input type="number" step="0.25" value={editHours} onChange={(e) => setEditHours(e.target.value)} />
            </div>
            <div>
              <Label>Reason for Edit *</Label>
              <Textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="e.g. Clock-in error, break adjustment..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={!editReason || editMutation.isPending} className="bg-primary text-primary-foreground font-bold gap-2">
              {editMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
