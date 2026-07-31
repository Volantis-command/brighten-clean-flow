import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
// Client portal is now behind a real login, so it uses the SESSION-bound client
// (supabasePublic has persistSession:false and would never see the session).
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInMinutes } from 'date-fns';
import { ArrowLeft, Loader2, Download, CheckCircle2, AlertTriangle, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, InfoItem } from '@/components/client-portal/Section';
import IssuesList from '@/components/client-portal/IssuesList';
import CleanerProfileChip from '@/components/client-portal/CleanerProfileChip';
import LiveCleanStatus from '@/components/client-portal/LiveCleanStatus';
import PendingBookingsCard from '@/components/client-portal/PendingBookingsCard';
import PropertyInvoicesTab from '@/components/property/PropertyInvoicesTab';

export default function ClientPortalPropertyPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string | null>(null);
  const [selectedCleanId, setSelectedCleanId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem('brightly_client_id');
    if (!id) {
      navigate('/client-portal', { replace: true });
      return;
    }
    setClientId(id);
  }, [navigate]);

  const { data: property, isLoading } = useQuery({
    queryKey: ['cp-property', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', propertyId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId && !!clientId,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['cp-property-jobs', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('jobs').select('*').eq('property_id', propertyId!).order('scheduled_date', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId && !!clientId,
  });

  const cleanerIds = [...new Set(jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))];
  const { data: cleanerProfiles = [] } = useQuery({
    queryKey: ['cp-cleaners', cleanerIds],
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

  const { data: audits = [] } = useQuery({
    queryKey: ['cp-qc', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('qc_audits').select('*').eq('property_id', propertyId!).order('audit_date', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId && !!clientId,
  });

  const { data: issues = [] } = useQuery({
    queryKey: ['cp-issues', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('property_issues' as any).select('*').eq('property_id', propertyId!).order('reported_at', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId && !!clientId,
  });

  // See note in ClientPortalDashboardPage — awaiting_cleaner is still
  // a scheduled job from the client's view.
  const UPCOMING_STATUSES = [
    'scheduled',
    'confirmed',
    'awaiting_cleaner',
    'awaiting_cleaner_acceptance',
    'in_progress',
  ];
  const completedJobs = jobs.filter((j: any) => j.status === 'complete' || j.status === 'completed');
  const upcomingJobs = jobs.filter((j: any) => UPCOMING_STATUSES.includes(j.status)).slice(0, 3);
  const latestAudit = audits[0];

  const last5Audits = audits.slice(0, 5);
  const healthScore = last5Audits.length > 0 ? Math.round(last5Audits.reduce((sum: number, a: any) => sum + (a.percentage || 0), 0) / last5Audits.length) : null;
  const prevHealthScore = audits.length >= 2 ? Math.round(audits.slice(1, 6).reduce((s: number, a: any) => s + (a.percentage || 0), 0) / Math.min(audits.length - 1, 5)) : null;
  const healthTrend = healthScore && prevHealthScore ? (healthScore > prevHealthScore ? 'up' : healthScore < prevHealthScore ? 'down' : 'stable') : 'stable';

  const hasIssues = (issues as any[]).some((i: any) => i.status === 'open');
  const isGuestReady = !!lastCompleteJob;

  if (isLoading || !clientId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!property) {
    return <div className="p-6 text-center text-muted-foreground">Property not found</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span className="text-accent">.</span>
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-20">
        <Button variant="ghost" size="sm" onClick={() => navigate('/client-portal/dashboard')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {/* Real-time clock-on indicator — banner appears live when a
            cleaner taps Clock On at this property. Auto-disappears when
            they finish (with a brief celebration card). Adds the
            Uber-style "your cleaner just arrived" moment. */}
        <LiveCleanStatus propertyId={propertyId!} cleanerNames={nameMap} />

        {/* Pending Airbnb bookings (iCal sync) awaiting client decision.
            Auto-hides when nothing is pending. */}
        <PendingBookingsCard propertyId={propertyId!} />

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

        {/* Photos live inside the clean report (`/report/:report_token`)
            alongside the cleaner checklist, signatures, QC score, and
            issues — the property page links into the report rather than
            duplicating its content. Brendan 2026-04-28: "we do not need
            these photos here, we only need the completed cleaner form." */}

        {/* Issues */}
        {(issues as any[]).length > 0 && (
          <Section title="Issues & Flags">
            <IssuesList issues={issues as any[]} />
          </Section>
        )}

        {/* Invoices for this property */}
        <Section title="Invoices">
          <PropertyInvoicesTab propertyId={propertyId!} showAdminTools={false} />
        </Section>

        {/* Clean History */}
        <Section title="Clean History">
          <button onClick={() => setHistoryExpanded(!historyExpanded)} className="flex items-center gap-1 text-sm font-semibold text-primary mb-3">
            {completedJobs.length} completed cleans
          </button>
          {historyExpanded && (
            <div className="space-y-2">
              {completedJobs.map((job: any) => {
                const audit = audits.find((a: any) => a.job_id === job.id);
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedCleanId(job.id)}
                    className={`w-full text-left rounded-xl p-3 border text-sm transition-colors ${selectedCleanId === job.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{format(new Date(job.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')}</span>
                      {audit && (
                        <span className={`font-bold text-xs ${(audit.percentage || 0) >= 80 ? 'text-primary' : 'text-orange-500'}`}>
                          {audit.percentage}%
                        </span>
                      )}
                    </div>
                  </button>
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

        {/* View Clean Report — opens the in-app /report/:token page
            which includes photos, checklist, completion form, signatures,
            and a print-to-PDF option. */}
        {lastCompleteJob && (
          <Button
            variant="outline"
            className="w-full gap-2 font-bold"
            onClick={() => {
              const job = jobs.find((j: any) => j.id === activeJobId) || lastCompleteJob;
              if (job?.report_token) {
                window.open(`/report/${job.report_token}`, '_blank');
              } else {
                // Older jobs without a report_token fall back to the
                // legacy edge function endpoint.
                window.open(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-clean-report?job_id=${activeJobId}`, '_blank');
              }
            }}
          >
            <Download className="w-4 h-4" /> View / print clean report
          </Button>
        )}
      </div>
    </div>
  );
}
