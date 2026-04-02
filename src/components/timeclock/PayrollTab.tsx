import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInMinutes, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';

export default function PayrollTab() {
  const now = new Date();
  const [periodStart, setPeriodStart] = useState(() => format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(() => format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));

  // Fetch cleaners with roles
  const { data: cleaners = [] } = useQuery({
    queryKey: ['payroll-cleaners'],
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').in('role', ['cleaner', 'head_cleaner']);
      if (!roles?.length) return [];
      const ids = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, hourly_rate, employment_type, super_rate').in('id', ids);
      return profiles || [];
    },
  });

  // Fetch pay rates
  const { data: payRates = [] } = useQuery({
    queryKey: ['payroll-pay-rates'],
    queryFn: async () => {
      const { data } = await supabase.from('staff_pay_rates' as any).select('*');
      return data || [];
    },
  });

  // Fetch jobs for period
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['payroll-jobs', periodStart, periodEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, clock_on, clock_off, status, scheduled_date, duration_minutes, cleaner_1_id, cleaner_2_id, notes, properties(property_name)')
        .not('clock_on', 'is', null)
        .gte('scheduled_date', periodStart)
        .lte('scheduled_date', periodEnd)
        .order('scheduled_date');
      return data || [];
    },
  });

  const payRateMap = useMemo(() => {
    const m: Record<string, any> = {};
    payRates.forEach((r: any) => { m[r.staff_id] = r; });
    return m;
  }, [payRates]);

  const cleanerMap = useMemo(() => {
    const m: Record<string, any> = {};
    cleaners.forEach((c: any) => { m[c.id] = c; });
    return m;
  }, [cleaners]);

  // Build payroll per cleaner
  const payrollData = useMemo(() => {
    const data: Record<string, { jobCount: number; totalMinutes: number; jobsByType: Record<string, number> }> = {};

    jobs.forEach((job: any) => {
      const ids: string[] = [];
      if (job.cleaner_1_id) ids.push(job.cleaner_1_id);
      if (job.cleaner_2_id) ids.push(job.cleaner_2_id);

      const minutes = job.duration_minutes || (job.clock_on && job.clock_off
        ? differenceInMinutes(new Date(job.clock_off), new Date(job.clock_on))
        : 0);

      // Detect job type from notes
      const notesLower = (job.notes || '').toLowerCase();
      let jobType = 'standard';
      if (notesLower.includes('deep')) jobType = 'deep';
      else if (notesLower.includes('airbnb') || notesLower.includes('turnover') || notesLower.includes('short-stay')) jobType = 'airbnb';
      else if (notesLower.includes('commercial') || notesLower.includes('office')) jobType = 'commercial';

      ids.forEach(id => {
        if (!data[id]) data[id] = { jobCount: 0, totalMinutes: 0, jobsByType: {} };
        data[id].jobCount++;
        data[id].totalMinutes += minutes;
        data[id].jobsByType[jobType] = (data[id].jobsByType[jobType] || 0) + 1;
      });
    });

    return data;
  }, [jobs]);

  const calculatePay = (cleanerId: string) => {
    const pr = payRateMap[cleanerId];
    const d = payrollData[cleanerId];
    if (!d) return 0;

    if (pr?.rate_type === 'per_job') {
      let total = 0;
      total += (d.jobsByType['standard'] || 0) * (pr.standard_rate || 65);
      total += (d.jobsByType['deep'] || 0) * (pr.deep_rate || 120);
      total += (d.jobsByType['airbnb'] || 0) * (pr.airbnb_rate || 75);
      total += (d.jobsByType['commercial'] || 0) * (pr.commercial_rate || 90);
      return total;
    }

    // Hourly
    const rate = pr?.hourly_rate || cleanerMap[cleanerId]?.hourly_rate || 0;
    return (d.totalMinutes / 60) * rate;
  };

  const rows = useMemo(() => {
    const allIds = new Set<string>();
    Object.keys(payrollData).forEach(id => allIds.add(id));
    cleaners.forEach((c: any) => allIds.add(c.id));

    return Array.from(allIds)
      .filter(id => payrollData[id]?.jobCount > 0)
      .map(id => {
        const d = payrollData[id] || { jobCount: 0, totalMinutes: 0 };
        const pr = payRateMap[id];
        const pay = calculatePay(id);
        return {
          id,
          name: cleanerMap[id]?.full_name || 'Unknown',
          jobCount: d.jobCount,
          hours: d.totalMinutes / 60,
          rateType: pr?.rate_type || 'hourly',
          pay,
        };
      })
      .sort((a, b) => b.pay - a.pay);
  }, [payrollData, cleanerMap, payRateMap, cleaners]);

  const totalPayroll = rows.reduce((s, r) => s + r.pay, 0);

  const shiftPeriod = (dir: number) => {
    const s = dir > 0 ? addWeeks(new Date(periodStart), 1) : subWeeks(new Date(periodStart), 1);
    const e = endOfWeek(s, { weekStartsOn: 1 });
    setPeriodStart(format(s, 'yyyy-MM-dd'));
    setPeriodEnd(format(e, 'yyyy-MM-dd'));
  };

  const exportCSV = () => {
    const csvRows = [['Cleaner Name', 'Jobs Completed', 'Total Hours', 'Rate Type', 'Calculated Pay', 'Period Start', 'Period End']];
    rows.forEach(r => {
      csvRows.push([r.name, String(r.jobCount), r.hours.toFixed(2), r.rateType, r.pay.toFixed(2), periodStart, periodEnd]);
    });
    csvRows.push(['TOTAL', String(rows.reduce((s, r) => s + r.jobCount, 0)), rows.reduce((s, r) => s + r.hours, 0).toFixed(2), '', totalPayroll.toFixed(2), periodStart, periodEnd]);
    const csv = csvRows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${periodStart}_${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Payroll CSV exported');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftPeriod(-1)}>← Prev</Button>
          <span className="text-sm font-bold text-foreground">
            {format(new Date(periodStart), 'MMM d')} – {format(new Date(periodEnd), 'MMM d, yyyy')}
          </span>
          <Button variant="outline" size="sm" onClick={() => shiftPeriod(1)}>Next →</Button>
        </div>
        <Button onClick={exportCSV} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
          <Download className="w-4 h-4" /> Export Payroll CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">No completed jobs with clock data for this period.</div>
      ) : (
        <div className="bg-card rounded-2xl shadow-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium">Cleaner</th>
                  <th className="text-right px-4 py-3 font-medium">Jobs</th>
                  <th className="text-right px-4 py-3 font-medium">Hours</th>
                  <th className="text-center px-4 py-3 font-medium">Rate Type</th>
                  <th className="text-right px-4 py-3 font-medium">Calculated Pay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.jobCount}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.hours.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="text-xs">{r.rateType === 'per_job' ? 'Per Job' : 'Hourly'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">${r.pay.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-bold">
                  <td className="px-4 py-3">Total Payroll</td>
                  <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.jobCount, 0)}</td>
                  <td className="px-4 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.hours, 0).toFixed(2)}h</td>
                  <td></td>
                  <td className="px-4 py-3 text-right font-mono text-primary">${totalPayroll.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
