import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Loader2, ChevronRight, MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';

type CompletedJob = {
  id: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  cleaner_1_id: string | null;
  cleaner_2_id: string | null;
  properties?: { property_name: string | null; address: string | null } | null;
  qc_status?: 'pending' | 'audited';
  cleaner_names?: string[];
};

export default function HeadCleanerQCPage() {
  const navigate = useNavigate();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['head-cleaner-qc-jobs'],
    queryFn: async () => {
      const { data: completed, error } = await supabase
        .from('jobs')
        .select(
          'id, scheduled_date, scheduled_time, status, cleaner_1_id, cleaner_2_id, properties(property_name, address)'
        )
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false })
        .limit(40);
      if (error) throw error;

      const jobIds = (completed ?? []).map((j: any) => j.id);
      if (!jobIds.length) return [];

      // Find which jobs already have audits
      const { data: existingAudits } = await supabase
        .from('qc_audits')
        .select('job_id')
        .in('job_id', jobIds);

      const auditedSet = new Set((existingAudits ?? []).map((a: any) => a.job_id));

      // Fetch cleaner names
      const cleanerIds = new Set<string>();
      (completed ?? []).forEach((j: any) => {
        if (j.cleaner_1_id) cleanerIds.add(j.cleaner_1_id);
        if (j.cleaner_2_id) cleanerIds.add(j.cleaner_2_id);
      });

      const profileMap: Record<string, string> = {};
      if (cleanerIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(cleanerIds));
        (profiles ?? []).forEach((p: any) => {
          profileMap[p.id] = p.full_name || 'Unknown';
        });
      }

      return (completed ?? []).map((j: any) => ({
        ...j,
        qc_status: auditedSet.has(j.id) ? 'audited' : 'pending',
        cleaner_names: [j.cleaner_1_id, j.cleaner_2_id]
          .filter(Boolean)
          .map((id: string) => profileMap[id] || 'Unknown'),
      })) as CompletedJob[];
    },
  });

  const pending = jobs.filter((j) => j.qc_status === 'pending');
  const audited = jobs.filter((j) => j.qc_status === 'audited');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" /> Quality Control
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Audit recently completed jobs for hotel-quality standard.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">
          Awaiting QC ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-6 text-center">
            <p className="text-3xl mb-2">✓</p>
            <p className="text-sm text-muted-foreground">All caught up.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((j) => (
              <button
                key={j.id}
                onClick={() => navigate(`/qc/${j.id}`)}
                className="w-full text-left bg-card rounded-2xl border-2 border-accent/40 hover:border-accent p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-base truncate">
                      {j.properties?.property_name || 'Property'}
                    </p>
                    {j.properties?.address && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="h-3 w-3 shrink-0" /> {j.properties.address}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Calendar className="h-3 w-3" />{' '}
                      {j.scheduled_date
                        ? format(new Date(j.scheduled_date), 'EEE d MMM')
                        : '—'}{' '}
                      · {j.cleaner_names?.join(' & ') || 'Unassigned'}
                    </p>
                    <span className="inline-block mt-2 text-[10px] font-bold bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                      AUDIT NEEDED
                    </span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">
          Recently Audited ({audited.length})
        </h2>
        {audited.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No completed audits yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {audited.slice(0, 10).map((j) => (
              <button
                key={j.id}
                onClick={() => navigate(`/qc/${j.id}`)}
                className="w-full text-left bg-card rounded-2xl border border-border hover:shadow-md p-4 transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-sm truncate">
                      {j.properties?.property_name || 'Property'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {j.scheduled_date ? format(new Date(j.scheduled_date), 'd MMM yyyy') : '—'} ·{' '}
                      {j.cleaner_names?.join(' & ') || 'Unassigned'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full shrink-0">
                    AUDITED
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
