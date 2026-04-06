import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface TrackerData {
  job: any;
  property: any;
  cleanerName: string;
  cleanerScore: number | null;
  cleanerJobCount: number;
  checklistItems: any[];
  completions: any[];
}

const STATUS_CONFIGS: Record<string, { bg: string; icon: string; label: string }> = {
  scheduled: { bg: 'bg-blue-500', icon: '🚗', label: 'Cleaner on the way' },
  confirmed: { bg: 'bg-blue-500', icon: '🚗', label: 'Cleaner on the way' },
  in_progress: { bg: 'bg-accent', icon: '🧹', label: 'Clean in progress' },
  completed: { bg: 'bg-green-500', icon: '✅', label: 'Property is Guest Ready' },
};

export default function LiveTrackerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [data, setData] = useState<TrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchData = async () => {
    if (!jobId) { setNotFound(true); setLoading(false); return; }

    const { data: job } = await supabase
      .from('jobs')
      .select('*, properties(property_name, address, suburb, client_type)')
      .eq('id', jobId)
      .maybeSingle();

    if (!job) { setNotFound(true); setLoading(false); return; }

    const property = (job as any).properties;
    const cleanerId = job.cleaner_1_id;
    let cleanerName = 'Your cleaner';
    let cleanerScore: number | null = null;
    let cleanerJobCount = 0;

    if (cleanerId) {
      const { data: profile } = await supabase.from('profiles').select('full_name, audit_scores').eq('id', cleanerId).maybeSingle();
      if (profile) {
        cleanerName = profile.full_name || 'Your cleaner';
        const scores = profile.audit_scores || [];
        if (scores.length > 0) {
          cleanerScore = parseFloat((scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1));
        }
      }
      const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true })
        .eq('cleaner_1_id', cleanerId).eq('status', 'completed');
      cleanerJobCount = count || 0;
    }

    const { data: checklistItems } = await supabase
      .from('property_sop_items')
      .select('*')
      .eq('property_id', job.property_id!)
      .eq('active', true)
      .order('room').order('sort_order');

    const { data: completions } = await supabase
      .from('job_checklist_completions')
      .select('*')
      .eq('job_id', job.id);

    setData({
      job, property,
      cleanerName, cleanerScore, cleanerJobCount,
      checklistItems: checklistItems || [],
      completions: completions || [],
    });
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [jobId]);

  // Realtime subscription for live updates
  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`tracker-${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_checklist_completions', filter: `job_id=eq.${jobId}` }, () => fetchData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">Tracker not found</h1>
        <p className="text-muted-foreground mt-2">This link may be invalid or the job doesn't exist.</p>
      </div>
    );
  }

  const { job, property, cleanerName, cleanerScore, cleanerJobCount, checklistItems, completions } = data;
  const completionSet = new Set(completions.filter((c: any) => c.completed).map((c: any) => c.sop_item_id));
  const completedCount = checklistItems.filter((i: any) => completionSet.has(i.id)).length;
  const totalItems = checklistItems.length;

  const statusKey = job.status === 'completed' ? 'completed' : job.status === 'in_progress' ? 'in_progress' : 'scheduled';
  const statusConfig = STATUS_CONFIGS[statusKey] || STATUS_CONFIGS.scheduled;

  // Group items by room
  const roomGroups: Record<string, any[]> = {};
  checklistItems.forEach((item: any) => {
    const room = item.room || 'General';
    if (!roomGroups[room]) roomGroups[room] = [];
    roomGroups[room].push(item);
  });

  // ETA calculation
  const avgMinPerRoom = 8;
  const roomsRemaining = Object.keys(roomGroups).length - Object.keys(roomGroups).filter(room =>
    roomGroups[room].every((i: any) => completionSet.has(i.id))
  ).length;

  const startedAt = job.clock_on ? new Date(job.clock_on) : job.check_in_time ? new Date(job.check_in_time) : null;
  const etaMinutes = roomsRemaining * avgMinPerRoom;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary px-5 pt-6 pb-5">
        <h1 className="text-xl font-extrabold text-primary-foreground tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span className="text-accent">.</span>
        </h1>
        <div className="mt-3">
          <h2 className="text-lg font-bold text-primary-foreground">{property?.property_name || property?.address || 'Property'}</h2>
          <p className="text-primary-foreground/70 text-sm">{[property?.address, property?.suburb].filter(Boolean).join(', ')}</p>
          <p className="text-primary-foreground/70 text-sm mt-1">{job.scheduled_date ? format(new Date(job.scheduled_date + 'T00:00:00'), 'EEEE, d MMMM yyyy') : ''}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-primary-foreground text-sm font-semibold">{cleanerName}</span>
            {cleanerScore && (
              <span className="text-sm text-accent font-bold">★ {cleanerScore}</span>
            )}
            {cleanerJobCount > 0 && (
              <span className="text-primary-foreground/50 text-xs">· {cleanerJobCount} cleans</span>
            )}
          </div>
        </div>
      </div>

      {/* Status banner */}
      <div className={`${statusConfig.bg} px-5 py-4 text-white`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{statusConfig.icon}</span>
          <div>
            <p className={`font-bold text-sm ${statusKey === 'in_progress' ? 'text-foreground' : 'text-white'}`}>{statusConfig.label}</p>
            {statusKey === 'in_progress' && startedAt && (
              <p className={`text-xs ${statusKey === 'in_progress' ? 'text-foreground/70' : 'text-white/80'}`}>
                Started {format(startedAt, 'h:mmaaa')}
                {etaMinutes > 0 ? ` · Est. complete in ~${etaMinutes} min` : ''}
              </p>
            )}
            {statusKey === 'completed' && job.check_out_time && (
              <p className="text-xs text-white/80">Completed {format(new Date(job.check_out_time), 'h:mmaaa')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Room checklist */}
      <div className="px-4 py-5 space-y-3 max-w-lg mx-auto">
        {totalItems > 0 ? (
          Object.entries(roomGroups).map(([room, items]) => {
            const roomDone = items.every((i: any) => completionSet.has(i.id));
            const lastCompletion = completions
              .filter((c: any) => c.completed && items.some((i: any) => i.id === c.sop_item_id))
              .sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())[0];

            return (
              <div key={room} className={`rounded-xl border-2 p-4 transition-all ${roomDone ? 'border-green-400 bg-green-50' : 'border-border bg-card'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{roomDone ? '✅' : '⏳'}</span>
                    <span className="font-bold text-foreground text-sm">{room}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {roomDone && lastCompletion?.completed_at
                      ? `Done at ${format(new Date(lastCompletion.completed_at), 'h:mmaaa')}`
                      : 'Pending'}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No checklist items configured for this property.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center py-6 border-t border-border mt-4">
        <p className="text-xs text-muted-foreground">Powered by Brightly. · Gold Coast's trusted cleaning network</p>
        <a href="tel:0418878707" className="text-xs text-primary font-semibold mt-1 inline-block">Need help? Contact us</a>
      </footer>
    </div>
  );
}
