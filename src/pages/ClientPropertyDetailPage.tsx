import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, Download, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Clock, MessageSquare, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { toast } from 'sonner';
import CleanBookingForm from '@/components/portal/CleanBookingForm';

export default function ClientPropertyDetailPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCleanId, setSelectedCleanId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Fetch property
  const { data: property, isLoading } = useQuery({
    queryKey: ['client-property', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', propertyId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId,
  });

  // Fetch all jobs for this property
  const { data: jobs = [] } = useQuery({
    queryKey: ['client-property-all-jobs', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('property_id', propertyId!)
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch cleaner profiles for jobs
  const cleanerIds = [...new Set(jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))];
  const { data: cleanerProfiles = [] } = useQuery({
    queryKey: ['client-cleaners', cleanerIds],
    queryFn: async () => {
      if (!cleanerIds.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  const nameMap: Record<string, string> = {};
  cleanerProfiles.forEach((p: any) => { nameMap[p.id] = p.full_name?.split(' ')[0] || 'Cleaner'; });

  const lastCompleteJob = jobs.find((j: any) => j.status === 'complete');
  const activeJobId = selectedCleanId || lastCompleteJob?.id;

  // Fetch time entries for last complete job
  const { data: timeEntries = [] } = useQuery({
    queryKey: ['client-time-entries-job', activeJobId],
    queryFn: async () => {
      if (!activeJobId) return [];
      const { data } = await supabase.from('time_entries').select('*').eq('job_id', activeJobId);
      return data || [];
    },
    enabled: !!activeJobId,
  });

  // Fetch photos for active job
  const { data: photos = [] } = useQuery({
    queryKey: ['client-photos', activeJobId],
    queryFn: async () => {
      if (!activeJobId) return [];
      const { data } = await supabase.from('photos').select('*').eq('job_id', activeJobId).order('room_label');
      return data || [];
    },
    enabled: !!activeJobId,
  });

  // Fetch QC audits
  const { data: audits = [] } = useQuery({
    queryKey: ['client-qc', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('qc_audits').select('*').eq('property_id', propertyId!).order('audit_date', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch issues
  const { data: issues = [] } = useQuery({
    queryKey: ['client-issues', propertyId],
    queryFn: async () => {
      const { data } = await supabase.from('property_issues' as any).select('*').eq('property_id', propertyId!).order('reported_at', { ascending: false });
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch forms for the active job
  const { data: jobForm } = useQuery({
    queryKey: ['client-form', activeJobId],
    queryFn: async () => {
      if (!activeJobId) return null;
      const { data } = await supabase.from('job_forms').select('*').eq('job_id', activeJobId).maybeSingle();
      return data;
    },
    enabled: !!activeJobId,
  });

  // Upcoming jobs
  const upcomingJobs = jobs.filter((j: any) => j.status === 'scheduled' || j.status === 'pending').slice(0, 3);
  const completedJobs = jobs.filter((j: any) => j.status === 'complete');

  // Acknowledge issue mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (issueId: string) => {
      const { error } = await supabase
        .from('property_issues' as any)
        .update({ status: 'acknowledged', acknowledged_by: user!.id } as any)
        .eq('id', issueId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-issues', propertyId] });
      toast.success('Issue acknowledged');
    },
  });

  // Request a clean
  const requestCleanMutation = useMutation({
    mutationFn: async () => {
      // Send notification to all admins
      const { data: adminRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (adminRoles?.length) {
        const notifs = adminRoles.map((r: any) => ({
          user_id: r.user_id,
          message: `Clean request from client for ${property?.property_name}`,
          type: 'clean_request',
        }));
        await supabase.from('notifications').insert(notifs);
      }
    },
    onSuccess: () => toast.success('Clean request sent to Brightly!'),
  });

  // Time entry for active job
  const lastEntry = timeEntries[0];
  const activeTimeEntry = timeEntries.find((te: any) => te.clock_in_time && !te.clock_out_time);
  const latestAudit = audits.find((a: any) => a.job_id === activeJobId) || audits[0];

  // Group photos by room
  const photosByRoom: Record<string, any[]> = {};
  photos.forEach((p: any) => {
    const room = p.room_label || 'General';
    if (!photosByRoom[room]) photosByRoom[room] = [];
    photosByRoom[room].push(p);
  });

  // Consumables from form data
  const formData = jobForm?.form_data as any;
  const consumables = formData?.consumables || null;

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!property) return <div className="p-6 text-center text-muted-foreground">Property not found</div>;

  // Status banner
  const isInProgress = !!activeTimeEntry;
  const isGuestReady = lastCompleteJob && !isInProgress;
  const hasIssues = issues.some((i: any) => i.status === 'open');

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20">
      <Button variant="ghost" size="sm" onClick={() => navigate('/portal')} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      {/* Status Banner */}
      <div className={`rounded-2xl p-5 ${
        hasIssues ? 'bg-destructive/10 border border-destructive/20' :
        isInProgress ? 'bg-accent/10 border border-accent/20' :
        isGuestReady ? 'bg-primary/10 border border-primary/20' :
        'bg-muted border border-border'
      }`}>
        <div className="flex items-center gap-3">
          {hasIssues ? <AlertTriangle className="w-6 h-6 text-destructive" /> :
           isInProgress ? <Clock className="w-6 h-6 text-accent" /> :
           isGuestReady ? <CheckCircle2 className="w-6 h-6 text-primary" /> :
           <Clock className="w-6 h-6 text-muted-foreground" />}
          <div>
            <p className="font-bold text-lg">
              {hasIssues ? '⚠ Issue Reported' :
               isInProgress ? '🧹 Clean in Progress' :
               isGuestReady ? '✓ Guest Ready' : '⏳ Awaiting Clean'}
            </p>
            <p className="text-sm text-muted-foreground">
              {isGuestReady && lastCompleteJob ? `Cleaned ${format(new Date(lastCompleteJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')} by Brightly` :
               isInProgress && lastEntry ? `Started ${format(new Date(lastEntry.clock_in_time!), 'h:mm a')}` :
               'Next clean will appear here when scheduled'}
            </p>
          </div>
        </div>
      </div>

      <h1 className="text-2xl font-extrabold text-primary">{property.property_name}</h1>
      <p className="text-sm text-muted-foreground -mt-4">{[property.address, property.suburb].filter(Boolean).join(', ')}</p>

      {/* Last Clean Summary */}
      {lastCompleteJob && (
        <Section title="Last Clean Summary">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoItem label="Date" value={format(new Date(lastCompleteJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')} />
            <InfoItem label="Duration" value={
              lastEntry?.total_minutes ? `${Math.floor(lastEntry.total_minutes / 60)}h ${lastEntry.total_minutes % 60}m` : '—'
            } />
            <InfoItem label="Cleaners" value={
              [lastCompleteJob.cleaner_1_id, lastCompleteJob.cleaner_2_id]
                .filter(Boolean)
                .map((id: string) => nameMap[id] || 'Cleaner')
                .join(', ') || '—'
            } />
            {latestAudit && (
              <div>
                <span className="text-muted-foreground text-xs">QC Score</span>
                <p className={`font-bold ${(latestAudit.percentage || 0) >= 80 ? 'text-primary' : (latestAudit.percentage || 0) >= 60 ? 'text-orange-500' : 'text-destructive'}`}>
                  {latestAudit.percentage}%
                </p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Photo Gallery */}
      {Object.keys(photosByRoom).length > 0 && (
        <Section title="Photo Gallery">
          {Object.entries(photosByRoom).map(([room, roomPhotos]) => (
            <div key={room} className="mb-4">
              <p className="text-sm font-bold text-foreground mb-2">{room}</p>
              <div className="grid grid-cols-3 gap-2">
                {roomPhotos.map((photo: any) => (
                  <a key={photo.id} href={photo.file_url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={photo.file_url} alt={room} className="w-full h-24 object-cover rounded-xl" loading="lazy" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Issues & Flags */}
      {issues.length > 0 && (
        <Section title="Issues & Flags">
          <div className="space-y-3">
            {(issues as any[]).map((issue) => (
              <div key={issue.id} className={`rounded-xl p-4 border ${issue.status === 'open' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/50'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{issue.room}</p>
                    <p className="text-sm text-muted-foreground">{issue.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(issue.reported_at), 'dd MMM yyyy, h:mm a')}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    issue.status === 'open' ? 'bg-destructive/10 text-destructive' :
                    issue.status === 'acknowledged' ? 'bg-accent/20 text-accent-foreground' :
                    'bg-primary/10 text-primary'
                  }`}>
                    {issue.status}
                  </span>
                </div>
                {issue.photo_url && (
                  <img src={issue.photo_url} alt="Issue" className="w-24 h-24 object-cover rounded-lg mt-2" />
                )}
                {issue.status === 'open' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 text-xs"
                    onClick={() => acknowledgeMutation.mutate(issue.id)}
                    disabled={acknowledgeMutation.isPending}
                  >
                    Acknowledge
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Consumables Status */}
      {consumables && (
        <Section title="Consumables Status">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(consumables).map(([item, status]) => (
              <div key={item} className="flex items-center gap-2 text-sm">
                <span className={status === 'out' ? 'text-destructive font-bold' : status === 'low' ? 'text-orange-500 font-semibold' : 'text-primary'}>
                  {status === 'ok' ? '✓' : status === 'low' ? '⚠' : '✗'}
                </span>
                <span className="capitalize">{item.replace(/_/g, ' ')}</span>
                {status === 'out' && <span className="text-xs text-destructive font-bold">OUT</span>}
                {status === 'low' && <span className="text-xs text-orange-500 font-bold">Low</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Clean History */}
      <Section title="Clean History">
        <button onClick={() => setHistoryExpanded(!historyExpanded)} className="flex items-center gap-1 text-sm font-semibold text-primary mb-3">
          {historyExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                  <p className="text-xs text-muted-foreground">
                    {[job.cleaner_1_id, job.cleaner_2_id].filter(Boolean).map((id: string) => nameMap[id] || 'Cleaner').join(', ')}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* Upcoming Schedule */}
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
        <Button
          variant="outline"
          className="w-full mt-3 font-bold"
          onClick={() => requestCleanMutation.mutate()}
          disabled={requestCleanMutation.isPending}
        >
          Request a Clean
        </Button>
      </Section>

      {/* Download Report */}
      {lastCompleteJob && (
        <Button
          variant="outline"
          className="w-full gap-2 font-bold"
          onClick={() => {
            window.open(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-clean-report?job_id=${activeJobId}`, '_blank');
          }}
        >
          <Download className="w-4 h-4" /> Download Clean Report
        </Button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5">
      <h3 className="text-base font-bold text-primary mb-3">{title}</h3>
      {children}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-semibold text-sm text-foreground">{value}</p>
    </div>
  );
}
