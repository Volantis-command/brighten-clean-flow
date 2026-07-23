import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// Public client-facing page — always read as anon, never the admin's session.
import { supabasePublic as supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, Download, CheckCircle2, AlertTriangle, Clock, TrendingUp, TrendingDown, Minus, MessageCircle, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { format, differenceInHours, differenceInDays, formatDistanceToNow } from 'date-fns';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Section, InfoItem } from '@/components/client-portal/Section';
import IssuesList from '@/components/client-portal/IssuesList';
import PassportEditor from '@/components/client-portal/PassportEditor';
import RateCleanStars from '@/components/client-portal/RateCleanStars';
import TipCleanerButton from '@/components/client-portal/TipCleanerButton';
import AutoApprovalSettings from '@/components/client-portal/AutoApprovalSettings';
import PropertyCalendar from '@/components/client-portal/PropertyCalendar';
import TurnaroundPanel from '@/components/client-portal/TurnaroundPanel';
import RecurringScheduleControls from '@/components/client-portal/RecurringScheduleControls';
import RescheduleJobDialog from '@/components/client-portal/RescheduleJobDialog';
import LiveCleanStatus from '@/components/client-portal/LiveCleanStatus';
import CleanFormsArchive from '@/components/client-portal/CleanFormsArchive';
import ReportIssueDialog from '@/components/client-portal/ReportIssueDialog';
import PendingBookingsCard from '@/components/client-portal/PendingBookingsCard';

export default function MagicLinkPropertyPage() {
  const { token, id: propertyId } = useParams<{ token: string; id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCleanId, setSelectedCleanId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [rescheduleJob, setRescheduleJob] = useState<any | null>(null);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Photos from last clean
  const lastCompleteJobForPhotos = jobs.find((j: any) => j.status === 'complete' || j.status === 'completed');
  const { data: lastCleanPhotos = [] } = useQuery({
    queryKey: ['magic-photos', lastCompleteJobForPhotos?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_photos')
        .select('id, public_url, room_label')
        .eq('job_id', lastCompleteJobForPhotos!.id)
        .order('uploaded_at', { ascending: true })
        .limit(9);
      return data || [];
    },
    enabled: !!lastCompleteJobForPhotos?.id,
  });

  // Portal messages
  const { data: messages = [] } = useQuery({
    queryKey: ['magic-messages', propertyId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('portal_messages')
        .select('id, sender, message, created_at')
        .eq('property_id', propertyId!)
        .order('created_at', { ascending: true })
        .limit(50);
      return data || [];
    },
    enabled: !!propertyId && !!clientProp,
  });

  // Pending booking suggestions awaiting client decision. Service-role
  // edge function handles RLS — direct Supabase reads on
  // booking_suggestions are admin-only.
  const { data: pendingSuggestions = [] } = useQuery({
    queryKey: ['portal-pending-suggestions', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('portal-booking-suggestions', {
        body: { token, property_id: propertyId, action: 'list' },
      });
      if (error || (data as any)?.error) return [];
      return (data as any)?.suggestions || [];
    },
    enabled: !!propertyId && !!clientProp && !!token,
  });
  const scoreByJob: Record<string, number> = {};
  (feedback as any[]).forEach((f: any) => { scoreByJob[f.job_id] = f.score; });

  // Realtime: issues update instantly when cleaner flags something
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase
      .channel(`ml-issues-${propertyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'property_issues', filter: `property_id=eq.${propertyId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['magic-issues', propertyId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [propertyId, queryClient]);

  // Realtime: admin replies appear instantly
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase
      .channel(`ml-messages-${propertyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages', filter: `property_id=eq.${propertyId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['magic-messages', propertyId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [propertyId, queryClient]);

  useEffect(() => {
    if (messagesOpen) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [messagesOpen, messages.length]);

  const sendMessage = async () => {
    if (!messageText.trim() || !propertyId) return;
    setSendingMessage(true);
    const { error } = await (supabase as any).from('portal_messages').insert({
      property_id: propertyId,
      sender: 'client',
      message: messageText.trim(),
    });
    if (error) { toast.error('Could not send message.'); }
    else { setMessageText(''); queryClient.invalidateQueries({ queryKey: ['magic-messages', propertyId] }); }
    setSendingMessage(false);
  };

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
  const openIssues = (issues as any[]).filter((i: any) => i.status === 'open');
  const isGuestReady = !!lastCompleteJob && !hasIssues;

  // Review shield — last 5 jobs with audit scores
  const last5Jobs = completedJobs.slice(0, 5);
  const scoredJobs = last5Jobs.map((job: any) => ({
    job,
    score: (audits as any[]).find((a: any) => a.job_id === job.id)?.percentage ?? null,
  }));
  const avgScore = scoredJobs.filter(s => s.score !== null).length > 0
    ? Math.round(scoredJobs.filter(s => s.score !== null).reduce((acc, s) => acc + (s.score || 0), 0) / scoredJobs.filter(s => s.score !== null).length)
    : null;

  // Next guest countdown — from the first pending Airbnb booking suggestion
  const nextCheckinDate = (pendingSuggestions as any[])[0]?.checkin_date ?? null;
  const nextCheckin = nextCheckinDate ? new Date(nextCheckinDate + 'T00:00:00') : null;
  const hoursToCheckin = nextCheckin ? differenceInHours(nextCheckin, new Date()) : null;
  const daysToCheckin = nextCheckin ? differenceInDays(nextCheckin, new Date()) : null;

  const isLoading = loadingToken || loadingProp;
  if (isLoading) return <div className="min-h-screen bg-background flex justify-center items-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!clientProp || !property) return <div className="min-h-screen bg-background flex flex-col items-center justify-center"><p className="text-4xl mb-3">🔒</p><p className="font-bold">Invalid link</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border/50 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <span className="text-xl font-extrabold text-foreground">Brightly<span style={{ color: '#FEDB00' }}>.</span></span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/client/${token}`)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {/* Live status — pre-arrival, on-the-way, in-progress, complete.
            Hides itself when there's nothing happening today. */}
        <LiveCleanStatus propertyId={propertyId!} cleanerNames={nameMap} />

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

        <h1 className="text-2xl font-extrabold text-foreground">{property.property_name}</h1>
        <p className="text-sm text-muted-foreground -mt-4">{[property.address, property.suburb].filter(Boolean).join(', ')}</p>

        <TurnaroundPanel property={property} />

        {/* Pending Airbnb bookings awaiting client approval — auto-hides
            when there's nothing to action. */}
        <PendingBookingsCard propertyId={propertyId!} token={token} />

        <Section title="Calendar">
          <PropertyCalendar
            jobs={jobs}
            pendingSuggestions={pendingSuggestions}
            token={token}
            propertyId={propertyId!}
          />
        </Section>

        {/* Next guest countdown */}
        {nextCheckin && hoursToCheckin !== null && hoursToCheckin > 0 && (
          <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
            hoursToCheckin < 6 ? 'border-red-400/40 bg-red-500/5' :
            hoursToCheckin < 24 ? 'border-amber-400/40 bg-amber-500/5' :
            'border-border bg-muted/30'
          }`}>
            <div className={`text-3xl font-extrabold tabular-nums ${
              hoursToCheckin < 6 ? 'text-red-500' : hoursToCheckin < 24 ? 'text-amber-500' : 'text-foreground'
            }`}>
              {daysToCheckin! > 0 ? `${daysToCheckin}d` : `${hoursToCheckin}h`}
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">Next guest check-in</p>
              <p className="text-xs text-muted-foreground">{format(nextCheckin, 'EEEE d MMM')}</p>
            </div>
          </div>
        )}

        {/* Review shield — last 5 cleans as colour-coded bars */}
        {scoredJobs.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Clean Quality</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {healthTrend === 'up' && <><TrendingUp className="w-3.5 h-3.5 text-primary" /> Improving</>}
                {healthTrend === 'down' && <><TrendingDown className="w-3.5 h-3.5 text-destructive" /> Declining</>}
                {healthTrend === 'stable' && <><Minus className="w-3.5 h-3.5" /> Stable</>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {scoredJobs.map(({ job, score }) => (
                <div key={job.id} className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-full rounded-lg h-2 ${
                    score === null ? 'bg-muted' :
                    score >= 90 ? 'bg-primary' :
                    score >= 80 ? 'bg-primary/60' :
                    score >= 70 ? 'bg-amber-400' : 'bg-destructive'
                  }`} />
                  {score !== null && <span className="text-[9px] font-bold text-muted-foreground tabular-nums">{score}%</span>}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 5 - scoredJobs.length) }).map((_, i) => (
                <div key={`e-${i}`} className="flex-1"><div className="w-full rounded-lg h-2 bg-muted/40" /></div>
              ))}
            </div>
            <p className="text-sm font-bold text-foreground">
              {avgScore !== null
                ? avgScore >= 90 ? `✓ Exceptional — ${avgScore}% average`
                : avgScore >= 80 ? `✓ Grade A — ${avgScore}% average`
                : `${avgScore}% average across last ${scoredJobs.filter(s => s.score !== null).length} cleans`
                : `${last5Jobs.length} cleans on record`}
            </p>
            <p className="text-xs text-muted-foreground">Based on independent QC audits after each clean</p>
          </div>
        )}

        {/* Last Clean Summary + photos */}
        {lastCompleteJob && (
          <Section title="Last Clean">
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
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
            {(lastCleanPhotos as any[]).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Photos</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(lastCleanPhotos as any[]).map((photo: any) => (
                    <button
                      key={photo.id}
                      onClick={() => lastCompleteJob.report_token && window.open(`/report/${lastCompleteJob.report_token}`, '_blank')}
                      className="relative aspect-square rounded-xl overflow-hidden bg-muted group"
                    >
                      <img src={photo.public_url} alt={photo.room_label || 'Photo'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                      {photo.room_label && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5">
                          <p className="text-[9px] text-white font-semibold truncate">{photo.room_label}</p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {lastCompleteJob.report_token && (
                  <button onClick={() => window.open(`/report/${lastCompleteJob.report_token}`, '_blank')} className="mt-2 text-xs font-semibold text-primary hover:underline">
                    View full report →
                  </button>
                )}
              </div>
            )}
          </Section>
        )}

        {/* Issues */}
        <Section title="Issues & Flags">
          {(issues as any[]).length > 0 ? (
            <div className="mb-3">
              <IssuesList issues={issues as any[]} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">No issues reported. Spot something? Let us know.</p>
          )}
          {token && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setReportIssueOpen(true)}
            >
              <AlertTriangle className="w-4 h-4" /> Report an issue
            </Button>
          )}
        </Section>

        {token && (
          <ReportIssueDialog
            open={reportIssueOpen}
            onOpenChange={setReportIssueOpen}
            token={token}
            propertyId={propertyId!}
            propertyName={property.property_name}
          />
        )}

        {/* Clean Forms Archive — every completed clean, with photos,
            PDF download, ratings, feedback, and tipping. Date-filterable. */}
        <Section title="Clean Forms & History">
          <CleanFormsArchive
            token={token}
            propertyId={propertyId!}
            completedJobs={completedJobs}
            cleanerProfiles={cleanerProfiles}
            audits={audits as any[]}
            scoreByJob={scoreByJob}
          />
        </Section>

        {/* Property Passport — clients edit, admin approves before changes go live */}
        {token && (
          <Section title="Property Details">
            <p className="text-xs text-muted-foreground -mt-1 mb-3">
              Updates here go to admin for approval — you'll see "pending" while they're reviewed.
            </p>
            <PassportEditor token={token} propertyId={propertyId!} property={property} />
          </Section>
        )}

        {/* Upcoming */}
        <Section title="Upcoming Schedule">
          {upcomingJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-3">No upcoming cleans scheduled.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {upcomingJobs.map((job: any) => (
                <div key={job.id} className="rounded-xl border border-border p-3 text-sm flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{format(new Date(job.scheduled_date + 'T00:00:00'), 'EEEE, dd MMM yyyy')}</p>
                    {job.scheduled_time && <p className="text-xs text-muted-foreground">{job.scheduled_time.slice(0, 5)}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">Scheduled</span>
                    {token && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => setRescheduleJob(job)}
                      >
                        Reschedule
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {token && (
            <RecurringScheduleControls token={token} propertyId={propertyId!} />
          )}
        </Section>

        {token && (
          <RescheduleJobDialog
            open={!!rescheduleJob}
            onOpenChange={(o) => { if (!o) setRescheduleJob(null); }}
            token={token}
            propertyId={propertyId!}
            propertyName={property.property_name}
            job={rescheduleJob}
          />
        )}

        {token && (
          <Section title="Automation">
            <AutoApprovalSettings token={token} propertyId={propertyId!} property={property} />
          </Section>
        )}

        {/* Message Brightly */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button
            onClick={() => setMessagesOpen(!messagesOpen)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <MessageCircle className="w-5 h-5 text-primary" />
              <div className="text-left">
                <p className="font-bold text-sm text-foreground">Message Brightly</p>
                <p className="text-xs text-muted-foreground">
                  {(messages as any[]).length > 0 ? `${(messages as any[]).length} message${(messages as any[]).length !== 1 ? 's' : ''}` : 'Ask us anything about your clean'}
                </p>
              </div>
            </div>
            {messagesOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {messagesOpen && (
            <div className="border-t border-border">
              <div className="px-4 py-3 space-y-3 max-h-72 overflow-y-auto">
                {(messages as any[]).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No messages yet. Send us a question about your property.</p>
                )}
                {(messages as any[]).map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.sender === 'client' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'
                    }`}>
                      <p className="leading-snug">{msg.message}</p>
                      <p className={`text-[10px] mt-1 ${msg.sender === 'client' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {msg.sender === 'admin' ? 'Brightly · ' : ''}{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="px-4 py-3 border-t border-border flex gap-2">
                <Textarea
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 min-h-[40px] max-h-32 resize-none rounded-xl text-sm"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                />
                <Button onClick={sendMessage} disabled={!messageText.trim() || sendingMessage} size="icon" className="rounded-xl shrink-0">
                  {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-muted-foreground text-xs pt-4">Powered by Brightly</p>
      </main>
    </div>
  );
}
