import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, isToday, startOfDay, isBefore } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { CalendarViewToggle, type CalendarView } from '@/components/schedule/CalendarViewToggle';
import { CalendarDayView } from '@/components/schedule/CalendarDayView';
import { useTimeOffByDate } from '@/hooks/useTimeOff';
import { CalendarWeekView } from '@/components/schedule/CalendarWeekView';
import { CalendarMonthView } from '@/components/schedule/CalendarMonthView';
import { CalendarAgendaView } from '@/components/schedule/CalendarAgendaView';
import { JobDetailSlideOver } from '@/components/schedule/JobDetailSlideOver';
import { ScheduleStatsBar } from '@/components/schedule/ScheduleStatsBar';
import { jobLabel } from '@/lib/jobLabel';
import { StatusFilter } from '@/components/schedule/StatusFilter';
import { ScheduleJobCard } from '@/components/schedule/ScheduleJobCard';
import { useScheduleJobs, type ScheduleJob } from '@/hooks/useScheduleJobs';
import { sendJobSms } from '@/lib/sendJobSms';
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
    const wantedView = searchParams.get('view');
    if (wantedView && ['agenda', 'day', 'week', 'month'].includes(wantedView)) return wantedView as CalendarView;
    const saved = localStorage.getItem('schedule-view');
    const isPhone = window.matchMedia('(max-width: 639px)').matches;
    if (isPhone && (!saved || saved === 'week' || saved === 'month')) return 'agenda';
    return (saved as CalendarView) || 'week';
  });
  // A link can land on a specific day: /schedule?date=2026-10-23&view=day
  const [selectedDate, setSelectedDate] = useState(() => {
    const wanted = searchParams.get('date');
    return wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) ? new Date(wanted + 'T00:00:00') : new Date();
  });
  // Time off for every date any view can show from here: the month grid spills
  // into the neighbouring months and the agenda runs 14 days out.
  const timeOffByDate = useTimeOffByDate(subDays(selectedDate, 45), addDays(selectedDate, 60));
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
        case 'agenda': return dir === 'next' ? addDays(d, 14) : subDays(d, 14);
        case 'day': return dir === 'next' ? addDays(d, 1) : subDays(d, 1);
        case 'week': return dir === 'next' ? addWeeks(d, 1) : subWeeks(d, 1);
        case 'month': return dir === 'next' ? addMonths(d, 1) : subMonths(d, 1);
      }
    });
  };

  const getHeaderLabel = () => {
    switch (view) {
      case 'agenda': return `${format(selectedDate, 'd MMM')} – ${format(addDays(selectedDate, 13), 'd MMM yyyy')}`;
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
    // iCal suggestions aren't real jobs — take admin straight to approval page
    if (job._isSuggestion) {
      navigate('/bookings/suggestions');
      return;
    }
    setSelectedJob(job);
  };

  const handleAddJob = useCallback((date: Date, hour?: number) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const timeStr = hour !== undefined ? `${String(hour).padStart(2, '0')}:00` : '';
    navigate(`/schedule/new?date=${dateStr}${timeStr ? `&time=${timeStr}` : ''}`);
  }, [navigate]);

  const handleJobDrop = useCallback(async (job: ScheduleJob, newDate: string, newTime?: string, override = false) => {
    // Check if anything actually changed
    if (job.scheduled_date === newDate && (!newTime || job.scheduled_time === newTime)) return;

    const update: Record<string, any> = { scheduled_date: newDate };
    if (newTime) update.scheduled_time = newTime;
    if (override) {
      update.availability_override = true;
      update.availability_override_reason = 'Admin moved the clean onto a day the cleaner is away.';
    }

    const { error } = await supabase.from('jobs').update(update as any).eq('id', job.id);
    if (error) {
      // The cleaner is away that day. Offer the override right here instead of
      // bouncing the move and making someone go and edit the roster.
      if (!override && /unavailable on the scheduled date|override is required/i.test(error.message)) {
        const who = (job.cleaner_1_id && nameMap[job.cleaner_1_id]) || 'The cleaner';
        toast.warning(`${who.split(' ')[0]} is off on ${format(new Date(newDate + 'T00:00:00'), 'EEE d MMM')}.`, {
          duration: 15000,
          description: 'Move it anyway, or drop it on another day.',
          action: {
            label: 'Move it anyway',
            onClick: () => { void handleJobDrop(job, newDate, newTime, true); },
          },
        });
        return;
      }
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
            await sendJobSms({ job_id: job.id });
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
                await sendJobSms({ to: clientProfile.phone, message: msg });
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
      <div className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-col gap-3">
        {/* Pre-schedule strip */}
        {preScheduleJobs.length > 0 && (
          <div className="shrink-0 bg-amber-50 border border-amber-200 rounded-2xl p-4">
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

        {/* ── One toolbar, Apple Calendar style ─────────────────────────────
            BJ, 5 Nov 2026: "make everything above the calendar a lot more
            compact ... put each as a button to push at the top. so it brings
            the actual calendar all the way to the top."

            Was: an h1, a stats paragraph, a full width view toggle, a full
            width Schedule Job button, a date row and six wrapped filter chips.
            On a phone that was most of the screen before a single clean showed.
            Now: month and arrows on the left, controls on the right, one row,
            with the numbers on a single quiet line underneath. ───────────── */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            onClick={() => navigateDate('prev')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Previous date range"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-[88px] flex-1 truncate text-base font-extrabold text-primary sm:text-xl">
            {getHeaderLabel()}
          </h1>
          <button
            onClick={() => navigateDate('next')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Next date range"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {!isToday(selectedDate) && (
            <button
              onClick={() => setSelectedDate(new Date())}
              className="h-8 shrink-0 rounded-lg border border-border px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              Today
            </button>
          )}

          <CalendarViewToggle view={view} onChange={setView} />
          <StatusFilter value={statusFilter} onChange={handleStatusChange} />

          <button
            onClick={() => handleAddJob(selectedDate)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-bold text-primary-foreground transition-transform hover:scale-[1.03] sm:px-3"
            aria-label="Schedule a job"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Schedule Job</span>
          </button>
        </div>

        {/* The numbers, one quiet line. Scrolls sideways rather than wrapping
            and stealing a second row from the calendar. */}
        <div className="shrink-0 overflow-x-auto">
          <ScheduleStatsBar view={view} date={selectedDate} jobs={filteredJobs} />
        </div>

        {/* Calendar body: the one part of this page that moves. */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {view === 'agenda' && (
              <CalendarAgendaView
                date={selectedDate}
                jobs={filteredJobs}
                nameMap={nameMap}
                onJobClick={handleJobClick}
                onAddJob={(date) => handleAddJob(date)}
                timeOffByDate={timeOffByDate}
              />
            )}
            {view === 'day' && (
              <CalendarDayView
                date={selectedDate}
                jobs={filteredJobs}
                nameMap={nameMap}
                acceptancesByJob={acceptancesByJob}
                onJobClick={handleJobClick}
                onAddJob={handleAddJob}
                onJobDrop={handleJobDrop}
                timeOffByDate={timeOffByDate}
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
                timeOffByDate={timeOffByDate}
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
                timeOffByDate={timeOffByDate}
              />
            )}
          </>
        )}
        </div>

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
