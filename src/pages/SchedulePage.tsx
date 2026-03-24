import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, isToday, startOfDay, isBefore } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight, CalendarDays, AlertTriangle } from 'lucide-react';
import { CalendarViewToggle, type CalendarView } from '@/components/schedule/CalendarViewToggle';
import { CalendarDayView } from '@/components/schedule/CalendarDayView';
import { CalendarWeekView } from '@/components/schedule/CalendarWeekView';
import { CalendarMonthView } from '@/components/schedule/CalendarMonthView';
import { CalendarLegend } from '@/components/schedule/CalendarLegend';
import { JobDetailSlideOver } from '@/components/schedule/JobDetailSlideOver';
import { ScheduleStatsBar } from '@/components/schedule/ScheduleStatsBar';
import { StatusFilter } from '@/components/schedule/StatusFilter';
import { AcceptanceFilter } from '@/components/schedule/AcceptanceFilter';
import { ScheduleJobCard } from '@/components/schedule/ScheduleJobCard';
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
  const [acceptanceFilter, setAcceptanceFilter] = useState(searchParams.get('acceptance') || 'all');

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

  const handleAcceptanceChange = (value: string) => {
    setAcceptanceFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('acceptance');
    else params.set('acceptance', value);
    setSearchParams(params, { replace: true });
  };

  const getAcceptanceCategory = (jobId: string) => {
    const acc = acceptancesByJob[jobId];
    if (!acc || acc.length === 0) return 'none';
    if (acc.some(a => a.acceptance_status === 'declined')) return 'declined';
    if (acc.some(a => a.acceptance_status === 'pending')) return 'pending';
    if (acc.every(a => a.acceptance_status === 'accepted')) return 'confirmed';
    return 'pending';
  };

  const filteredJobs = jobs.filter(j => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    if (acceptanceFilter !== 'all' && getAcceptanceCategory(j.id) !== acceptanceFilter) return false;
    return true;
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

    const { error } = await supabase.from('jobs').update(update).eq('id', job.id);
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

    toast.success(`Job moved to ${formattedDate}${timeLabel} ✓`, {
      action: {
        label: 'Notify cleaner',
        onClick: async () => {
          try {
            await supabase.functions.invoke('send-job-sms', { body: { job_id: job.id } });
            toast.success('Cleaner notified ✓');
          } catch (e: any) {
            toast.error(`SMS failed: ${e.message}`);
          }
        },
      },
      duration: 8000,
    });

    invalidate();
  }, [nameMap, invalidate]);

  // Admin calendar view
  if (isAdmin) {
    return (
      <div className="space-y-4">
        {/* Top bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Schedule</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <CalendarViewToggle view={view} onChange={setView} />
            <Button variant="accent" onClick={() => handleAddJob(selectedDate)} className="gap-2">
              <Plus className="h-5 w-5" /> Schedule Job
            </Button>
          </div>
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateDate('prev')}
              className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-extrabold text-foreground min-w-[200px] text-center">
              {getHeaderLabel()}
            </h2>
            <button
              onClick={() => navigateDate('next')}
              className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            {!isToday(selectedDate) && (
              <Button variant="outline" size="sm" className="gap-1.5 ml-2" onClick={() => setSelectedDate(new Date())}>
                <CalendarDays className="h-4 w-4" /> Today
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <StatusFilter value={statusFilter} onChange={handleStatusChange} />
          </div>
        </div>

        <AcceptanceFilter value={acceptanceFilter} onChange={handleAcceptanceChange} />

        {/* Stats bar — all views */}
        <ScheduleStatsBar view={view} date={selectedDate} jobs={filteredJobs} />

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

        <CalendarLegend />

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
                        propertyName={job.properties?.property_name || 'Unknown'}
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
