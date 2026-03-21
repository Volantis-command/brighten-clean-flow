import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

function getPropertyStatus(jobs: any[], timeEntries: any[]) {
  if (!jobs.length) return { status: 'awaiting', label: 'Awaiting Clean', color: 'bg-muted text-muted-foreground', dot: 'bg-gray-400' };
  
  const latestJob = jobs[0];
  // Check if any cleaner is currently clocked in on this property
  const activeEntry = timeEntries.find(te => te.job_id === latestJob.id && te.clock_in_time && !te.clock_out_time);
  if (activeEntry) return { status: 'in_progress', label: 'Clean in Progress', color: 'bg-accent/20 text-accent-foreground', dot: 'bg-accent' };
  
  if (latestJob.status === 'complete') {
    return { status: 'guest_ready', label: 'Guest Ready', color: 'bg-primary/10 text-primary', dot: 'bg-primary' };
  }
  
  return { status: 'awaiting', label: 'Awaiting Clean', color: 'bg-muted text-muted-foreground', dot: 'bg-gray-400' };
}

export default function ClientPortalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Fetch client's linked properties
  const { data: clientProps = [], isLoading: loadingLinks } = useQuery({
    queryKey: ['client-properties', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_properties' as any)
        .select('property_id, guest_ready_sms, show_invoices, portal_active')
        .eq('client_id', user!.id)
        .eq('portal_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const propertyIds = clientProps.map((cp: any) => cp.property_id);

  // Fetch properties
  const { data: properties = [], isLoading: loadingProps } = useQuery({
    queryKey: ['client-property-details', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .in('id', propertyIds);
      if (error) throw error;
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  // Fetch latest jobs for each property
  const { data: jobs = [] } = useQuery({
    queryKey: ['client-property-jobs', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .in('property_id', propertyIds)
        .order('scheduled_date', { ascending: false })
        .order('scheduled_time', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  // Fetch time entries for active clock detection
  const { data: timeEntries = [] } = useQuery({
    queryKey: ['client-time-entries', propertyIds],
    queryFn: async () => {
      const jobIds = jobs.map((j: any) => j.id);
      if (!jobIds.length) return [];
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .in('job_id', jobIds)
        .is('clock_out_time', null);
      if (error) throw error;
      return data || [];
    },
    enabled: jobs.length > 0,
  });

  // Fetch latest QC scores
  const { data: audits = [] } = useQuery({
    queryKey: ['client-audits', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data, error } = await supabase
        .from('qc_audits')
        .select('property_id, percentage, audit_date')
        .in('property_id', propertyIds)
        .order('audit_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const isLoading = loadingLinks || loadingProps;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-3">🏠</p>
        <p className="text-lg font-bold text-foreground">No properties linked to your account yet.</p>
        <p className="text-sm text-muted-foreground mt-1">Contact Brightly to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-primary">Your Properties</h2>
        <p className="text-sm text-muted-foreground mt-1">Real-time status of your cleaning operations</p>
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
              onClick={() => navigate(`/portal/property/${prop.id}`)}
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
    </div>
  );
}
