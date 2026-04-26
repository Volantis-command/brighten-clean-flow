import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Clock, CheckCircle2, CalendarCheck, Navigation } from 'lucide-react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

// Real-time clock-on indicator on the client portal.
//
// Subscribes to changes on the property's jobs via Supabase Realtime.
// When a cleaner taps Clock On (jobs.status flips to 'in_progress' and
// jobs.clock_on is set), a live banner appears at the top of the
// property page: "Sarah is here cleaning your property — clocked on
// at 9:02 AM, 23 minutes elapsed."
//
// This is the Uber moment — the client knows exactly when the cleaner
// arrives, no SMS check-in, no admin in the loop. Big trust signal.
//
// When the cleaner clocks off (status → 'completed'), the banner
// switches to a brief "✓ Clean complete" celebration card for 30s,
// then disappears (the regular Last Clean Summary takes over).

interface LiveCleanStatusProps {
  propertyId: string;
  cleanerNames: Record<string, string>; // map of cleaner_id → full_name
}

interface ActiveJob {
  id: string;
  status: string;
  clock_on: string | null;
  clock_off: string | null;
  on_route_at: string | null;
  cleaner_1_id: string | null;
  cleaner_2_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
}

export default function LiveCleanStatus({ propertyId, cleanerNames }: LiveCleanStatusProps) {
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [now, setNow] = useState(new Date());

  // Initial fetch: any job today (scheduled, on-route, in-progress, or
  // recently completed). Pre-arrival states surface so the client can
  // see "Sarah is on her way" / "Clean today at 9:00 AM with Sarah".
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('jobs')
        .select('id, status, clock_on, clock_off, on_route_at, cleaner_1_id, cleaner_2_id, scheduled_date, scheduled_time' as any)
        .eq('property_id', propertyId)
        .eq('scheduled_date', today)
        .in('status', ['scheduled', 'confirmed', 'in_progress', 'completed'])
        .order('scheduled_time', { ascending: true })
        .limit(1);
      if (cancelled) return;
      const j = (data ?? [])[0] as unknown as ActiveJob | undefined;
      if (!j) return;
      if (j.status === 'in_progress' || j.status === 'scheduled' || j.status === 'confirmed') {
        setJob(j);
      } else if (j.status === 'completed' && j.clock_off) {
        const minsSinceClockOff = (Date.now() - new Date(j.clock_off).getTime()) / 60000;
        if (minsSinceClockOff < 30) setJob(j);
      }
    }
    loadInitial();
    return () => { cancelled = true; };
  }, [propertyId]);

  // Subscribe to realtime changes on jobs for this property. When the
  // cleaner clocks on/off, the banner updates without a page refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`live-clean-${propertyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `property_id=eq.${propertyId}` },
        (payload) => {
          const updated = payload.new as ActiveJob;
          if (updated.status === 'in_progress' || updated.status === 'scheduled' || updated.status === 'confirmed') {
            // Pre-arrival, on-route, and in-progress all live here —
            // each transition (on_route_at set → status=in_progress)
            // updates the same banner.
            setJob(updated);
          } else if (updated.status === 'completed') {
            // Show celebration; auto-clear after 30s
            setJob(updated);
            setTimeout(() => setJob(null), 30_000);
          } else if (job && updated.id === job.id) {
            // Status moved off the surfaced set (e.g. cancelled) — clear.
            setJob(null);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Tick the elapsed timer every 30s while the job is in_progress or
  // the cleaner is en route — both surfaces show a "X mins" counter.
  useEffect(() => {
    const ticking = job?.status === 'in_progress' || (job?.on_route_at && job?.status !== 'completed');
    if (!ticking) return;
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, [job?.status, job?.on_route_at]);

  if (!job) return null;

  const cleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean) as string[];
  const cleaners = cleanerIds.map(id => cleanerNames[id] || 'Your cleaner');
  const primaryName = cleaners[0] || 'Your cleaner';
  const primaryFirst = primaryName.split(' ')[0];

  // Pre-arrival: scheduled/confirmed for today and not yet on-route.
  if ((job.status === 'scheduled' || job.status === 'confirmed') && !job.on_route_at) {
    const timeLabel = job.scheduled_time ? format(new Date(`2000-01-01T${job.scheduled_time}`), 'h:mm a') : 'today';
    return (
      <div className="rounded-2xl border border-blue-300/50 bg-blue-50 dark:bg-blue-500/10 p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-blue-100 dark:bg-blue-500/20 p-2">
            <CalendarCheck className="w-5 h-5 text-blue-700 dark:text-blue-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-blue-900 dark:text-blue-100">
              Clean today at {timeLabel}
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200/80">
              {primaryFirst} is your cleaner{cleaners.length > 1 ? `, with ${cleaners[1].split(' ')[0]}` : ''}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // On the way: cleaner has tapped "I'm on the way" but hasn't clocked on yet.
  if ((job.status === 'scheduled' || job.status === 'confirmed') && job.on_route_at) {
    const onRoute = new Date(job.on_route_at);
    const minsAgo = Math.max(0, Math.floor((now.getTime() - onRoute.getTime()) / 60000));
    const agoLabel = minsAgo < 1 ? 'just left' : `left ${minsAgo} min${minsAgo === 1 ? '' : 's'} ago`;
    return (
      <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-500/10 p-5 shadow-lg shadow-amber-500/10">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar className="w-12 h-12 ring-2 ring-amber-400">
              <AvatarFallback className="bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-extrabold">
                {primaryFirst.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 border-2 border-amber-50 dark:border-amber-500/10" />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-amber-900 dark:text-amber-100 text-base">
              {primaryFirst} is on her way to your property
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-amber-800 dark:text-amber-200/80">
              <span className="inline-flex items-center gap-1">
                <Navigation className="w-3.5 h-3.5" /> {agoLabel}
              </span>
              {job.scheduled_time && (
                <>
                  <span className="opacity-50">·</span>
                  <span>scheduled {format(new Date(`2000-01-01T${job.scheduled_time}`), 'h:mm a')}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (job.status === 'completed') {
    return (
      <div className="rounded-2xl border-2 border-primary bg-primary/10 p-5 animate-in fade-in slide-in-from-top-2">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/20 p-2 mt-0.5">
            <CheckCircle2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-extrabold text-primary text-lg">✓ Clean complete</p>
            <p className="text-sm text-foreground/80">
              {primaryFirst} finished cleaning {job.clock_off ? `at ${format(new Date(job.clock_off), 'h:mm a')}` : 'just now'}.
              {' '}Photos and report below.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // in_progress
  const clockOn = job.clock_on ? new Date(job.clock_on) : null;
  const elapsedMin = clockOn ? Math.max(0, Math.floor((now.getTime() - clockOn.getTime()) / 60000)) : 0;
  const elapsedLabel = elapsedMin < 1
    ? 'just arrived'
    : elapsedMin < 60
      ? `${elapsedMin} min${elapsedMin === 1 ? '' : 's'} on site`
      : `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m on site`;

  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-500/10 p-5 shadow-lg shadow-amber-500/10">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="w-12 h-12 ring-2 ring-amber-400">
            <AvatarFallback className="bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-extrabold">
              {primaryFirst.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {/* Pulse dot to communicate "live" */}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary border-2 border-amber-50 dark:border-amber-500/10" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-amber-900 dark:text-amber-100 text-base">
            {primaryFirst} is cleaning your property right now
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-amber-800 dark:text-amber-200/80">
            {clockOn && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Clocked on {format(clockOn, 'h:mm a')}
              </span>
            )}
            <span className="opacity-50">·</span>
            <span className="font-semibold tabular-nums">{elapsedLabel}</span>
            {cleaners.length > 1 && (
              <>
                <span className="opacity-50">·</span>
                <span>+ {cleaners[1].split(' ')[0]}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
