import { useMemo } from 'react';
import { Repeat } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';

interface Props {
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
}

interface SeriesGroup {
  seriesId: string;
  propertyName: string;
  frequency: string;
  nextDate: string;
  jobCount: number;
  cleanerName: string;
}

export function RecurringSeriesPanel({ jobs, nameMap }: Props) {
  const navigate = useNavigate();

  const series = useMemo(() => {
    const seriesMap: Record<string, ScheduleJob[]> = {};
    const today = format(new Date(), 'yyyy-MM-dd');

    jobs.forEach(j => {
      if (j.series_id && j.status !== 'cancelled') {
        if (!seriesMap[j.series_id]) seriesMap[j.series_id] = [];
        seriesMap[j.series_id].push(j);
      }
    });

    const groups: SeriesGroup[] = [];
    Object.entries(seriesMap).forEach(([seriesId, seriesJobs]) => {
      const futureJobs = seriesJobs.filter(j => j.scheduled_date >= today).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
      if (futureJobs.length === 0) return;
      const first = futureJobs[0];
      const freq = (first as any).frequency || 'recurring';
      groups.push({
        seriesId,
        propertyName: first.properties?.property_name || 'Unknown',
        frequency: freq,
        nextDate: futureJobs[0].scheduled_date,
        jobCount: seriesJobs.length,
        cleanerName: first.cleaner_1_id ? (nameMap[first.cleaner_1_id] || 'Unassigned') : 'Unassigned',
      });
    });

    return groups.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  }, [jobs, nameMap]);

  if (series.length === 0) return null;

  const freqLabel = (f: string) => {
    if (f === 'weekly') return 'Weekly';
    if (f === 'fortnightly') return 'Fortnightly';
    if (f === 'monthly') return 'Monthly';
    return 'Recurring';
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Recurring Series ({series.length})</h3>
      </div>
      <div className="space-y-2">
        {series.map(s => (
          <div
            key={s.seriesId}
            className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
            onClick={() => {
              const firstJob = jobs.find(j => j.series_id === s.seriesId);
              if (firstJob) navigate(`/jobs/${firstJob.id}`);
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">{s.propertyName}</p>
              <p className="text-xs text-muted-foreground">
                {freqLabel(s.frequency)} · {s.jobCount} jobs · Next: {format(new Date(s.nextDate + 'T00:00:00'), 'MMM d')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{s.cleanerName}</span>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                {freqLabel(s.frequency)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
