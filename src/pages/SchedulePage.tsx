import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, isToday, startOfDay, isBefore } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, Repeat } from 'lucide-react';
import { CalendarViewToggle, type CalendarView } from '@/components/schedule/CalendarViewToggle';
import { CalendarDayView } from '@/components/schedule/CalendarDayView';
import { CalendarWeekView } from '@/components/schedule/CalendarWeekView';
import { CalendarMonthView } from '@/components/schedule/CalendarMonthView';
import { CalendarLegend } from '@/components/schedule/CalendarLegend';
import { JobDetailSlideOver } from '@/components/schedule/JobDetailSlideOver';
import { ScheduleStatsBar } from '@/components/schedule/ScheduleStatsBar';
import { jobLabel } from '@/lib/jobLabel';
import { StatusFilter } from '@/components/schedule/StatusFilter';
import { ScheduleJobCard } from '@/components/schedule/ScheduleJobCard';
import { RecurringSeriesPanel } from '@/components/schedule/RecurringSeriesPanel';
import { useScheduleJobs, type ScheduleJob } from '@/hooks/useScheduleJobs';
import { useXeroInvoiceSync } from '@/hooks/useXeroInvoiceSync';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function SchedulePage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = role === 'admin' || role === 'head_cleaner';
  useXeroInvoiceSync();

  const { jobs, isLoading, nameMap, acceptancesByJob, invalidate } = useScheduleJobs();

  const [view, setView] = useState<CalendarView>(() => {
    const saved = localStorage.getItem('schedule-view');
    return (saved as CalendarView) || 'week';
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedJob, setSelectedJob] = useState<ScheduleJob | null>(null);

  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');

  useEffect(() => {
    localStorage.setItem('schedule-view', view);
  }, [view]);

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('status');
    else params.set('status', value);
    setSearchParams(params, { replace: true });
  };

  const filteredJobs = jobs.filter(j => {
    if (statusFilter === 'all') return true;
    // New unified "needs admin attention" bucket matches all yellow states
    if (statusFilter === 'pending_cleaner') return j.status === 'pending_cleaner';
    if (statusFilter === 'awaiting_cleaner_acceptance') return j.status === 'awaiting_cleaner_acceptance';
    return j.status === statusFilter;
  });

  const navigateDate = (dir: 'prev' | 'next') => {
    setSelectedDate(d => {
      switch (view) {
        case 'day': return dir === 'next' ? addDays(d, 1) : subDays(d, 1);
        case 'week': return dir === 'next' ? addWeeks(d, 1) : subWeeks(d, 1);
        case 'month': return dir === 'next' ? addMonths(d, 1) : subMonths(d, 1);
      }
    });
  };

  const getHeaderLabel = () => {
    switch (view) {
      case 'day': return format(selectedDate, 'EEEE, d MMMM yyyy');
      case 'week': return format(selectedDate, 'MMMM yyyy');
      case 'month': return format(selectedDate, 'MMMM yyyy');
    }
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    if (view === 'month') setView('day');
  };

  const handleJobClick = (job: ScheduleJob) => {
    setSelectedJob(job);
  };

  const handleAddJob = useCallback((date: Date, hour?: number) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const timeStr = hour !== undefined ? `${String(hour).padStart(2, '0')}:00` : '';
    navigate(`/schedule/new?date=${dateStr}${timeStr ? `&time=${timeStr}` : ''}`);
  }, [navigate]);

  const handleJobDrop = useCallback(async (job: ScheduleJob, newDate: string, newTime?: string) => {
    // Check if anything actually changed
    if (job.scheduled_date === newDate && (!newTime || job.scheduled_time === newTime)) return;

    const update: Record<string, any> = { scheduled_date: newDate };
    if (newTime) update.scheduled_time = newTime;

    const { error } = await supabase.from('jobs').update(update as any).eq('id', job.id);
    if (error) {
      toast.error(`Failed to move job: ${error.message}`);
      return;
    }

    const formattedDate = format(new Date(newDate + 'T00:00:00'), 'EEE, d MMM');
    const timeLabel = newTime ? ` at ${newTime.slice(0, 5)}` : '';

    // Check for cleaner conflicts on new date
    const cleanerId = job.cleaner_1_id;
    if (cleanerId) {
      const { data: conflicts } = await supabase
        .from('jobs')
        .select('id')
        .eq('scheduled_date', newDate)
        .neq('id', job.id)
        .or(`cleaner_1_id.eq.${cleanerId},cleaner_2_id.eq.${cleanerId}`)
        .in('status', ['scheduled', 'in_progress']);

      if (conflicts && conflicts.length > 0) {
        const cleanerName = nameMap[cleanerId] || 'Cleaner';
        toast.warning(`⚠️ ${cleanerName} already has ${conflicts.length} job(s) on ${formattedDate}`, { duration: 5000 });
      }
    }

    // Cancel old scheduled SMS and reschedule
    const { error: smsErr } = await supabase
      .from('scheduled_sms' as any)
      .update({ status: 'cancelled' } as any)
      .eq('job_id', job.id)
      .eq('status', 'pending');
    if (smsErr) console.error('Failed to cancel scheduled SMS:', smsErr);

    toast.success(`Job moved to ${formattedDate}${timeLabel} ✓`, {
      action: {
        label: 'Notify all',
        onClick: async () => {
          try {
            // Notify cleaner
            await supabase.functions.invoke('send-job-sms', { body: { job_id: job.id } });
            // Notify client
            const { data: cpRows } = await supabase
              .from('client_properties')
              .select('client_id')
              .eq('property_id', job.property_id)
              .limit(1);
            const clientId = (cpRows as any)?.[0]?.client_id;
            if (clientId) {
              const { data: clientProfile } = await supabase
                .from('profiles')
                .select('full_name, phone')
                .eq('id', clientId)
                .maybeSingle();
              if (clientProfile?.phone) {
                const firstName = (clientProfile.full_name || 'there').split(' ')[0];
                const propName = job.properties?.property_name || 'your property';
                const msg = `Hi ${firstName}, your clean at ${propName} has been rescheduled to ${formattedDate}${timeLabel}. — Brightly 🌿`;
                await supabase.functions.invoke('send-job-sms', {
                  body: { to: clientProfile.phone, message: msg },
                });
              }
            }
            toast.success('Cleaner & client notified ✓');
          } catch (e: any) {
            toast.error(`SMS failed: ${e.message}`);
          }
        },
      },
      duration: 8000,
    });

    invalidate();
  }, [nameMap, invalidate]);

  // Awaiting quote/approval jobs (not on calendar but need visibility)
  const { data: preScheduleJobs = [] } = useQuery({
    queryKey: ['pre-schedule-jobs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, status, scheduled_date, created_at, notes, properties(property_name, address, client_name)')
        .in('status', ['awaiting_quote', 'awaiting_approval', 'pending_approval', 'awaiting_schedule_approval'])
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: isAdmin,
  });

  // Admin calendar view
  if (isAdmin) {
    return (
      <div className="space-y-3">
        {/* Pre-schedule strip */}
        {preScheduleJobs.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="font-bold text-foreground text-sm">
                {preScheduleJobs.length} job{preScheduleJobs.length !== 1 ? 's' : ''} need{preScheduleJobs.length === 1 ? 's' : ''} attention
              </p>
            </div>
            <div className="space-y-2">
              {preScheduleJobs.map((j: any) => (
                <div
                  key={j.id}
                  onClick={() => navigate(`/jobs/${j.id}`)}
                  className="bg-card rounded-xl p-3 flex items-center justify-between cursor-pointer hover:shadow-sm transition-shadow border border-border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground text-sm truncate">
                      {jobLabel(j)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{(j.properties as any)?.property_name}</p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0 text-xs font-bold gap-1">
                    {j.status === 'awaiting_quote' ? 'Set Price' : 'Confirm'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row 1: Title + controls */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Schedule</h1>
            <ScheduleStatsBar view={view} date={selectedDate} jobs={filteredJobs} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <CalendarViewToggle view={view} onChange={setView} />
            <Button variant="accent" onClick={() => handleAddJob(selectedDate)} className="gap-2">
              <Plus className="h-5 w-5" /> Schedule Job
            </Button>
          </div>
        </div>

        {/* Row 2: Filters + date navigation */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateDate('prev')}
              className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-base font-bold text-foreground min-w-[180px] text-center">
              {getHeaderLabel()}
            </h2>
            <button
              onClick={() => navigateDate('next')}
              className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {!isToday(selectedDate) && (
              <Button variant="outline" size="sm" className="gap-1.5 ml-1 text-xs h-8" onClick={() => setSelectedDate(new Date())}>
                <CalendarDays className="h-3.5 w-3.5" /> Today
              </Button>
            )}
          </div>

          <StatusFilter value={statusFilter} onChange={handleStatusChange} />
        </div>

        {/* Calendar body */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {view === 'day' && (
              <CalendarDayView
                date={selectedDate}
                jobs={filteredJobs}
                nameMap={nameMap}
                acceptancesByJob={acceptancesByJob}
                onJobClick={handleJobClick}
                onAddJob={handleAddJob}
                onJobDrop={handleJobDrop}
              />
            )}
            {view === 'week' && (
              <CalendarWeekView
                date={selectedDate}
                jobs={filteredJobs}
                nameMap={nameMap}
                acceptancesByJob={acceptancesByJob}
                onJobClick={handleJobClick}
                onDateClick={handleDateClick}
                onAddJob={handleAddJob}
                onJobDrop={handleJobDrop}
              />
            )}
            {view === 'month' && (
              <CalendarMonthView
                date={selectedDate}
                jobs={filteredJobs}
                nameMap={nameMap}
                onJobClick={handleJobClick}
                onDateClick={handleDateClick}
                onAddJob={(date) => handleAddJob(date)}
                onJobDrop={(job, newDate) => handleJobDrop(job, newDate)}
              />
            )}
          </>
        )}

        {/* Recurring Series Section */}
        <RecurringSeriesPanel jobs={filteredJobs} nameMap={nameMap} />

        <CalendarLegend jobs={filteredJobs} nameMap={nameMap} />

        {selectedJob && (
          <JobDetailSlideOver
            job={selectedJob}
            nameMap={nameMap}
            acceptances={acceptancesByJob[selectedJob.id]}
            onClose={() => setSelectedJob(null)}
          />
        )}
      </div>
    );
  }

  // Cleaner view
  const today = startOfDay(new Date());
  const upcomingJobs = jobs.filter(j => {
    const jobDate = new Date(j.scheduled_date + 'T00:00:00');
    return !isBefore(jobDate, today);
  });
  const pastJobs = jobs.filter(j => {
    const jobDate = new Date(j.scheduled_date + 'T00:00:00');
    return isBefore(jobDate, today);
  }).slice(0, 10);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-extrabold text-primary">My Schedule</h1>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-xl font-bold text-primary mb-4">Upcoming Jobs</h2>
            {upcomingJobs.length === 0 ? (
              <div className="bg-card rounded-2xl shadow-md p-8 text-center">
                <p className="text-4xl mb-3">🌴</p>
                <p className="text-lg font-bold text-foreground">No upcoming jobs.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingJobs.map(job => {
                  const jobDate = new Date(job.scheduled_date + 'T00:00:00');
                  const isTodayJob = isToday(jobDate);
                  return (
                    <div key={job.id}>
                      <p className="text-xs font-bold text-muted-foreground uppercase mb-2">
                        {isTodayJob ? 'Today' : format(jobDate, 'EEEE, MMM d')}
                      </p>
                      <ScheduleJobCard
                        id={job.id}
                        propertyName={jobLabel(job)}
                        address={[job.properties?.address, job.properties?.suburb].filter(Boolean).join(', ') || null}
                        scheduledTime={job.scheduled_time?.slice(0, 5) || null}
                        estimatedDuration={job.estimated_duration ? job.estimated_duration / 60 : null}
                        status={job.status}
                        cleaner1Name={job.cleaner_1_id && job.cleaner_1_id !== user?.id ? nameMap[job.cleaner_1_id] : null}
                        cleaner2Name={job.cleaner_2_id && job.cleaner_2_id !== user?.id ? nameMap[job.cleaner_2_id] : null}
                        propertyLat={job.properties?.lat ? Number(job.properties.lat) : undefined}
                        propertyLng={job.properties?.lng ? Number(job.properties.lng) : undefined}
                        showClockIn={isTodayJob}
                        invoiceStatus={job.invoice_status}
                        seriesId={job.series_id}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {pastJobs.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-primary mb-4">Past Jobs</h2>
              <div className="space-y-3">
                {pastJobs.map(job => (
                  <ScheduleJobCard
                    key={job.id}
                    id={job.id}
                    propertyName={job.properties?.property_name || 'Unknown'}
                    address={null}
                    scheduledTime={job.scheduled_time?.slice(0, 5) || null}
                    estimatedDuration={null}
                    status={job.status}
                    isPastJob
                    invoiceStatus={job.invoice_status}
                    seriesId={job.series_id}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
