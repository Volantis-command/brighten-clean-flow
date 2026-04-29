import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInHours, differenceInDays, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft, Loader2, Download, CheckCircle2, AlertTriangle, Clock,
  TrendingUp, TrendingDown, Minus, MessageCircle, Send, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Section, InfoItem } from '@/components/client-portal/Section';
import IssuesList from '@/components/client-portal/IssuesList';
import CleanerProfileChip from '@/components/client-portal/CleanerProfileChip';
import LiveCleanStatus from '@/components/client-portal/LiveCleanStatus';
import PropertyInvoicesTab from '@/components/property/PropertyInvoicesTab';
import { toast } from 'sonner';

export default function ClientPortalPropertyPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [selectedCleanId, setSelectedCleanId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = localStorage.getItem('brightly_client_id');
    if (!id) {
      navigate('/client-portal', { replace: true });
      return;
    }
    setClientId(id);
  }, [navigate]);

  // Property
  const { data: property, isLoading } = useQuery({
    queryKey: ['cp-property', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', propertyId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId && !!clientId,
  });

  // Jobs (all)
  const { data: jobs = [] } = useQuery({
    queryKey: ['cp-property-jobs', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('jobs').select('*').eq('property_id', propertyId!).order('scheduled_date', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId && !!clientId,
  });

  // Cleaner names
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

  // QC audits
  const { data: audits = [] } = useQuery({
    queryKey: ['cp-qc', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('qc_audits').select('*').eq('property_id', propertyId!).order('audit_date', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId && !!clientId,
  });

  // Issues (realtime-refreshed via subscription below)
  const { data: issues = [] } = useQuery({
    queryKey: ['cp-issues', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('property_issues' as any).select('*').eq('property_id', propertyId!).order('reported_at', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId && !!clientId,
  });

  // Next Airbnb booking suggestion (for guest countdown)
  const { data: nextBooking } = useQuery({
    queryKey: ['cp-next-booking', propertyId],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('booking_suggestions' as any)
        .select('checkin_date, checkout_date, guest_name, status')
        .eq('property_id', propertyId!)
        .in('status', ['pending', 'approved', 'confirmed'])
        .gte('checkin_date', today)
        .order('checkin_date', { ascending: true })
        .limit(1);
      return (data || [])[0] as { checkin_date: string; checkout_date: string | null; guest_name: string | null; status: string } | null;
    },
    enabled: !!propertyId && !!clientId,
    refetchInterval: 60_000,
  });

  // Photos from last clean
  const lastCompleteJob = jobs.find((j: any) => j.status === 'complete' || j.status === 'completed');
  const { data: lastCleanPhotos = [] } = useQuery({
    queryKey: ['cp-photos', lastCompleteJob?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_photos')
        .select('id, public_url, room_label')
        .eq('job_id', lastCompleteJob!.id)
        .order('uploaded_at', { ascending: true })
        .limit(9);
      return data || [];
    },
    enabled: !!lastCompleteJob?.id,
  });

  // Portal messages
  const { data: messages = [] } = useQuery({
    queryKey: ['cp-messages', propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('portal_messages' as any)
        .select('id, sender, message, created_at, read')
        .eq('property_id', propertyId!)
        .order('created_at', { ascending: true })
        .limit(50);
      return data || [];
    },
    enabled: !!propertyId && !!clientId,
  });

  // Realtime: re-fetch issues when cleaner flags something during a clean
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase
      .channel(`portal-issues-${propertyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'property_issues', filter: `property_id=eq.${propertyId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['cp-issues', propertyId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [propertyId, queryClient]);

  // Realtime: re-fetch messages when admin replies
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase
      .channel(`portal-messages-${propertyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages', filter: `property_id=eq.${propertyId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['cp-messages', propertyId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [propertyId, queryClient]);

  // Scroll to latest message when thread opens or new message arrives
  useEffect(() => {
    if (messagesOpen) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messagesOpen, messages.length]);

  // Derived state
  const UPCOMING_STATUSES = ['scheduled', 'confirmed', 'awaiting_cleaner', 'awaiting_cleaner_acceptance', 'in_progress'];
  const completedJobs = jobs.filter((j: any) => j.status === 'complete' || j.status === 'completed');
  const upcomingJobs = jobs.filter((j: any) => UPCOMING_STATUSES.includes(j.status)).slice(0, 3);
  const latestAudit = audits[0];
  const activeJobId = selectedCleanId || lastCompleteJob?.id;

  // Review shield — last 5 completed cleans with audit scores
  const last5Jobs = completedJobs.slice(0, 5);
  const scoredJobs = last5Jobs.map((job: any) => {
    const audit = audits.find((a: any) => a.job_id === job.id);
    return { job, score: audit?.percentage ?? null };
  });
  const gradedCount = scoredJobs.filter(s => s.score !== null && s.score >= 80).length;
  const avgScore = scoredJobs.filter(s => s.score !== null).length > 0
    ? Math.round(scoredJobs.filter(s => s.score !== null).reduce((acc, s) => acc + (s.score || 0), 0) / scoredJobs.filter(s => s.score !== null).length)
    : null;
  const healthTrend = (() => {
    const prev5 = audits.slice(1, 6);
    if (!avgScore || prev5.length === 0) return 'stable';
    const prevAvg = Math.round(prev5.reduce((s: number, a: any) => s + (a.percentage || 0), 0) / prev5.length);
    return avgScore > prevAvg ? 'up' : avgScore < prevAvg ? 'down' : 'stable';
  })();

  // Next guest countdown
  const nextCheckin = nextBooking?.checkin_date ? new Date(nextBooking.checkin_date + 'T00:00:00') : null;
  const hoursToCheckin = nextCheckin ? differenceInHours(nextCheckin, new Date()) : null;
  const daysToCheckin = nextCheckin ? differenceInDays(nextCheckin, new Date()) : null;

  // Open issues
  const hasIssues = (issues as any[]).some((i: any) => i.status === 'open');
  const openIssues = (issues as any[]).filter((i: any) => i.status === 'open');
  const isGuestReady = !!lastCompleteJob && !hasIssues;

  const sendMessage = async () => {
    if (!messageText.trim() || !propertyId) return;
    setSendingMessage(true);
    const { error } = await supabase.from('portal_messages' as any).insert({
      property_id: propertyId,
      sender: 'client',
      message: messageText.trim(),
    } as any);
    if (error) {
      toast.error('Could not send message. Please try again.');
    } else {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['cp-messages', propertyId] });
    }
    setSendingMessage(false);
  };

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

        {/* Real-time cleaner status — covers "on the way", "in progress", "complete" */}
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
                {hasIssues ? '⚠ Issue Flagged' : isGuestReady ? '✓ Guest Ready' : '⏳ Awaiting Clean'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isGuestReady && lastCompleteJob
                  ? `Cleaned ${format(new Date(lastCompleteJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')}`
                  : hasIssues
                  ? `${openIssues.length} open issue${openIssues.length !== 1 ? 's' : ''} — see below`
                  : 'Next clean will appear here'}
              </p>
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-extrabold text-primary">{property.property_name}</h1>
        <p className="text-sm text-muted-foreground -mt-4">{[property.address, property.suburb].filter(Boolean).join(', ')}</p>

        {/* ── Next guest countdown ───────────────────────────────────── */}
        {nextCheckin && hoursToCheckin !== null && hoursToCheckin > 0 && (
          <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
            hoursToCheckin < 6
              ? 'border-red-400/40 bg-red-500/5'
              : hoursToCheckin < 24
              ? 'border-amber-400/40 bg-amber-500/5'
              : 'border-border bg-muted/30'
          }`}>
            <div className={`text-3xl font-extrabold tabular-nums ${
              hoursToCheckin < 6 ? 'text-red-500' : hoursToCheckin < 24 ? 'text-amber-500' : 'text-foreground'
            }`}>
              {daysToCheckin! > 0 ? `${daysToCheckin}d` : `${hoursToCheckin}h`}
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">
                Next guest check-in
              </p>
              <p className="text-xs text-muted-foreground">
                {format(nextCheckin, 'EEEE d MMM')}
                {nextBooking?.guest_name ? ` · ${nextBooking.guest_name}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* ── Review Shield ──────────────────────────────────────────── */}
        {scoredJobs.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Clean Quality</p>
              {avgScore !== null && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {healthTrend === 'up' && <><TrendingUp className="w-3.5 h-3.5 text-primary" /> Improving</>}
                  {healthTrend === 'down' && <><TrendingDown className="w-3.5 h-3.5 text-destructive" /> Declining</>}
                  {healthTrend === 'stable' && <><Minus className="w-3.5 h-3.5" /> Stable</>}
                </div>
              )}
            </div>
            {/* Score dots for last 5 cleans */}
            <div className="flex items-center gap-2">
              {scoredJobs.map(({ job, score }, i) => (
                <div key={job.id} className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-full rounded-lg h-2 ${
                    score === null ? 'bg-muted' :
                    score >= 90 ? 'bg-primary' :
                    score >= 80 ? 'bg-primary/60' :
                    score >= 70 ? 'bg-amber-400' : 'bg-destructive'
                  }`} />
                  {score !== null && (
                    <span className="text-[9px] font-bold text-muted-foreground tabular-nums">{score}%</span>
                  )}
                </div>
              ))}
              {/* Empty placeholder dots if fewer than 5 cleans */}
              {Array.from({ length: Math.max(0, 5 - scoredJobs.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="flex flex-col items-center gap-1 flex-1">
                  <div className="w-full rounded-lg h-2 bg-muted/40" />
                </div>
              ))}
            </div>
            <p className="text-sm font-bold text-foreground">
              {avgScore !== null
                ? avgScore >= 90
                  ? `✓ Exceptional — ${avgScore}% average across last ${scoredJobs.filter(s => s.score !== null).length} cleans`
                  : avgScore >= 80
                  ? `✓ Grade A — ${avgScore}% average across last ${scoredJobs.filter(s => s.score !== null).length} cleans`
                  : `${avgScore}% average across last ${scoredJobs.filter(s => s.score !== null).length} cleans`
                : `${last5Jobs.length} cleans on record`}
            </p>
            <p className="text-xs text-muted-foreground">Based on independent QC audits after each clean</p>
          </div>
        )}

        {/* ── Last Clean Summary ─────────────────────────────────────── */}
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

            {/* Photo thumbnails from the last clean */}
            {lastCleanPhotos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Photos</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(lastCleanPhotos as any[]).map((photo) => (
                    <button
                      key={photo.id}
                      onClick={() => {
                        const job = jobs.find((j: any) => j.id === lastCompleteJob.id);
                        if (job?.report_token) {
                          window.open(`/report/${job.report_token}`, '_blank');
                        }
                      }}
                      className="relative aspect-square rounded-xl overflow-hidden bg-muted group"
                    >
                      <img
                        src={photo.public_url}
                        alt={photo.room_label || 'Clean photo'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      {photo.room_label && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5">
                          <p className="text-[9px] text-white font-semibold truncate">{photo.room_label}</p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {lastCompleteJob.report_token && (
                  <button
                    onClick={() => window.open(`/report/${lastCompleteJob.report_token}`, '_blank')}
                    className="mt-2 text-xs font-semibold text-primary hover:underline"
                  >
                    View full report →
                  </button>
                )}
              </div>
            )}
          </Section>
        )}

        {/* ── Issues & Flags ─────────────────────────────────────────── */}
        {(issues as any[]).length > 0 && (
          <Section title="Issues & Flags">
            <IssuesList issues={issues as any[]} />
          </Section>
        )}

        {/* ── Message Brightly ───────────────────────────────────────── */}
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
                  {(messages as any[]).length > 0
                    ? `${(messages as any[]).length} message${(messages as any[]).length !== 1 ? 's' : ''}`
                    : 'Ask us anything about your clean'}
                </p>
              </div>
            </div>
            {messagesOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {messagesOpen && (
            <div className="border-t border-border">
              {/* Message thread */}
              <div className="px-4 py-3 space-y-3 max-h-72 overflow-y-auto">
                {(messages as any[]).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No messages yet. Send us a question or note about your property.
                  </p>
                )}
                {(messages as any[]).map((msg: any) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.sender === 'client'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted text-foreground rounded-bl-md'
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

              {/* Input */}
              <div className="px-4 py-3 border-t border-border flex gap-2">
                <Textarea
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 min-h-[40px] max-h-32 resize-none rounded-xl text-sm"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!messageText.trim() || sendingMessage}
                  size="icon"
                  className="rounded-xl shrink-0"
                >
                  {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Invoices ───────────────────────────────────────────────── */}
        <Section title="Invoices">
          <PropertyInvoicesTab propertyId={propertyId!} showAdminTools={false} />
        </Section>

        {/* ── Clean History ──────────────────────────────────────────── */}
        <Section title="Clean History">
          <button onClick={() => setHistoryExpanded(!historyExpanded)} className="flex items-center gap-1 text-sm font-semibold text-primary mb-3">
            {completedJobs.length} completed cleans {historyExpanded ? '↑' : '↓'}
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

        {/* ── Upcoming Schedule ──────────────────────────────────────── */}
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

        {/* View / print clean report */}
        {lastCompleteJob && (
          <Button
            variant="outline"
            className="w-full gap-2 font-bold"
            onClick={() => {
              const job = jobs.find((j: any) => j.id === activeJobId) || lastCompleteJob;
              if (job?.report_token) {
                window.open(`/report/${job.report_token}`, '_blank');
              } else {
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
