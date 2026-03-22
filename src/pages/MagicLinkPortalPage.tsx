import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

function getPropertyStatus(jobs: any[], timeEntries: any[]) {
  if (!jobs.length) return { status: 'awaiting', label: 'Awaiting Clean', color: 'bg-muted text-muted-foreground', dot: 'bg-gray-400' };
  const latestJob = jobs[0];
  const activeEntry = timeEntries.find(te => te.job_id === latestJob.id && te.clock_in_time && !te.clock_out_time);
  if (activeEntry) return { status: 'in_progress', label: 'Clean in Progress', color: 'bg-accent/20 text-accent-foreground', dot: 'bg-accent' };
  if (latestJob.status === 'complete') return { status: 'guest_ready', label: 'Guest Ready', color: 'bg-primary/10 text-primary', dot: 'bg-primary' };
  return { status: 'awaiting', label: 'Awaiting Clean', color: 'bg-muted text-muted-foreground', dot: 'bg-gray-400' };
}

export default function MagicLinkPortalPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  // Look up client_properties by portal_token
  const { data: clientProp, isLoading: loadingToken, error: tokenError } = useQuery({
    queryKey: ['magic-link', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_properties' as any)
        .select('*')
        .eq('portal_token', token!)
        .eq('portal_active', true);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!token,
  });

  const propertyIds = (clientProp || []).map((cp: any) => cp.property_id);
  const clientId = clientProp?.[0]?.client_id;

  // Fetch properties
  const { data: properties = [], isLoading: loadingProps } = useQuery({
    queryKey: ['magic-properties', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data, error } = await supabase.from('properties').select('*').in('id', propertyIds);
      if (error) throw error;
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  // Fetch client profile
  const { data: profile } = useQuery({
    queryKey: ['magic-profile', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data } = await supabase.from('profiles').select('full_name').eq('id', clientId).single();
      return data;
    },
    enabled: !!clientId,
  });

  // Fetch jobs
  const { data: jobs = [] } = useQuery({
    queryKey: ['magic-jobs', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase.from('jobs').select('*').in('property_id', propertyIds).order('scheduled_date', { ascending: false });
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  // Time entries
  const { data: timeEntries = [] } = useQuery({
    queryKey: ['magic-time', propertyIds],
    queryFn: async () => {
      const jobIds = jobs.map((j: any) => j.id);
      if (!jobIds.length) return [];
      const { data } = await supabase.from('time_entries').select('*').in('job_id', jobIds).is('clock_out_time', null);
      return data || [];
    },
    enabled: jobs.length > 0,
  });

  // QC audits
  const { data: audits = [] } = useQuery({
    queryKey: ['magic-audits', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase.from('qc_audits').select('property_id, percentage, audit_date').in('property_id', propertyIds).order('audit_date', { ascending: false });
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const isLoading = loadingToken || loadingProps;
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFDFC] flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientProp?.length || tokenError) {
    return (
      <div className="min-h-screen bg-[#FDFDFC] flex flex-col items-center justify-center px-4">
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-lg font-bold text-foreground">Invalid or inactive portal link</p>
        <p className="text-sm text-muted-foreground mt-1">Contact Brightly for a new link.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFC]">
      <header className="bg-white border-b border-border/50 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-primary" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Brightly<span className="text-accent">.</span>
            </h1>
            <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Portal</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-primary">Good {greeting}, {firstName}</h2>
          <p className="text-sm text-muted-foreground mt-1">Here's your properties</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {properties.map((prop: any) => {
            const propJobs = jobs.filter((j: any) => j.property_id === prop.id);
            const statusInfo = getPropertyStatus(propJobs, timeEntries);
            const lastCompleteJob = propJobs.find((j: any) => j.status === 'complete');
            const nextScheduledJob = propJobs.find((j: any) => j.status === 'scheduled' || j.status === 'pending');
            const latestAudit = audits.find((a: any) => a.property_id === prop.id);

            return (
              <button
                key={prop.id}
                onClick={() => navigate(`/client/${token}/property/${prop.id}`)}
                className="bg-white rounded-2xl shadow-sm border border-border/50 p-5 text-left hover:shadow-md transition-shadow w-full"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{prop.property_name}</h3>
                    <p className="text-sm text-muted-foreground">{[prop.address, prop.suburb].filter(Boolean).join(', ')}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusInfo.color}`}>
                    <div className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
                    {statusInfo.label}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Last cleaned</span>
                    <p className="font-semibold text-foreground">
                      {lastCompleteJob ? format(new Date(lastCompleteJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy') : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Next clean</span>
                    <p className="font-semibold text-foreground">
                      {nextScheduledJob ? format(new Date(nextScheduledJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy') : '—'}
                    </p>
                  </div>
                  {latestAudit && (
                    <div>
                      <span className="text-muted-foreground">QC Score</span>
                      <p className={`font-bold ${(latestAudit.percentage || 0) >= 80 ? 'text-primary' : (latestAudit.percentage || 0) >= 60 ? 'text-orange-500' : 'text-destructive'}`}>
                        {latestAudit.percentage}%
                      </p>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-muted-foreground text-xs pt-8">Powered by Brightly</p>
      </main>
    </div>
  );
}
