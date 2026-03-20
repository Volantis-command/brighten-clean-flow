import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, isSameDay, isToday, isBefore, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { WeekCalendar } from '@/components/schedule/WeekCalendar';
import { StatusFilter } from '@/components/schedule/StatusFilter';
import { ScheduleJobCard } from '@/components/schedule/ScheduleJobCard';

export default function SchedulePage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = role === 'admin' || role === 'head_cleaner';
  const [selectedDate, setSelectedDate] = useState(new Date());
  const initialFilter = searchParams.get('status') || 'all';
  const [statusFilter, setStatusFilter] = useState(initialFilter);

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    if (value === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  // Fetch jobs — admin sees all, cleaner sees their own
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['schedule-jobs'],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('*, properties(property_name, address, suburb, lat, lng)')
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (!isAdmin && user) {
        query = query.or(`cleaner_1_id.eq.${user.id},cleaner_2_id.eq.${user.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch cleaner profiles
  const cleanerIds = [...new Set(jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))];
  const { data: profiles = [] } = useQuery({
    queryKey: ['schedule-profiles', cleanerIds],
    queryFn: async () => {
      if (cleanerIds.length === 0) return [];
      const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      if (error) throw error;
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  const nameMap: Record<string, string> = {};
  profiles.forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });

  if (isAdmin) {
    // Admin/Head Cleaner view
    const dayJobs = jobs
      .filter((j: any) => {
        const jobDate = new Date(j.scheduled_date + 'T00:00:00');
        const matchesDay = isSameDay(jobDate, selectedDate);
        const matchesStatus = statusFilter === 'all' || j.status === statusFilter;
        return matchesDay && matchesStatus;
      });

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Schedule</h1>
          <Button variant="accent" onClick={() => navigate('/schedule/new')} className="gap-2">
            <Plus className="h-5 w-5" /> Schedule Job
          </Button>
        </div>

        <WeekCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-xl font-bold text-primary">{isToday(selectedDate) ? "Today's Jobs" : format(selectedDate, 'EEEE, MMM d')}</h2>
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        </div>

        {isLoading ? (
          <p className="text-primary font-bold text-center py-8">Loading jobs…</p>
        ) : dayJobs.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-md p-8 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-lg font-bold text-foreground mb-1">No jobs for this day.</p>
            <p className="text-sm text-muted-foreground">Tap "Schedule Job" to add one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {dayJobs.map((job: any) => (
              <ScheduleJobCard
                key={job.id}
                id={job.id}
                propertyName={job.properties?.property_name || 'Unknown'}
                address={[job.properties?.address, job.properties?.suburb].filter(Boolean).join(', ') || null}
                scheduledTime={job.scheduled_time?.slice(0, 5) || null}
                estimatedDuration={job.estimated_duration ? job.estimated_duration / 60 : null}
                status={job.status}
                cleaner1Name={job.cleaner_1_id ? nameMap[job.cleaner_1_id] : null}
                cleaner2Name={job.cleaner_2_id ? nameMap[job.cleaner_2_id] : null}
                propertyLat={job.properties?.lat}
                propertyLng={job.properties?.lng}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Cleaner view — upcoming jobs sorted by date
  const today = startOfDay(new Date());
  const upcomingJobs = jobs.filter((j: any) => {
    const jobDate = new Date(j.scheduled_date + 'T00:00:00');
    return !isBefore(jobDate, today);
  });
  const pastJobs = jobs.filter((j: any) => {
    const jobDate = new Date(j.scheduled_date + 'T00:00:00');
    return isBefore(jobDate, today);
  }).slice(0, 10);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-extrabold text-primary">My Schedule</h1>

      {isLoading ? (
        <p className="text-primary font-bold text-center py-8">Loading schedule…</p>
      ) : (
        <>
          {/* Upcoming */}
          <div>
            <h2 className="text-xl font-bold text-primary mb-4">Upcoming Jobs</h2>
            {upcomingJobs.length === 0 ? (
              <div className="bg-card rounded-2xl shadow-md p-8 text-center">
                <p className="text-4xl mb-3">🌴</p>
                <p className="text-lg font-bold text-foreground">No upcoming jobs.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingJobs.map((job: any) => {
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
                        propertyLat={job.properties?.lat}
                        propertyLng={job.properties?.lng}
                        showClockIn={isTodayJob}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past */}
          {pastJobs.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-primary mb-4">Past Jobs</h2>
              <div className="space-y-3">
                {pastJobs.map((job: any) => (
                  <ScheduleJobCard
                    key={job.id}
                    id={job.id}
                    propertyName={job.properties?.property_name || 'Unknown'}
                    address={null}
                    scheduledTime={job.scheduled_time?.slice(0, 5) || null}
                    estimatedDuration={null}
                    status={job.status}
                    isPastJob
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
