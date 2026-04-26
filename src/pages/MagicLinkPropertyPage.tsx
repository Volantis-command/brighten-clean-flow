import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Download, CheckCircle2, AlertTriangle, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { Section, InfoItem } from '@/components/client-portal/Section';
import CompletionPhotoGallery from '@/components/client-portal/CompletionPhotoGallery';
import IssuesList from '@/components/client-portal/IssuesList';
import RateCleanStars from '@/components/client-portal/RateCleanStars';
import PropertyCalendar from '@/components/client-portal/PropertyCalendar';
import TurnaroundPanel from '@/components/client-portal/TurnaroundPanel';

export default function MagicLinkPropertyPage() {
  const { token, id: propertyId } = useParams<{ token: string; id: string }>();
  const navigate = useNavigate();
  const [selectedCleanId, setSelectedCleanId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Resolve the token to a client_id, then check that the requested
  // property belongs to that same client. The portal_token is unique
  // per client_properties row, so we can't require token + property_id
  // on the same row — Dali's row has a different token from the one in
  // the URL, even though Dali belongs to the same client.
  const { data: clientProp, isLoading: loadingToken } = useQuery({
    queryKey: ['magic-validate', token, propertyId],
    queryFn: async () => {
      const { data: tokenRow, error: tokenErr } = await supabase
        .from('client_properties' as any)
        .select('client_id')
        .eq('portal_token', token!)
        .eq('portal_active', true)
        .maybeSingle();
      if (tokenErr) throw tokenErr;
      if (!tokenRow) return null;

      const { data, error } = await supabase
        .from('client_properties' as any)
        .select('*')
        .eq('client_id', (tokenRow as any).client_id)
        .eq('property_id', propertyId!)
        .eq('portal_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!token && !!propertyId,
  });

  const { data: property, isLoading: loadingProp } = useQuery({
    queryKey: ['magic-prop-detail', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', propertyId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId && !!clientProp,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['magic-prop-jobs', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('jobs').select('*').eq('property_id', propertyId!).order('scheduled_date', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId && !!clientProp,
  });

  const cleanerIds = [...new Set(jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))];
  const { data: cleanerProfiles = [] } = useQuery({
    queryKey: ['magic-cleaners', cleanerIds],
    queryFn: async () => {
      if (!cleanerIds.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  const nameMap: Record<string, string> = {};
  cleanerProfiles.forEach((p: any) => { nameMap[p.id] = p.full_name?.split(' ')[0] || 'Cleaner'; });

  const lastCompleteJob = jobs.find((j: any) => j.status === 'complete' || j.status === 'completed');
  const activeJobId = selectedCleanId || lastCompleteJob?.id;

  const { data: photos = [] } = useQuery({
    queryKey: ['magic-photos', activeJobId],
    queryFn: async () => {
      if (!activeJobId) return [];
      const { data } = await supabase.from('photos').select('*').eq('job_id', activeJobId).order('room_label');
      return data || [];
    },
    enabled: !!activeJobId,
  });

  const { data: audits = [] } = useQuery({
    queryKey: ['magic-qc', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('qc_audits').select('*').eq('property_id', propertyId!).order('audit_date', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId && !!clientProp,
  });

  const { data: issues = [] } = useQuery({
    queryKey: ['magic-issues', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('property_issues' as any).select('*').eq('property_id', propertyId!).order('reported_at', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId && !!clientProp,
  });

  const { data: feedback = [] } = useQuery({
    queryKey: ['magic-feedback', propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_feedback')
        .select('job_id, score')
        .eq('property_id', propertyId!)
        .not('score', 'is', null);
      return data || [];
    },
    enabled: !!propertyId && !!clientProp,
  });
  const scoreByJob: Record<string, number> = {};
  (feedback as any[]).forEach((f: any) => { scoreByJob[f.job_id] = f.score; });

  const completedJobs = jobs.filter((j: any) => j.status === 'complete' || j.status === 'completed');
  const upcomingJobs = jobs.filter((j: any) => ['scheduled', 'confirmed'].includes(j.status)).slice(0, 3);
  const latestAudit = audits[0];

  const last5Audits = audits.slice(0, 5);
  const healthScore = last5Audits.length > 0 ? Math.round(last5Audits.reduce((sum: number, a: any) => sum + (a.percentage || 0), 0) / last5Audits.length) : null;
  const prevHealthScore = audits.length >= 2 ? Math.round(audits.slice(1, 6).reduce((s: number, a: any) => s + (a.percentage || 0), 0) / Math.min(audits.length - 1, 5)) : null;
  const healthTrend = healthScore && prevHealthScore ? (healthScore > prevHealthScore ? 'up' : healthScore < prevHealthScore ? 'down' : 'stable') : 'stable';

  const hasIssues = (issues as any[]).some((i: any) => i.status === 'open');
  const isGuestReady = !!lastCompleteJob;

  const isLoading = loadingToken || loadingProp;
  if (isLoading) return <div className="min-h-screen bg-background flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!clientProp || !property) return <div className="min-h-screen bg-background flex flex-col items-center justify-center"><p className="text-4xl mb-3">🔒</p><p className="font-bold">Invalid link</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border/50 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-2xl font-extrabold text-primary" style={{ fontFamily: 'Nunito, sans-serif' }}>Brightly<span className="text-accent">.</span></h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/client/${token}`)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {/* Status Banner */}
        <div className={`rounded-2xl p-5 ${
          hasIssues ? 'bg-destructive/10 border border-destructive/20' :
          isGuestReady ? 'bg-primary/10 border border-primary/20' :
          'bg-muted border border-border'
        }`}>
          <div className="flex items-center gap-3">
            {hasIssues ? <AlertTriangle className="w-6 h-6 text-destructive" /> :
             isGuestReady ? <CheckCircle2 className="w-6 h-6 text-primary" /> :
             <Clock className="w-6 h-6 text-muted-foreground" />}
            <div>
              <p className="font-bold text-lg">
                {hasIssues ? '⚠ Issue Reported' : isGuestReady ? '✓ Guest Ready' : '⏳ Awaiting Clean'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isGuestReady && lastCompleteJob ? `Cleaned ${format(new Date(lastCompleteJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')}` : 'Next clean will appear here'}
              </p>
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-extrabold text-primary">{property.property_name}</h1>
        <p className="text-sm text-muted-foreground -mt-4">{[property.address, property.suburb].filter(Boolean).join(', ')}</p>

        <TurnaroundPanel property={property} />

        <Section title="Calendar">
          <PropertyCalendar jobs={jobs} token={token} propertyId={propertyId!} />
        </Section>

        {/* Health Score */}
        {healthScore !== null && (
          <Section title="Property Health">
            <div className="flex items-center gap-4">
              <div className={`text-3xl font-extrabold ${healthScore >= 85 ? 'text-primary' : healthScore >= 70 ? 'text-orange-500' : 'text-destructive'}`}>
                {healthScore}%
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {healthTrend === 'up' && <><TrendingUp className="w-4 h-4 text-primary" /> Improving</>}
                {healthTrend === 'down' && <><TrendingDown className="w-4 h-4 text-destructive" /> Declining</>}
                {healthTrend === 'stable' && <><Minus className="w-4 h-4" /> Stable</>}
              </div>
            </div>
          </Section>
        )}

        {/* Last Clean Summary */}
        {lastCompleteJob && (
          <Section title="Last Clean Summary">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoItem label="Date" value={format(new Date(lastCompleteJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')} />
              <InfoItem label="Cleaners" value={
                [lastCompleteJob.cleaner_1_id, lastCompleteJob.cleaner_2_id]
                  .filter(Boolean)
                  .map((id: string) => nameMap[id] || 'Cleaner')
                  .join(', ') || '—'
              } />
              {latestAudit && (
                <div>
                  <span className="text-muted-foreground text-xs">QC Score</span>
                  <p className={`font-bold ${(latestAudit.percentage || 0) >= 80 ? 'text-primary' : 'text-orange-500'}`}>
                    {latestAudit.percentage}%
                  </p>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <Section title="Completion Photos">
            <CompletionPhotoGallery photos={photos} />
          </Section>
        )}

        {/* Issues */}
        {(issues as any[]).length > 0 && (
          <Section title="Issues & Flags">
            <IssuesList issues={issues as any[]} />
          </Section>
        )}

        {/* Clean History */}
        <Section title="Clean History">
          <button onClick={() => setHistoryExpanded(!historyExpanded)} className="flex items-center gap-1 text-sm font-semibold text-primary mb-3">
            {completedJobs.length} completed cleans
          </button>
          {historyExpanded && (
            <div className="space-y-2">
              {completedJobs.map((job: any) => {
                const audit = audits.find((a: any) => a.job_id === job.id);
                const isSelected = selectedCleanId === job.id;
                return (
                  <div
                    key={job.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCleanId(job.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCleanId(job.id); } }}
                    className={`w-full text-left rounded-xl p-3 border text-sm transition-colors cursor-pointer ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{format(new Date(job.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')}</span>
                      {audit && <span className={`font-bold text-xs ${(audit.percentage || 0) >= 80 ? 'text-primary' : 'text-orange-500'}`}>{audit.percentage}%</span>}
                    </div>
                    {token && (
                      <div className="mt-2">
                        <RateCleanStars
                          token={token}
                          jobId={job.id}
                          existingScore={scoreByJob[job.id] || null}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Upcoming */}
        <Section title="Upcoming Schedule">
          {upcomingJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming cleans scheduled.</p>
          ) : (
            <div className="space-y-2">
              {upcomingJobs.map((job: any) => (
                <div key={job.id} className="rounded-xl border border-border p-3 text-sm flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{format(new Date(job.scheduled_date + 'T00:00:00'), 'EEEE, dd MMM yyyy')}</p>
                    {job.scheduled_time && <p className="text-xs text-muted-foreground">{job.scheduled_time.slice(0, 5)}</p>}
                  </div>
                  <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">Scheduled</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Download Report */}
        {lastCompleteJob && (
          <Button variant="outline" className="w-full gap-2 font-bold" onClick={() => window.open(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-clean-report?job_id=${activeJobId}`, '_blank')}>
            <Download className="w-4 h-4" /> Download Clean Report
          </Button>
        )}

        <p className="text-center text-muted-foreground text-xs pt-4">Powered by Brightly</p>
      </main>
    </div>
  );
}
